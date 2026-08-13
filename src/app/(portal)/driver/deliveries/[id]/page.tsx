import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, Box, MapPin, Navigation, Phone } from "lucide-react";
import { DeliveryResultForm } from "@/components/dispatch-forms";
import { requireProfile } from "@/lib/auth";
import { type DispatchRun, type DispatchRunItem } from "@/lib/dispatch";
import { formatAed } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Complete Delivery" };

type DriverDelivery = DispatchRunItem & { dispatch_runs: DispatchRun };

export default async function DriverDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(["driver"]);
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("dispatch_run_items").select("*, shipments(*), dispatch_runs!inner(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const delivery = data as unknown as DriverDelivery;
  if (delivery.dispatch_runs.driver_id !== profile.id || delivery.dispatch_runs.status !== "handed_over" || delivery.completed_at) notFound();
  const shipment = delivery.shipments;
  const address = [shipment.consignee_address, shipment.consignee_area, shipment.consignee_city, "United Arab Emirates"].filter(Boolean).join(", ");
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <div className="mx-auto max-w-[1050px]">
      <Link href="/driver" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to my route</Link>
      <div className="flex flex-col gap-4 rounded-2xl bg-[#10291f] p-5 text-white sm:flex-row sm:items-end sm:justify-between sm:p-6"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#48bf83]">Delivery stop</p><h1 className="mt-2 font-mono text-2xl font-black">{shipment.tracking_number}</h1><p className="mt-2 text-sm text-white/65">{delivery.dispatch_runs.run_number} · {delivery.dispatch_runs.route_name}</p></div><div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[10px] uppercase tracking-wide text-white/55">Attempt</p><p className="mt-1 text-2xl font-black">#{shipment.delivery_attempt_count + 1}</p></div></div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#e8f0fb] text-[#376eb1]"><MapPin className="size-5" /></span><div><p className="text-xs text-[#819088]">Deliver to</p><h2 className="text-lg font-bold text-[#26372f]">{shipment.consignee_name}</h2></div></div><div className="mt-5 space-y-3 text-sm leading-6 text-[#56655e]"><a href={`tel:${shipment.consignee_phone}`} className="flex items-center gap-3 rounded-xl bg-[#f6f9f7] px-4 py-3 font-bold text-[#13734b]"><Phone className="size-5" /> {shipment.consignee_phone}</a>{shipment.consignee_alt_phone ? <a href={`tel:${shipment.consignee_alt_phone}`} className="flex items-center gap-3 px-4 font-semibold"><Phone className="size-4" /> {shipment.consignee_alt_phone}</a> : null}<p className="px-4">{shipment.consignee_address}<br />{[shipment.consignee_area, shipment.consignee_city].filter(Boolean).join(", ")}</p>{shipment.consignee_landmark ? <p className="px-4 text-xs"><strong>Landmark:</strong> {shipment.consignee_landmark}</p> : null}<a href={mapHref} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#376eb1] px-4 font-bold text-white"><Navigation className="size-4" /> Open navigation</a></div></section>
          <div className="grid gap-5 sm:grid-cols-2"><section className="rounded-2xl border border-[#e0e8e4] bg-white p-5"><div className="flex items-center gap-3"><Box className="size-5 text-[#188459]" /><h2 className="font-bold text-[#26372f]">Parcel</h2></div><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-[#87938d]">Pieces</dt><dd className="font-bold">{shipment.pieces}</dd></div><div className="flex justify-between"><dt className="text-[#87938d]">Weight</dt><dd className="font-bold">{shipment.weight_kg} kg</dd></div><div><dt className="text-[#87938d]">Contents</dt><dd className="mt-1 font-semibold">{shipment.parcel_description}</dd></div></dl></section><section className="rounded-2xl border border-[#e0e8e4] bg-white p-5"><div className="flex items-center gap-3"><Banknote className="size-5 text-[#a56b19]" /><h2 className="font-bold text-[#26372f]">Collection</h2></div><p className="mt-4 text-3xl font-black text-[#13734b]">{formatAed(shipment.cod_amount)}</p><p className="mt-1 text-xs font-semibold text-[#87938d]">{shipment.payment_type === "cod" ? "Collect cash on delivery" : "Prepaid — no cash collection"}</p></section></div>
          {shipment.delivery_instructions ? <section className="rounded-xl border border-[#e4d5b8] bg-[#fffaf1] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#8a651f]">Delivery instructions</p><p className="mt-2 text-sm leading-6 text-[#6b5d43]">{shipment.delivery_instructions}</p></section> : null}
        </div>
        <DeliveryResultForm runItemId={delivery.id} attemptNumber={shipment.delivery_attempt_count + 1} />
      </div>
    </div>
  );
}
