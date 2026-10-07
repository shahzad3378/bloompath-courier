import { getManifest, manifestStatusLabels } from "@/lib/three-pl-manifests";
import { resolveAwbBrandName } from "@/lib/tenant-branding";
import { exportThreePLManifest } from "@/lib/three-pl-manifest-export";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await params;
  if (format !== "pdf" && format !== "excel") return new Response("Unsupported export format.", { status: 400 });
  const { manifest, items, profile, supabase } = await getManifest(id);
  const { data: settings, error } = await supabase.from("organization_settings").select("display_name,awb_brand_name").eq("organization_id", profile.organization_id).maybeSingle();
  if (error) return new Response("Company details could not be loaded. Please retry.", { status: 503 });
  return exportThreePLManifest({ company: resolveAwbBrandName(settings), number: manifest.manifest_number, status: manifestStatusLabels[manifest.status], rows: items.map((item) => ({ ...item, partner_name: manifest.carrier_name })) }, format);
}
