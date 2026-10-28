"use server";

import { requireProfile } from "@/lib/auth";
import { buildBroadReachShipment } from "@/lib/broadreach";
import { broadReachBulkMaxBytes, type BroadReachBulkPreview } from "@/lib/broadreach-bulk";
import { parseBroadReachBulkRows } from "@/lib/broadreach-bulk-parser";
import { getBroadReachConfig, getBroadReachSender } from "@/lib/broadreach-server";
import { readBulkFileRows } from "@/lib/bulk-shipments";
import { createClient } from "@/lib/supabase/server";
import type { Shipment } from "@/lib/shipments";

export async function previewBroadReachBulk(_state: BroadReachBulkPreview, form: FormData): Promise<BroadReachBulkPreview> {
  const profile = await requireProfile(["super_admin", "operations_admin", "dispatcher"]);
  const config = getBroadReachConfig(profile.organization_id);
  const fail = (message: string): BroadReachBulkPreview => ({ status: "error", message, rows: [] });
  if (!config || !profile.organization_id) return fail("BroadReach is not configured for this courier company.");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return fail("Choose the filled BroadReach CSV or Excel file.");
  if (file.size > broadReachBulkMaxBytes) return fail("The BroadReach file must be 2 MB or smaller.");
  let parcels: ReturnType<typeof parseBroadReachBulkRows>;
  try { parcels = parseBroadReachBulkRows(await readBulkFileRows(file)); }
  catch (issue) { return fail(issue instanceof Error ? issue.message : "The file could not be read. Download a fresh template."); }
  const sender = getBroadReachSender(profile.organization_id);
  if (!sender) return fail("FastDrop sender address is not configured. Check GTA_AIRSKIP_PICKUP_ADDRESS in Vercel Production.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("shipments").select("*").eq("organization_id", profile.organization_id).in("tracking_number", parcels.map(parcel => parcel.awb)).is("deleted_at", null);
  if (error) return fail("Shipments could not be checked. No bookings were sent; try the preview again.");
  const shipments = new Map((data ?? []).map(shipment => [shipment.tracking_number, shipment as Shipment]));
  const rows = parcels.map(parcel => {
    const shipment = shipments.get(parcel.awb);
    try {
      if (!shipment) throw new Error("FastDrop AWB was not found in this courier company. Upload the shipment first.");
      const payload = buildBroadReachShipment(shipment, config.account, { ...parcel.options, sender, test: true });
      return { ...parcel, status: "ready" as const, message: "Ready for booking", service: payload.shipment.service };
    } catch (issue) { return { ...parcel, status: "invalid" as const, message: issue instanceof Error ? issue.message : "Review shipment and item details." }; }
  });
  const ready = rows.filter(row => row.status === "ready").length;
  return { status: ready ? "success" : "error", message: `${ready} of ${rows.length} parcels passed validation. Preview creates no labels. Booking repeats all authorization and shipment checks.`, rows };
}
