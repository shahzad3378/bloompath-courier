import Link from "next/link";
import { Archive, PackagePlus, Search, UploadCloud } from "lucide-react";
import { ShipmentSelectionTable } from "@/components/shipment-selection-table";
import { requireProfile } from "@/lib/auth";
import { canDeleteShipments, internalRoles } from "@/lib/roles";
import { shipmentStatuses, statusLabels, type Shipment, type ShipmentStatus } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Shipments" };

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; view?: string; archived?: string }>;
}) {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const params = await searchParams;
  const mayArchive = canDeleteShipments(profile);
  const showArchived = mayArchive && params.view === "archived";
  const queryText = String(params.q ?? "").trim().toLowerCase().slice(0, 80);
  const requestedStatus = shipmentStatuses.includes(params.status as ShipmentStatus)
    ? params.status as ShipmentStatus
    : "";
  const supabase = await createClient();
  let query = supabase.from("shipments").select("*").order(showArchived ? "deleted_at" : "created_at", { ascending: false }).limit(100);
  query = showArchived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
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
        <div><p className="text-sm font-semibold text-[#188459]">Order management</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">{showArchived ? "Archived AWBs" : "Shipments"}</h1><p className="mt-2 text-sm text-[#74827b]">{showArchived ? "Read-only audit records removed from active operations." : "Book, search and print UAE courier AWBs."}</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {mayArchive ? <Link href={showArchived ? "/shipments" : "/shipments?view=archived"} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e3caca] bg-white px-5 text-sm font-bold text-[#9b4444] shadow-sm"><Archive className="size-4" /> {showArchived ? "Active AWBs" : "Archived AWBs"}</Link> : null}
          {!showArchived ? <><Link href="/shipments/import" className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#bdd9ca] bg-white px-5 text-sm font-bold text-[#13734b] shadow-sm"><UploadCloud className="size-4" /> Bulk upload</Link><Link href="/shipments/new" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white shadow-lg shadow-[#13734b]/15"><PackagePlus className="size-4" /> New shipment</Link></> : null}
        </div>
      </div>

      {params.archived === "1" ? <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">AWB archived successfully. Its audit record is available under Archived AWBs.</div> : null}
      <form className="mt-7 grid gap-3 rounded-2xl border border-[#e0e8e4] bg-white p-4 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:grid-cols-[1fr_220px_auto]">
        {showArchived ? <input type="hidden" name="view" value="archived" /> : null}
        <label className="relative"><Search className="absolute left-3.5 top-3.5 size-4 text-[#819088]" /><input name="q" defaultValue={params.q} className="h-11 w-full rounded-xl border border-[#dbe5e0] pl-10 pr-3 text-sm outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10" placeholder="AWB, reference, customer or phone" /></label>
        <select name="status" defaultValue={requestedStatus} className="h-11 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm text-[#405048] outline-none focus:border-[#2b9466]"><option value="">All statuses</option>{shipmentStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
        <button className="h-11 rounded-xl bg-[#e7f4ed] px-5 text-sm font-bold text-[#13734b]">Apply filters</button>
      </form>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        {error ? <div className="p-8 text-center text-sm font-semibold text-[#b74646]">Shipments could not be loaded.</div> : shipments.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center"><div><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e7f4ed] text-[#188459]"><PackagePlus className="size-7" /></div><h2 className="mt-4 text-lg font-bold text-[#26372f]">No shipments found</h2><p className="mt-1 text-sm text-[#7a8881]">Create your first shipment to generate a printable AWB.</p><Link href="/shipments/new" className="mt-5 inline-flex rounded-xl bg-[#13734b] px-5 py-2.5 text-sm font-bold text-white">Create shipment</Link></div></div>
        ) : (
          <ShipmentSelectionTable shipments={shipments} archived={showArchived} />
        )}
      </section>
      <p className="mt-3 text-right text-xs text-[#8a9690]">Showing {shipments.length} of the latest 100 shipments</p>
    </div>
  );
}
