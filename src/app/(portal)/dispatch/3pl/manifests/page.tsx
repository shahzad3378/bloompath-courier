import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveAwbBrandName } from "@/lib/tenant-branding";
import { manifestRoles, manifestStatusLabels, type Manifest } from "@/lib/three-pl-manifests";
import { formatDubaiDate } from "@/lib/shipments";
import { CreateThreePLManifestForm, type ManifestCandidate } from "@/components/three-pl-manifest-forms";
export const metadata = { title: "3PL Manifests" };
export default async function ThreePLManifestsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireProfile(manifestRoles);
  if (!profile.organization_id) throw new Error("Organization is not configured.");
  const params = await searchParams;
  const requestedPage = Math.min(10000, Math.max(1, Number(params.page) || 1));
  const supabase = await createClient();
  const countResult = await supabase.from("third_party_manifests").select("id", { head: true, count: "exact" }).eq("organization_id", profile.organization_id);
  if (countResult.error) throw new Error("Manifests could not be loaded. Please retry.");
  const count = countResult.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / 25));
  const page = Math.min(pages, Math.floor(requestedPage));
  const [carrierResult, shipmentResult, manifestResult, settingsResult] = await Promise.all([
    supabase.from("third_party_carriers").select("id,name").eq("organization_id", profile.organization_id).eq("is_active", true).order("name").limit(100),
    supabase.from("shipments").select("id,tracking_number,consignee_name,consignee_city").eq("organization_id", profile.organization_id).eq("status", "at_warehouse").is("deleted_at", null).is("assigned_driver_id", null).order("created_at", { ascending: false }).limit(100),
    supabase.from("third_party_manifests").select("*").eq("organization_id", profile.organization_id).order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1),
    supabase.from("organization_settings").select("awb_brand_name,display_name").eq("organization_id", profile.organization_id).maybeSingle(),
  ]);
  if (carrierResult.error || shipmentResult.error || manifestResult.error) throw new Error("3PL manifests could not be loaded. Please retry.");
  const warehouse = shipmentResult.data ?? [];
  const ids = warehouse.map((s) => s.id);
  const [reservationResult, linkResult] = ids.length ? await Promise.all([
    supabase.from("third_party_manifest_items").select("shipment_id").eq("organization_id", profile.organization_id).eq("reserved", true).in("shipment_id", ids),
    supabase.from("third_party_shipment_links").select("shipment_id,carrier_id,partner_tracking_number,handed_over_at").eq("organization_id", profile.organization_id).in("shipment_id", ids),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (reservationResult.error || linkResult.error) throw new Error("Available parcels could not be checked. Please retry.");
  const reserved = new Set((reservationResult.data ?? []).map((i) => i.shipment_id));
  const links = new Map((linkResult.data ?? []).map((l) => [l.shipment_id, l]));
  const candidates: ManifestCandidate[] = warehouse.filter((s) => !reserved.has(s.id) && !links.get(s.id)?.handed_over_at).map((s) => ({ ...s, carrier_id: links.get(s.id)?.carrier_id ?? null, partner_tracking_number: links.get(s.id)?.partner_tracking_number ?? null }));
  const manifests = (manifestResult.data ?? []) as Manifest[];
  return <div className="mx-auto max-w-[1400px] space-y-6">
    <Link href="/dispatch/3pl" className="text-sm font-bold text-[#13734b] hover:underline">Back to 3PL Dispatch</Link>
    <h1 className="text-3xl font-bold">3PL Manifests</h1>
    <CreateThreePLManifestForm awbBrandName={resolveAwbBrandName(settingsResult.data)} requestId={randomUUID()} carriers={carrierResult.data ?? []} shipments={candidates} />
    <section className="bp-panel"><div className="bp-panel-header"><h2 className="text-lg font-bold">Manifest history ({count.toLocaleString()})</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-[#f4f7f6]"><tr><th className="p-4">Manifest</th><th className="p-4">Partner</th><th className="p-4">Shipments</th><th className="p-4">Status</th><th className="p-4">Created (Dubai time)</th></tr></thead><tbody>{manifests.map((m) => <tr key={m.id} className="bp-table-row border-t border-[#dfe7e3]"><td className="p-4"><Link href={`/dispatch/3pl/manifests/${m.id}`} className="font-mono font-bold text-[#13734b] hover:underline">{m.manifest_number}</Link></td><td className="p-4">{m.carrier_name}</td><td className="p-4">{m.shipment_count}</td><td className="p-4">{manifestStatusLabels[m.status]}</td><td className="p-4">{formatDubaiDate(m.created_at)}</td></tr>)}</tbody></table></div>
      {!count && <p className="p-5 text-sm text-[#66756e]">No manifests yet. Create a draft above after receiving parcels at warehouse.</p>}
      <nav aria-label="Manifest history pages" className="flex items-center justify-between gap-4 border-t border-[#dfe7e3] p-4 text-sm"><span>Page {page} of {pages}</span><div className="flex gap-3">{page > 1 && <Link className="bp-button-secondary" href={`?page=${page - 1}`}>Previous</Link>}{page < pages && <Link className="bp-button-secondary" href={`?page=${page + 1}`}>Next</Link>}</div></nav>
    </section>
  </div>;
}
