import Link from "next/link";
import { Eye, PackagePlus, Search } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { formatAed, formatDubaiDate, shipmentStatuses, statusLabels, type Shipment, type ShipmentStatus } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Shipments" };

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireProfile([...internalRoles, "shipper"]);
  const params = await searchParams;
  const queryText = String(params.q ?? "").trim().toLowerCase().slice(0, 80);
  const requestedStatus = shipmentStatuses.includes(params.status as ShipmentStatus)
    ? params.status as ShipmentStatus
    : "";
  const supabase = await createClient();
  let query = supabase.from("shipments").select("*").order("created_at", { ascending: false }).limit(100);
  if (requestedStatus) query = query.eq("status", requestedStatus);
  const { data, error } = await query;
  const shipments = ((data ?? []) as Shipment[]).filter((shipment) => {
    if (!queryText) return true;
    return shipment.tracking_number.toLowerCase().includes(queryText)
      || shipment.reference_number?.toLowerCase().includes(queryText)
      || shipment.consignee_name.toLowerCase().includes(queryText)
      || shipment.consignee_phone.toLowerCase().includes(queryText);
  });

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-[#188459]">Order management</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Shipments</h1><p className="mt-2 text-sm text-[#74827b]">Book, search and print UAE courier AWBs.</p></div>
        <Link href="/shipments/new" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white shadow-lg shadow-[#13734b]/15"><PackagePlus className="size-4" /> New shipment</Link>
      </div>

      <form className="mt-7 grid gap-3 rounded-2xl border border-[#e0e8e4] bg-white p-4 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:grid-cols-[1fr_220px_auto]">
        <label className="relative"><Search className="absolute left-3.5 top-3.5 size-4 text-[#819088]" /><input name="q" defaultValue={params.q} className="h-11 w-full rounded-xl border border-[#dbe5e0] pl-10 pr-3 text-sm outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10" placeholder="AWB, reference, customer or phone" /></label>
        <select name="status" defaultValue={requestedStatus} className="h-11 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm text-[#405048] outline-none focus:border-[#2b9466]"><option value="">All statuses</option>{shipmentStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
        <button className="h-11 rounded-xl bg-[#e7f4ed] px-5 text-sm font-bold text-[#13734b]">Apply filters</button>
      </form>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        {error ? <div className="p-8 text-center text-sm font-semibold text-[#b74646]">Shipments could not be loaded.</div> : shipments.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center"><div><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e7f4ed] text-[#188459]"><PackagePlus className="size-7" /></div><h2 className="mt-4 text-lg font-bold text-[#26372f]">No shipments found</h2><p className="mt-1 text-sm text-[#7a8881]">Create your first shipment to generate a printable AWB.</p><Link href="/shipments/new" className="mt-5 inline-flex rounded-xl bg-[#13734b] px-5 py-2.5 text-sm font-bold text-white">Create shipment</Link></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left">
              <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="px-5 py-3.5">AWB / Reference</th><th className="px-5 py-3.5">Consignee</th><th className="px-5 py-3.5">Destination</th><th className="px-5 py-3.5">COD</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Booked</th><th className="px-5 py-3.5 text-right">View</th></tr></thead>
              <tbody className="divide-y divide-[#edf1ef]">
                {shipments.map((shipment) => <tr key={shipment.id} className="text-sm transition hover:bg-[#fbfcfb]"><td className="px-5 py-4"><p className="font-bold text-[#24362d]">{shipment.tracking_number}</p><p className="mt-1 text-xs text-[#87938d]">{shipment.reference_number || "No seller reference"}</p></td><td className="px-5 py-4"><p className="font-semibold text-[#34453c]">{shipment.consignee_name}</p><p className="mt-1 text-xs text-[#87938d]">{shipment.consignee_phone}</p></td><td className="px-5 py-4 text-[#516159]">{shipment.consignee_city}{shipment.consignee_area ? ` · ${shipment.consignee_area}` : ""}</td><td className="px-5 py-4 font-semibold text-[#34453c]">{formatAed(shipment.cod_amount)}</td><td className="px-5 py-4"><StatusBadge status={shipment.status} /></td><td className="px-5 py-4 text-xs text-[#68766f]">{formatDubaiDate(shipment.booked_at)}</td><td className="px-5 py-4 text-right"><Link aria-label={`View ${shipment.tracking_number}`} href={`/shipments/${shipment.id}`} className="inline-grid size-9 place-items-center rounded-lg border border-[#dfe7e3] text-[#13734b] hover:bg-[#edf7f2]"><Eye className="size-4" /></Link></td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 text-right text-xs text-[#8a9690]">Showing {shipments.length} of the latest 100 shipments</p>
    </div>
  );
}
