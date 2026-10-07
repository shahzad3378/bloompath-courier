"use server";
import { requireProfile } from "@/lib/auth";
import { buildGtaShipment } from "@/lib/gta-airskip";
import { gtaBulkMaxBytes, parseGtaBulkRows, type GtaBulkPreview } from "@/lib/gta-bulk";
import { getGtaConfig, getGtaPickup } from "@/lib/gta-airskip-server";
import { readBulkFileRows } from "@/lib/bulk-shipments";
import { createClient } from "@/lib/supabase/server";
import type { Shipment } from "@/lib/shipments";
export async function previewGtaBulk(_state: GtaBulkPreview, form: FormData): Promise<GtaBulkPreview> {
  const profile = await requireProfile(["super_admin", "operations_admin", "dispatcher"]);
  const fail = (message: string): GtaBulkPreview => ({ status: "error", message, rows: [] });
  if (!profile.organization_id || !getGtaConfig(profile.organization_id)) return fail("GTA is not configured for this courier company.");
  const pickup = getGtaPickup(profile.organization_id);
  if (!pickup) return fail("Configure the FastDrop sender address before bulk booking.");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > gtaBulkMaxBytes) return fail("Choose a non-empty CSV or Excel file, 2 MB or smaller.");
  let parcels;
  try { parcels = parseGtaBulkRows(await readBulkFileRows(file), String(form.get("terminal") ?? "")); }
  catch (issue) { return fail(issue instanceof Error ? issue.message : "The file could not be read."); }
  const { data, error } = await (await createClient()).from("shipments").select("*").eq("organization_id", profile.organization_id).in("tracking_number", parcels.map(p => p.awb)).is("deleted_at", null);
  if (error) return fail("Shipments could not be checked. Try preview again. No labels were requested.");
  const shipments = new Map((data ?? []).map(s => [s.tracking_number, s as Shipment]));
  const rows = parcels.map(parcel => {
    const shipment = shipments.get(parcel.awb);
    try {
      if (!shipment) throw new Error("AWB not found. Import this FastDrop shipment first.");
      buildGtaShipment(shipment, { ...parcel.options, pickup });
      return { ...parcel, status: "ready" as const, destination: shipment.consignee_country_code ?? undefined, message: "Ready for booking" };
    } catch (issue) { return { ...parcel, status: "invalid" as const, message: issue instanceof Error ? issue.message : "Review parcel details." }; }
  });
  const ready = rows.filter(r => r.status === "ready").length;
  return { status: ready ? "success" : "error", message: `${ready} of ${rows.length} parcels ready. Preview creates no labels.`, rows };
}
