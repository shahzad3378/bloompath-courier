import { getCurrentProfile } from "@/lib/auth";
import { manifestRoles } from "@/lib/three-pl-manifests";
import { createClient } from "@/lib/supabase/server";
import { getThreePLLoadNumbers } from "@/lib/three-pl-load-numbers";
import { resolveAwbBrandName } from "@/lib/tenant-branding";
import { exportThreePLManifest, type ManifestExportRow } from "@/lib/three-pl-manifest-export";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ format: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active" || !profile.organization_id || !manifestRoles.some((role) => role === profile.role)) return new Response("Unauthorized", { status: 403 });
  const { format } = await params;
  if (format !== "pdf" && format !== "excel") return new Response("Unsupported export format.", { status: 400 });
  const rawIds = new URL(request.url).searchParams.getAll("shipment_id");
  if (!rawIds.length || rawIds.length > 500 || rawIds.some((id) => !/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id)))) return new Response("Select 1 to 500 valid shipments.", { status: 400 });
  const ids = [...new Set(rawIds.map(Number))];
  const supabase = await createClient();
  const [{ data: links, error }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("third_party_shipment_links").select("shipment_id,partner_tracking_number,handed_over_at,third_party_carriers!inner(name),shipments!inner(tracking_number,consignee_name,consignee_city,pieces)").eq("organization_id", profile.organization_id).in("shipment_id", ids).is("shipments.deleted_at", null),
    supabase.from("organization_settings").select("awb_brand_name,display_name").eq("organization_id", profile.organization_id).maybeSingle(),
  ]);
  if (error || settingsError) return new Response("Manifest data could not be loaded. Please retry.", { status: 503 });
  if (!links || links.length !== ids.length) return new Response("One or more shipments are unavailable in your company or are not assigned to a 3PL.", { status: 404 });
  try {
    const loads = await getThreePLLoadNumbers(profile.organization_id, links);
    const rows: ManifestExportRow[] = links.map((link) => { const shipment = Array.isArray(link.shipments) ? link.shipments[0] : link.shipments; const carrier = Array.isArray(link.third_party_carriers) ? link.third_party_carriers[0] : link.third_party_carriers;
      return { ...shipment, partner_name: carrier.name, load_number: loads.get(link.shipment_id) || null, partner_tracking_number: link.partner_tracking_number }; }).sort((a, b) => a.tracking_number.localeCompare(b.tracking_number));
    const uniqueLoads = [...new Set(rows.map((row) => row.load_number).filter(Boolean))];
    const number = uniqueLoads.length === 1 ? uniqueLoads[0]! : `3PL-Loads-${new Date().toISOString().slice(0, 10)}`;
    return await exportThreePLManifest({ company: resolveAwbBrandName(settings), number, status: links.every((link) => link.handed_over_at) ? "Handed over" : links.some((link) => link.handed_over_at) ? "Mixed handover status" : "Assigned - handover not confirmed", rows }, format);
  } catch { return new Response("Manifest export failed. Please retry.", { status: 503 }); }
}
