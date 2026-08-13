import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, Box, MapPin, PackageCheck, Printer, UserRound } from "lucide-react";
import { ArchiveShipmentForm } from "@/components/archive-shipment-form";
import { ShipmentCodes } from "@/components/shipment-codes";
import { StatusBadge } from "@/components/status-badge";
import { requireProfile } from "@/lib/auth";
import { canDeleteShipments, internalRoles } from "@/lib/roles";
import { formatAed, formatDubaiDate, serviceLabels, type Shipment, type ShipmentEvent } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Shipment Details" };

export default async function ShipmentDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const profile = await requireProfile([...internalRoles, "shipper", "driver"]);
  const { id } = await params;
  const { created } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, { data: eventData }] = await Promise.all([
    supabase.from("shipments").select("*").eq("id", id).maybeSingle(),
    supabase.from("shipment_events").select("id, event_type, previous_status, new_status, notes, created_at").eq("shipment_id", id).order("created_at", { ascending: true }),
  ]);
  if (!data) notFound();
  const shipment = data as Shipment;
  const events = (eventData ?? []) as ShipmentEvent[];
  const archived = Boolean(shipment.deleted_at);
  const mayArchive = !archived && shipment.status === "booked" && canDeleteShipments(profile);

  return (
    <div className="mx-auto max-w-[1250px]">
      <Link href="/shipments" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to shipments</Link>
      {created === "1" ? <div className="mb-5 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">Shipment booked successfully. AWB {shipment.tracking_number} is ready to print.</div> : null}
      {archived ? <div className="mb-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm text-[#8f3f3f]"><p className="flex items-center gap-2 font-bold"><Archive className="size-4" /> AWB archived {shipment.deleted_at ? formatDubaiDate(shipment.deleted_at) : ""}</p><p className="mt-1 text-xs">Reason: {shipment.delete_reason}</p></div> : null}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-[#188459]">Shipment record</p><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold tracking-[-0.035em] text-[#17231e]">{shipment.tracking_number}</h1>{archived ? <span className="rounded-full bg-[#f8e7e7] px-2.5 py-1 text-xs font-bold text-[#a13f3f]">Archived</span> : <StatusBadge status={shipment.status} />}</div><p className="mt-2 text-sm text-[#74827b]">Booked {formatDubaiDate(shipment.booked_at)} · {serviceLabels[shipment.service_type]}</p></div>{!archived ? <div className="flex flex-wrap gap-2"><Link href={`/print/shipments/${shipment.id}?format=4x6`} target="_blank" className="flex h-10 items-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white"><Printer className="size-4" /> Print 4×6</Link><Link href={`/print/shipments/${shipment.id}?format=a4`} target="_blank" className="flex h-10 items-center gap-2 rounded-xl border border-[#ccd9d2] bg-white px-4 text-sm font-bold text-[#405048]"><Printer className="size-4" /> Print A4</Link></div> : null}</div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:p-6"><div className="mx-auto max-w-2xl"><ShipmentCodes trackingNumber={shipment.tracking_number} /></div></section>
          <div className="grid gap-5 md:grid-cols-2">
            <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]"><Box className="size-5" /></span><div><p className="text-xs text-[#819088]">Pickup from</p><h2 className="font-bold text-[#26372f]">{shipment.sender_name}</h2></div></div><div className="mt-4 space-y-2 text-sm leading-6 text-[#5d6c65]"><p>{shipment.sender_phone}</p><p>{shipment.sender_address}</p><p className="font-semibold text-[#36473e]">{shipment.sender_city}</p></div></section>
            <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e8f0fb] text-[#376eb1]"><MapPin className="size-5" /></span><div><p className="text-xs text-[#819088]">Deliver to</p><h2 className="font-bold text-[#26372f]">{shipment.consignee_name}</h2></div></div><div className="mt-4 space-y-2 text-sm leading-6 text-[#5d6c65]"><p>{shipment.consignee_phone}{shipment.consignee_alt_phone ? ` · ${shipment.consignee_alt_phone}` : ""}</p><p>{shipment.consignee_address}</p><p>{[shipment.consignee_area, shipment.consignee_city].filter(Boolean).join(", ")}</p>{shipment.consignee_landmark ? <p className="text-xs">Landmark: {shipment.consignee_landmark}</p> : null}</div></section>
          </div>
          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6"><h2 className="font-bold text-[#26372f]">Shipment details</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-[#87938d]">Reference</dt><dd className="mt-1 text-sm font-semibold">{shipment.reference_number || "—"}</dd></div><div><dt className="text-xs text-[#87938d]">Pieces</dt><dd className="mt-1 text-sm font-semibold">{shipment.pieces}</dd></div><div><dt className="text-xs text-[#87938d]">Weight</dt><dd className="mt-1 text-sm font-semibold">{shipment.weight_kg} kg</dd></div><div><dt className="text-xs text-[#87938d]">COD</dt><dd className="mt-1 text-sm font-bold text-[#13734b]">{formatAed(shipment.cod_amount)}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-[#87938d]">Contents</dt><dd className="mt-1 text-sm font-semibold">{shipment.parcel_description}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-[#87938d]">Instructions</dt><dd className="mt-1 text-sm font-semibold">{shipment.delivery_instructions || "—"}</dd></div></dl></section>
        </div>

        <div className="space-y-5"><aside className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#eeeaf8] text-[#6952a0]"><PackageCheck className="size-5" /></span><div><p className="text-xs text-[#819088]">AWB history</p><h2 className="font-bold text-[#26372f]">Shipment timeline</h2></div></div><div className="mt-6 space-y-0">{events.map((event, index) => <div key={event.id} className="relative flex gap-3 pb-6 last:pb-0"><div className={`relative z-10 mt-1 size-3 shrink-0 rounded-full border-[3px] ${event.event_type === "shipment_archived" ? "border-[#f5dada] bg-[#b74646]" : "border-[#dff2e8] bg-[#188459]"}`} />{index < events.length - 1 ? <span className="absolute left-[5px] top-3 h-full w-px bg-[#dfe7e3]" /> : null}<div><p className="text-sm font-bold text-[#35463d]">{event.notes || "Shipment status updated"}</p><p className="mt-1 text-xs text-[#8a9690]">{formatDubaiDate(event.created_at)}</p></div></div>)}{events.length === 0 ? <p className="text-sm text-[#7a8881]">No events recorded yet.</p> : null}</div><div className="mt-6 rounded-xl bg-[#f5f8f6] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#62716a]"><UserRound className="size-4" /> Operational record</div><p className="mt-2 text-xs leading-5 text-[#85918b]">Status events and archive actions are retained for operational audit.</p></div></aside>{mayArchive ? <ArchiveShipmentForm shipmentId={shipment.id} trackingNumber={shipment.tracking_number} /> : null}</div>
      </div>
    </div>
  );
}
