"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { allBillingRows } from "@/lib/billing-workspace";
import { readZoneRateWorkbook, zoneRateMaxBytes, type ImportedZoneRate } from "@/lib/zone-rate-import";

export type ZoneRateImportState = { status: "idle" | "preview" | "success" | "error"; message: string; count?: number; currency?: string; preview?: ImportedZoneRate[] };
export type ZoneRepriceState = { status: "idle" | "preview" | "success" | "error"; message: string; changed?: number; previewToken?: string; totals?: { currency: string; before: number; after: number }[] };
export async function repriceZoneChargesAction(_state: ZoneRepriceState, form: FormData): Promise<ZoneRepriceState> {
  const profile = await requireProfile(["super_admin", "operations_admin", "finance_staff"]);
  const shipperId = String(form.get("shipper_id") || "");
  if (!profile.organization_id || !/^[0-9a-f-]{36}$/i.test(shipperId)) return { status: "error", message: "Invalid shipper account." };
  const apply = form.get("phase") === "apply";
  const { data, error } = await (await createClient()).rpc("reprice_unbilled_zone_charges", { target_shipper_id: shipperId, target_apply: apply, target_preview_token: apply ? String(form.get("preview_token") || "") : null });
  if (error || !data) return { status: "error", message: "Charges could not be recalculated. Rates or shipments may have changed; refresh the preview and try again. No changes were saved." };
  const result = data as { preview_token: string; changed: number; skipped: number; totals: Record<string, { before: number; after: number }> };
  if (apply) { revalidatePath("/finance"); revalidatePath("/finance/invoices/new"); revalidatePath("/reports/finance"); }
  return { status: apply ? "success" : "preview", changed: result.changed, previewToken: result.preview_token, totals: Object.entries(result.totals).map(([currency, values]) => ({ currency, before: Number(values.before), after: Number(values.after) })), message: `${apply ? "Updated" : "Preview:"} ${result.changed} unbilled AWBs with changed zone charges. ${result.skipped} AWBs have no matching zone/service/currency rate and are unchanged. Issued invoices and settled AWBs are excluded.` };
}
export async function importZoneRatesAction(_state: ZoneRateImportState, form: FormData): Promise<ZoneRateImportState> {
  const profile = await requireProfile(["super_admin", "operations_admin", "finance_staff"]);
  const shipperId = String(form.get("shipper_id") || "");
  const file = form.get("file");
  if (!profile.organization_id || !/^[0-9a-f-]{36}$/i.test(shipperId)) return { status: "error", message: "Open the upload from a valid shipper account." };
  if (!(file instanceof File) || !file.size || file.size > zoneRateMaxBytes || !/\.xlsx$/i.test(file.name)) return { status: "error", message: "Choose an .xlsx zone-rate workbook up to 5 MB." };
  const db = await createClient();
  const { data: shipper } = await db.from("profiles").select("id").eq("id", shipperId).eq("organization_id", profile.organization_id).eq("role", "shipper").maybeSingle();
  if (!shipper) return { status: "error", message: "This shipper is not in your courier company." };
  try {
    const [currency, zones] = await Promise.all([
      resolveOrganizationCurrency(db, profile.organization_id),
      allBillingRows((from, to) => db.from("service_zones").select("id,name,country_code").eq("organization_id", profile.organization_id!).eq("is_active", true).order("id").range(from, to)),
    ]);
    const rates = await readZoneRateWorkbook(Buffer.from(await file.arrayBuffer()), zones, currency, shipperId);
    if (form.get("phase") !== "import") return { status: "preview", message: `${rates.length} valid zone rates in ${currency}. Review the preview, then confirm import for this shipper.`, count: rates.length, currency, preview: rates.slice(0, 10) };
    const { data: count, error } = await db.rpc("import_shipper_zone_rates", { target_shipper_id: shipperId, target_rates: rates });
    if (error) { console.error("ZONE_RATE_IMPORT_ERROR", error.code); return { status: "error", message: "Rates were not saved. Existing rates remain unchanged. Check for a future rate on the same tier and retry." }; }
    revalidatePath(`/shippers/${shipperId}/zone-rates`); revalidatePath(`/shippers/${shipperId}`); revalidatePath("/reports/finance");
    return { status: "success", count: Number(count), currency, message: `${count} zone rates imported in ${currency} for this shipper. Matching tiers were replaced with history preserved. Existing invoice charges were not changed.` };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "The workbook could not be validated. No rates were changed." }; }
}
