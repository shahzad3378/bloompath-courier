import Link from "next/link";
import { getManifest, manifestStatusLabels } from "@/lib/three-pl-manifests";
import { formatDubaiDate } from "@/lib/shipments";
import { ThreePLManifestChangeForm } from "@/components/three-pl-manifest-forms";
export const metadata = { title: "3PL Handover Manifest" };
export default async function ThreePLManifestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { manifest: m, items, profile, supabase } = await getManifest(id);
  const query = await searchParams;
  const actorIds = [...new Set([m.created_by, m.handed_over_by].filter((v): v is string => Boolean(v)))];
  const { data: actors } = await supabase.from("profiles").select("id,full_name").eq("organization_id", profile.organization_id).in("id", actorIds);
  const actorNames = new Map((actors ?? []).map((a) => [a.id, a.full_name]));
  return <div className="mx-auto max-w-[1400px] space-y-6">
    <Link href="/dispatch/3pl/manifests" className="text-sm font-bold text-[#13734b] hover:underline">Back to 3PL Manifests</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">3PL Handover Manifest</h1><p className="mt-2 break-all font-mono text-sm font-bold">{m.manifest_number}</p></div><Link href={`/print/3pl-manifests/${m.id}`} className="bp-button-secondary">Print manifest</Link></div>
    {query.created === "1" && m.status === "draft" && <p role="status" className="rounded-xl bg-[#e7f4ed] p-4 text-sm text-[#13734b]">Draft created. Parcels remain at warehouse until you confirm physical handover.</p>}
    <section className="bp-panel p-5"><dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><dt className="text-[#66756e]">Delivery partner (internal)</dt><dd className="mt-1 font-bold">{m.carrier_name}</dd></div><div><dt className="text-[#66756e]">Status</dt><dd className="mt-1 font-bold">{manifestStatusLabels[m.status]}</dd></div><div><dt className="text-[#66756e]">Shipments / pieces</dt><dd className="mt-1 font-bold">{items.length} / {items.reduce((n, i) => n + i.pieces, 0)}</dd></div><div><dt className="text-[#66756e]">Created (Dubai time)</dt><dd className="mt-1">{formatDubaiDate(m.created_at)}<p>{actorNames.get(m.created_by) || "Operations user"}</p></dd></div>
      {m.handed_over_at && <><div><dt className="text-[#66756e]">Handed over (Dubai time)</dt><dd className="mt-1">{formatDubaiDate(m.handed_over_at)}<p>{actorNames.get(m.handed_over_by ?? "") || "Operations user"}</p></dd></div><div><dt className="text-[#66756e]">Received by</dt><dd className="mt-1 font-bold">{m.receiver_name}</dd></div></>}
      {m.cancelled_at && <div><dt className="text-[#66756e]">Cancelled (Dubai time)</dt><dd className="mt-1">{formatDubaiDate(m.cancelled_at)}</dd></div>}
    </dl>{m.notes && <p className="mt-5 whitespace-pre-wrap break-words border-t border-[#dfe7e3] pt-4 text-sm">{m.notes}</p>}</section>
    <section className="bp-panel overflow-hidden"><div className="bp-panel-header"><h2 className="text-lg font-bold">Manifest parcels</h2></div><div className="max-h-[620px] overflow-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[#f4f7f6]"><tr><th className="p-4">FastDrop AWB</th><th className="p-4">Partner AWB (internal)</th><th className="p-4">Consignee / city</th><th className="p-4">Pieces</th></tr></thead><tbody>{items.map((i) => <tr key={i.shipment_id} className="bp-table-row border-t border-[#dfe7e3]"><td className="p-4"><Link href={`/shipments/${i.shipment_id}`} className="font-mono font-bold text-[#13734b] hover:underline">{i.tracking_number}</Link></td><td className="p-4 font-mono">{i.partner_tracking_number || "Not booked"}</td><td className="p-4">{i.consignee_name}<p className="text-[#66756e]">{i.consignee_city}</p></td><td className="p-4">{i.pieces}</td></tr>)}</tbody></table></div></section>
    {m.status === "draft" ? <div className="grid items-start gap-5 lg:grid-cols-2"><ThreePLManifestChangeForm id={m.id} count={items.length} operation="confirm" /><ThreePLManifestChangeForm id={m.id} count={items.length} operation="cancel" /></div> : <p role="status" className="rounded-xl bg-[#e7f4ed] p-4 text-sm text-[#13734b]">{m.status === "handed_over" ? "Handover confirmed. The partner has custody; customer tracking changed to In transit at handover." : "Draft cancelled. No shipment status was changed."}</p>}
  </div>;
}
