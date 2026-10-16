"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { carrierRateMaxBytes, parseCarrierRateWorkbook } from "@/lib/carrier-rate-import";
import { createAdminClient } from "@/lib/supabase/admin";

const rateRoles = ["super_admin", "operations_admin", "finance_staff"] as const;
export type CarrierRateImportState = { status: "idle" | "success" | "error"; message: string; cardId?: string; gridCount?: number; postalCount?: number };

function value(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }

function carrierCode(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/broad\s*reach/.test(normalized)) return "BROADREACH";
  if (normalized.includes("gta") && normalized.includes("airskip")) return "GTA_AIRSKIP";
  return normalized.replace(/\s+/g, "_").toUpperCase().slice(0, 40) || "CARRIER";
}

async function upsertInBatches(admin: ReturnType<typeof createAdminClient>, table: "carrier_rate_grid" | "carrier_postal_zone_map", rows: Record<string, unknown>[], onConflict: string) {
  const batchSize = 4_000;
  let nextBatch = 0;
  let failure: string | null = null;
  const worker = async () => {
    while (!failure) {
      const batchIndex = nextBatch++;
      const offset = batchIndex * batchSize;
      if (offset >= rows.length) return;
      const { error } = await admin.from(table).upsert(rows.slice(offset, offset + batchSize), { onConflict, ignoreDuplicates: false });
      if (error) failure = error.message;
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (failure) throw new Error(failure);
}

export async function importCarrierRateCardAction(_state: CarrierRateImportState, form: FormData): Promise<CarrierRateImportState> {
  const profile = await requireProfile(rateRoles);
  if (!profile.organization_id) return { status: "error", message: "This account is not linked to a courier company." };
  const shipperId = value(form, "shipper_id");
  if (!/^[0-9a-f-]{36}$/i.test(shipperId)) return { status: "error", message: "Open the rate upload from a valid shipper account." };
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > carrierRateMaxBytes) return { status: "error", message: "Choose an .xlsx rate workbook up to 5 MB." };
  if (!/\.xlsx$/i.test(file.name)) return { status: "error", message: "Upload an Excel .xlsx workbook." };

  const carrierName = value(form, "carrier_name");
  const countryCode = value(form, "country_code") || "CA";
  const currency = value(form, "currency") || "CAD";
  const cardName = value(form, "card_name");
  const effectiveFrom = value(form, "effective_from");
  if (carrierName.length < 2 || carrierName.length > 120) return { status: "error", message: "Enter a valid 3PL name." };

  let parsed: Awaited<ReturnType<typeof parseCarrierRateWorkbook>>;
  try { parsed = await parseCarrierRateWorkbook(file, { countryCode, currency, cardName, effectiveFrom }); }
  catch (issue) { return { status: "error", message: issue instanceof Error ? issue.message : "The workbook could not be read." }; }

  const admin = createAdminClient();
  const { data: shipper, error: shipperError } = await admin.from("profiles").select("id").eq("id", shipperId).eq("organization_id", profile.organization_id).eq("role", "shipper").maybeSingle();
  if (shipperError || !shipper) return { status: "error", message: "This shipper is not available in your courier account." };

  const code = carrierCode(carrierName);
  const { data: carrier, error: carrierError } = await admin.from("third_party_carriers").upsert({
    organization_id: profile.organization_id,
    name: carrierName,
    code,
    integration_mode: code === "BROADREACH" || code === "GTA_AIRSKIP" ? "api" : "manual",
    is_active: true,
    created_by: profile.id,
  }, { onConflict: "organization_id,code" }).select("id").single();
  if (carrierError || !carrier) {
    console.error("CARRIER_RATE_CARRIER_SAVE_ERROR", carrierError);
    return { status: "error", message: "3PL could not be added. Check its name and try again." };
  }

  const { data: card, error: cardError } = await admin.from("carrier_rate_cards").insert({
    organization_id: profile.organization_id,
    shipper_id: shipperId,
    carrier_id: carrier.id,
    card_name: parsed.cardName,
    country_code: parsed.countryCode,
    currency: parsed.currency,
    source_filename: file.name.slice(0, 240),
    effective_from: parsed.effectiveFrom,
    import_status: "importing",
    is_active: false,
    imported_by: profile.id,
  }).select("id").single();
  if (cardError || !card) {
    console.error("CARRIER_RATE_CARD_CREATE_ERROR", cardError);
    return { status: "error", message: "Rate card could not be started. Confirm the currency is enabled for this account." };
  }

  const gridRows = parsed.grid.map((row) => ({ ...row, organization_id: profile.organization_id, rate_card_id: card.id }));
  const postalRows = parsed.postalZones.map((row) => ({ ...row, organization_id: profile.organization_id, rate_card_id: card.id }));
  try {
    await upsertInBatches(admin, "carrier_rate_grid", gridRows, "rate_card_id,service_code,origin_terminal,zone_code,weight_value,weight_unit");
    await upsertInBatches(admin, "carrier_postal_zone_map", postalRows, "rate_card_id,service_code,origin_terminal,postal_code");
    const { error: activateError } = await admin.from("carrier_rate_cards").update({ import_status: "active", is_active: true, grid_row_count: gridRows.length, postal_mapping_count: postalRows.length, activated_at: new Date().toISOString() }).eq("id", card.id).eq("organization_id", profile.organization_id);
    if (activateError) throw new Error(activateError.message);
    const { error: deactivateError } = await admin.from("carrier_rate_cards").update({ is_active: false }).eq("organization_id", profile.organization_id).eq("shipper_id", shipperId).eq("carrier_id", carrier.id).eq("country_code", parsed.countryCode).neq("id", card.id);
    if (deactivateError) throw new Error(deactivateError.message);
  } catch (issue) {
    console.error("CARRIER_RATE_IMPORT_ERROR", { cardId: card.id, issue });
    await admin.from("carrier_rate_cards").delete().eq("id", card.id).eq("organization_id", profile.organization_id);
    return { status: "error", message: "Rate import failed before activation. The incomplete rate card was removed; no partial rates are active." };
  }

  revalidatePath(`/shippers/${shipperId}/carrier-rates`);
  revalidatePath(`/shippers/${shipperId}`);
  revalidatePath("/shippers");
  return { status: "success", cardId: card.id, gridCount: gridRows.length, postalCount: postalRows.length, message: `Imported ${gridRows.length.toLocaleString()} rate rows and ${postalRows.length.toLocaleString()} postal-zone mappings for ${carrierName}.` };
}
