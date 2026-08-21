import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print Pickup Manifest" };

export default async function PrintPickupManifestPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const supabase = await createClient();
  let manifestQuery = supabase
    .from("pickup_manifests")
    .select("id,organization_id,shipper_id,shipper_name,manifest_number,status,created_at,picked_up_at,received_at")
    .eq("id", Number(id))
    .eq("organization_id", profile.organization_id);
  if (profile.role === "shipper") manifestQuery = manifestQuery.eq("shipper_id", profile.id);

  const [{ data: manifest }, { data: settings }] = await Promise.all([
    manifestQuery.maybeSingle(),
    supabase
      .from("organization_settings")
      .select("display_name,legal_name,address,city,contact_phone,contact_email,logo_url")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
  ]);
  if (!manifest) notFound();

  const { data: items } = await supabase
    .from("pickup_manifest_items")
    .select("id,received_at,shipments(tracking_number,reference_number,consignee_name,consignee_phone,consignee_city,consignee_address,pieces,weight_kg)")
    .eq("manifest_id", manifest.id)
    .order("created_at", { ascending: true });

  const companyName = settings?.display_name || settings?.legal_name || "Courier Company";
  const rows = items ?? [];

  return (
    <main className="min-h-screen bg-[#eef2f0] px-4 py-6 text-black print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[1100px] justify-end print:hidden">
        <Link href={`/pickup-manifests/${manifest.id}`} className="rounded-lg border border-[#cfd9d4] bg-white px-4 py-2 text-sm font-bold">Back</Link>
        <script dangerouslySetInnerHTML={{ __html: "window.addEventListener('load',function(){setTimeout(function(){window.print()},250)})" }} />
      </div>

      <article className="mx-auto max-w-[1100px] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-5">
          <div className="flex items-start gap-4">
            {settings?.logo_url ? <img src={settings.logo_url} alt={companyName} className="h-16 w-16 object-contain" /> : null}
            <div>
              <h1 className="text-2xl font-black">{companyName}</h1>
              {settings?.legal_name ? <p className="mt-1 text-sm">{settings.legal_name}</p> : null}
              <div className="mt-2 text-xs text-black/60">
                {settings?.address || settings?.city ? <p>{[settings.address, settings.city].filter(Boolean).join(", ")}</p> : null}
                {settings?.contact_phone ? <p>{settings.contact_phone}</p> : null}
                {settings?.contact_email ? <p>{settings.contact_email}</p> : null}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/50">Pickup Manifest</p>
            <p className="mt-2 font-mono text-xl font-black">{manifest.manifest_number}</p>
            <p className="mt-2 text-xs">Created: <strong>{formatDubaiDate(manifest.created_at)}</strong></p>
            <p className="mt-1 text-xs">Status: <strong className="uppercase">{String(manifest.status).replaceAll("_", " ")}</strong></p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6 border-b border-black pb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-black/50">Pickup From / Shipper</p>
            <p className="mt-2 text-lg font-black">{manifest.shipper_name}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-black/50">Shipment Count</p>
            <p className="mt-2 text-2xl font-black">{rows.length}</p>
          </div>
        </section>

        <section className="mt-5">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead><tr className="border-y-2 border-black"><th className="py-2 pr-2">#</th><th className="py-2 pr-2">AWB</th><th className="py-2 pr-2">Reference</th><th className="py-2 pr-2">Consignee</th><th className="py-2 pr-2">Phone</th><th className="py-2 pr-2">City</th><th className="py-2 pr-2">Pieces</th><th className="py-2">Warehouse</th></tr></thead>
            <tbody>
              {rows.map((item: any, index) => {
                const shipment = Array.isArray(item.shipments) ? item.shipments[0] : item.shipments;
                return <tr key={item.id} className="border-b border-black/20"><td className="py-2 pr-2">{index + 1}</td><td className="py-2 pr-2 font-mono font-bold">{shipment?.tracking_number || "—"}</td><td className="py-2 pr-2">{shipment?.reference_number || "—"}</td><td className="py-2 pr-2">{shipment?.consignee_name || "—"}</td><td className="py-2 pr-2">{shipment?.consignee_phone || "—"}</td><td className="py-2 pr-2">{shipment?.consignee_city || "—"}</td><td className="py-2 pr-2">{shipment?.pieces ?? 1}</td><td className="py-2">{item.received_at ? "Received" : "Pending"}</td></tr>;
              })}
            </tbody>
          </table>
        </section>

        <section className="mt-10 grid grid-cols-3 gap-8 text-xs">
          <div className="border-t border-black pt-2"><strong>Shipper Handover</strong><p className="mt-6">Name / Signature</p></div>
          <div className="border-t border-black pt-2"><strong>Driver / Pickup</strong><p className="mt-6">Name / Signature</p></div>
          <div className="border-t border-black pt-2"><strong>Warehouse Receipt</strong><p className="mt-6">Name / Signature</p></div>
        </section>
      </article>
    </main>
  );
}
