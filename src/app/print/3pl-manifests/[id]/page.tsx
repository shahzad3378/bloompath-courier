import { resolveAwbBrandName } from "@/lib/tenant-branding";
import { getManifest, manifestStatusLabels } from "@/lib/three-pl-manifests";
import { formatDubaiDate } from "@/lib/shipments";
import { ManifestPrintButton } from "@/components/three-pl-manifest-forms";
export const metadata = { title: "Print 3PL Manifest" };
export default async function PrintThreePLManifestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { manifest: m, items, profile, supabase } = await getManifest(id);
  const { data: settings } = await supabase.from("organization_settings").select("display_name,awb_brand_name,legal_name,address,city").eq("organization_id", profile.organization_id).maybeSingle();
  const company = settings?.display_name || settings?.legal_name || "Courier";
  return <main className="min-h-screen bg-[#f4f7f6] p-4 text-black print:bg-white print:p-0"><div className="mx-auto max-w-[1100px]"><ManifestPrintButton backHref={`/dispatch/3pl/manifests/${id}`} />
    <article className="three-pl-manifest-print bg-white p-6 sm:p-8 print:p-0">
      <header className="border-b-2 border-black pb-5"><h1 className="text-2xl font-bold">{company}</h1><p className="mt-1 text-sm">{[settings?.address, settings?.city].filter(Boolean).join(", ")}</p><h2 className="mt-4 text-xl font-bold">3PL Handover Manifest</h2><p className="mt-1 break-all font-mono text-sm font-bold">{m.manifest_number}</p></header>
      <dl className="my-5 grid grid-cols-2 gap-4 text-sm"><div><dt>Delivery partner</dt><dd className="font-bold">{m.carrier_name}</dd></div><div><dt>Status</dt><dd className="font-bold">{manifestStatusLabels[m.status]}</dd></div><div><dt>Created (Dubai time)</dt><dd>{formatDubaiDate(m.created_at)}</dd></div><div><dt>Shipments / pieces</dt><dd>{items.length} / {items.reduce((n, i) => n + i.pieces, 0)}</dd></div>{m.handed_over_at && <><div><dt>Handed over (Dubai time)</dt><dd>{formatDubaiDate(m.handed_over_at)}</dd></div><div><dt>Received by</dt><dd>{m.receiver_name}</dd></div></>}</dl>
      {m.status === "draft" && <p className="mb-5 border border-black p-3 text-sm font-bold">DRAFT — physical handover has not been confirmed.</p>}
      {m.status === "cancelled" && <p className="mb-5 border border-black p-3 text-sm font-bold">CANCELLED — do not use for handover.</p>}
      <table className="w-full border-collapse text-left text-xs"><thead><tr className="border-y-2 border-black"><th className="py-2 pr-2">#</th><th className="py-2 pr-2">{resolveAwbBrandName(settings)} AWB</th><th className="py-2 pr-2">Partner AWB</th><th className="py-2 pr-2">Consignee</th><th className="py-2 pr-2">City</th><th className="py-2">Pieces</th></tr></thead><tbody>{items.map((i, n) => <tr key={i.shipment_id} className="border-b border-black/30"><td className="py-2 pr-2">{n + 1}</td><td className="py-2 pr-2 font-mono font-bold">{i.tracking_number}</td><td className="py-2 pr-2 font-mono">{i.partner_tracking_number || "—"}</td><td className="py-2 pr-2">{i.consignee_name}</td><td className="py-2 pr-2">{i.consignee_city}</td><td className="py-2">{i.pieces}</td></tr>)}</tbody></table>
      {m.notes && <p className="mt-5 whitespace-pre-wrap break-words text-sm">Notes: {m.notes}</p>}
      <section className="mt-16 grid grid-cols-2 gap-10 text-sm"><div className="border-t border-black pt-2">Handed over by: __________________<p className="mt-5">Signature / date: __________________</p></div><div className="border-t border-black pt-2">Received by: {m.receiver_name || "__________________"}<p className="mt-5">Signature / date: __________________</p></div></section>
      <p className="mt-8 text-xs">Internal operations copy.</p>
    </article></div></main>;
}
