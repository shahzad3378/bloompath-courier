import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBulkAwbPdfArchive, type BulkAwbLabel } from "@/lib/bulk-awb-pdf";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active" || !["super_admin", "operations_admin", "dispatcher"].includes(profile.role) || !profile.organization_id) {
    return new Response("Unauthorized", { status: 403 });
  }
  let ids: unknown;
  try { ids = (await request.json()).bookingIds; } catch { return new Response("Invalid request", { status: 400 }); }
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) || new Set(ids).size !== ids.length) {
    return new Response("Provide 1-100 unique booking IDs.", { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("broadreach_bookings")
    .select("id,shipment_id,label_base64,label_format")
    .eq("organization_id", profile.organization_id)
    .in("id", ids)
    .in("status", ["generated", "ready"]);
  if (error || !data || data.length !== ids.length) return new Response("One or more labels are unavailable.", { status: 409 });
  const shipmentIds = [...new Set(data.map(row => row.shipment_id))];
  const { data: shipments, error: shipmentError } = await admin.from("shipments").select("id,tracking_number").eq("organization_id", profile.organization_id).in("id", shipmentIds);
  if (shipmentError || !shipments || shipments.length !== shipmentIds.length) return new Response("Shipment lookup failed.", { status: 409 });
  const names = new Map(shipments.map(s => [s.id, s.tracking_number]));
  const byId = new Map(data.map(row => [row.id, row]));
  const labels: BulkAwbLabel[] = [];
  for (const id of ids as string[]) {
    const row = byId.get(id);
    if (!row?.label_base64 || !["pdf", "png", "zpl"].includes(row.label_format) || !names.get(row.shipment_id)) return new Response("One or more saved labels are incomplete.", { status: 409 });
    labels.push({ awb: names.get(row.shipment_id)!, format: row.label_format as BulkAwbLabel["format"], base64: row.label_base64 });
  }
  try {
    const archive = await createBulkAwbPdfArchive(labels);
    return new Response(Buffer.from(archive.zip), { headers: {
      "Content-Type": "application/zip", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'attachment; filename="broadreach-awb-pdfs.zip"',
    } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unable to prepare PDFs.", { status: 422 });
  }
}
