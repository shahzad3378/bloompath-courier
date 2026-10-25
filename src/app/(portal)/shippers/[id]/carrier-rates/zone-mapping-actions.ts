"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const editRoles = ["super_admin", "operations_admin"] as const;
const readRoles = ["super_admin", "operations_admin", "finance_staff"] as const;
const maxFileBytes = 5 * 1024 * 1024;

function field(form: FormData, key: string, max = 120) {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

async function cardContext(cardId: string, shipperId: string, organizationId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("carrier_rate_cards")
    .select("id,shipper_id,country_code,import_status")
    .eq("id", cardId).eq("shipper_id", shipperId)
    .eq("organization_id", organizationId).eq("import_status", "active").maybeSingle();
  return data;
}

export type SingleZoneMapState = { status: "idle" | "success" | "error"; message: string };
export const initialSingleZoneMapState: SingleZoneMapState = { status: "idle", message: "" };

export async function saveCarrierServiceZoneMappingAction(_state: SingleZoneMapState, form: FormData): Promise<SingleZoneMapState> {
  const profile = await requireProfile(editRoles);
  if (!profile.organization_id) return { status: "error", message: "This account is not linked to a courier company." };
  const cardId = field(form, "rate_card_id");
  const shipperId = field(form, "shipper_id");
  const zoneId = Number(field(form, "service_zone_id"));
  const zoneCode = field(form, "zone_code", 30).toUpperCase();
  if (!/^[0-9a-f-]{36}$/i.test(cardId) || !/^[0-9a-f-]{36}$/i.test(shipperId) || !Number.isInteger(zoneId) || zoneId <= 0) return { status: "error", message: "Open this mapping from the correct rate card." };

  const admin = createAdminClient();
  const card = await cardContext(cardId, shipperId, profile.organization_id);
  const { data: zone } = await admin.from("service_zones").select("id")
    .eq("id", zoneId).eq("organization_id", profile.organization_id)
    .eq("country_code", card?.country_code || "").eq("is_active", true).maybeSingle();
  if (!card || !zone) return { status: "error", message: "The service zone and active rate card must use the same market." };

  const key = { organization_id: profile.organization_id, rate_card_id: cardId, service_zone_id: zoneId };
  if (!zoneCode) {
    const { error } = await admin.from("carrier_service_zone_map").delete().match(key);
    if (error) return { status: "error", message: "The existing mapping could not be removed. Retry." };
  } else {
    const { data: rateZone } = await admin.from("carrier_rate_grid").select("zone_code")
      .eq("organization_id", profile.organization_id).eq("rate_card_id", cardId).eq("zone_code", zoneCode).limit(1).maybeSingle();
    if (!rateZone) return { status: "error", message: "Choose a 3PL zone code from this rate card." };
    const { error } = await admin.from("carrier_service_zone_map").upsert({ ...key, zone_code: zoneCode, created_by: profile.id, updated_at: new Date().toISOString() }, { onConflict: "rate_card_id,service_zone_id" });
    if (error) return { status: "error", message: "The mapping could not be saved. Retry." };
  }
  revalidatePath(`/shippers/${shipperId}/carrier-rates`);
  return { status: "success", message: zoneCode ? "Zone mapping saved." : "Zone mapping removed." };
}

export type BulkZoneMapState = { status: "idle" | "success" | "error"; message: string };
export const initialBulkZoneMapState: BulkZoneMapState = { status: "idle", message: "" };

export async function bulkMapCarrierServiceZonesAction(_state: BulkZoneMapState, form: FormData): Promise<BulkZoneMapState> {
  const profile = await requireProfile(editRoles);
  if (!profile.organization_id) return { status: "error", message: "This account is not linked to a courier company." };
  const cardId = field(form, "rate_card_id");
  const shipperId = field(form, "shipper_id");
  const file = form.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(cardId) || !/^[0-9a-f-]{36}$/i.test(shipperId)) return { status: "error", message: "Open the mapping upload from a valid rate card." };
  if (!(file instanceof File) || !file.size || file.size > maxFileBytes || !/\.xlsx$/i.test(file.name)) return { status: "error", message: "Choose an Excel .xlsx mapping file up to 5 MB." };

  const admin = createAdminClient();
  const card = await cardContext(cardId, shipperId, profile.organization_id);
  if (!card) return { status: "error", message: "This active rate card was not found for the selected shipper." };

  let rows: Array<{ action: "MAP" | "UNMAP"; service_zone_id: number; zone_code?: string }>;
  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const workbookBytes = Buffer.from(await file.arrayBuffer());
    await workbook.xlsx.load(workbookBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("Zone Mappings") || workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) return { status: "error", message: "The workbook has no mapping rows." };
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => {
      const key = String(cell.text || cell.value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (key) headers.set(key, column);
    });
    const idCol = headers.get("service_zone_id");
    const actionCol = headers.get("action");
    const codeCol = headers.get("3pl_zone_code") || headers.get("zone_code");
    if (!idCol || !actionCol || !codeCol) return { status: "error", message: "Use the Zone Mappings template with Action, Service Zone ID and 3PL Zone Code columns." };

    rows = [];
    const seen = new Set<number>();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const actionText = String(row.getCell(actionCol).text || row.getCell(actionCol).value || "").trim().toUpperCase();
      const idText = String(row.getCell(idCol).text || row.getCell(idCol).value || "").trim();
      const code = String(row.getCell(codeCol).text || row.getCell(codeCol).value || "").trim().toUpperCase();
      if (!actionText && !code && !idText) continue;
      const action = (actionText || (code ? "MAP" : "")) as "MAP" | "UNMAP";
      const zoneId = Number(idText);
      if (!Number.isInteger(zoneId) || zoneId <= 0 || !["MAP", "UNMAP"].includes(action) || (action === "MAP" && !code)) {
        return { status: "error", message: `Row ${rowNumber} is invalid. Set MAP with a 3PL zone code, or UNMAP to remove a mapping.` };
      }
      if (seen.has(zoneId)) return { status: "error", message: `Service Zone ID ${zoneId} appears more than once. Keep only one row per zone.` };
      seen.add(zoneId);
      rows.push({ action, service_zone_id: zoneId, ...(action === "MAP" ? { zone_code: code } : {}) });
      if (rows.length > 3000) return { status: "error", message: "The mapping file is limited to 3,000 rows." };
    }
  } catch {
    return { status: "error", message: "The Excel file could not be read. Download a fresh mapping template and try again." };
  }
  if (!rows.length) return { status: "error", message: "No MAP or UNMAP rows were found. Fill the template and try again." };

  const { data, error } = await admin.rpc("apply_carrier_service_zone_mappings", {
    p_organization_id: profile.organization_id,
    p_actor_id: profile.id,
    p_rate_card_id: cardId,
    p_mappings: rows,
  });
  if (error) {
    console.error("CARRIER_SERVICE_ZONE_BULK_MAP_ERROR", error.message);
    return { status: "error", message: "Nothing was saved. Check that each service zone belongs to this destination country and each 3PL zone code exists in this rate card." };
  }
  const result = data as { mapped?: number; unmapped?: number } | null;
  revalidatePath(`/shippers/${shipperId}/carrier-rates`);
  return { status: "success", message: `Saved ${result?.mapped ?? 0} zone mapping${result?.mapped === 1 ? "" : "s"} and removed ${result?.unmapped ?? 0}.` };
}
