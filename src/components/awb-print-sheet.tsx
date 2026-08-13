import { ShipmentCodes } from "@/components/shipment-codes";
import { formatAed, formatDubaiDate, serviceLabels, type Shipment } from "@/lib/shipments";

function Detail({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="border-r border-b border-black p-2 last:border-r-0"><p className="text-[9px] font-bold uppercase tracking-wide text-black/55">{label}</p><p className={`mt-1 leading-tight ${strong ? "text-base font-black" : "text-[11px] font-bold"}`}>{value}</p></div>;
}

export function AwbPrintSheet({ shipment, format }: { shipment: Shipment; format: "4x6" | "a4" }) {
  return (
    <article className={`awb-print-sheet awb-${format} mx-auto overflow-hidden bg-white text-black`}>
      <header className="flex items-center justify-between border-b-2 border-black p-3">
        <div className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-lg bg-black text-sm font-black text-white">BP</span><div><p className="text-base font-black leading-none">BloomPath Courier</p><p className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em]">UAE Operations</p></div></div>
        <div className="text-right"><p className="text-[9px] font-bold uppercase">Air Waybill</p><p className="mt-1 text-xs font-black">{serviceLabels[shipment.service_type]}</p></div>
      </header>

      <section className="border-b-2 border-black px-4 py-2"><ShipmentCodes trackingNumber={shipment.tracking_number} compact /></section>

      <section className="grid grid-cols-2 border-b-2 border-black">
        <div className="border-r-2 border-black p-3"><p className="text-[9px] font-bold uppercase text-black/55">From / Shipper</p><p className="mt-1 text-sm font-black">{shipment.sender_name}</p><p className="mt-1 text-[11px] font-bold">{shipment.sender_phone}</p><p className="mt-1 text-[10px] leading-4">{shipment.sender_address}, {shipment.sender_city}</p></div>
        <div className="p-3"><p className="text-[9px] font-bold uppercase text-black/55">To / Consignee</p><p className="mt-1 text-sm font-black">{shipment.consignee_name}</p><p className="mt-1 text-[11px] font-bold">{shipment.consignee_phone}{shipment.consignee_alt_phone ? ` / ${shipment.consignee_alt_phone}` : ""}</p><p className="mt-1 text-[10px] leading-4">{shipment.consignee_address}{shipment.consignee_area ? `, ${shipment.consignee_area}` : ""}, {shipment.consignee_city}</p>{shipment.consignee_landmark ? <p className="mt-1 text-[9px]">Landmark: {shipment.consignee_landmark}</p> : null}</div>
      </section>

      <section className="grid grid-cols-4 border-l border-black">
        <Detail label="Reference" value={shipment.reference_number || "—"} />
        <Detail label="Pieces" value={String(shipment.pieces)} />
        <Detail label="Weight" value={`${shipment.weight_kg} kg`} />
        <Detail label="COD Amount" value={formatAed(shipment.cod_amount)} strong />
      </section>
      <section className="border-b-2 border-black p-3"><p className="text-[9px] font-bold uppercase text-black/55">Contents</p><p className="mt-1 text-[11px] font-bold">{shipment.parcel_description}</p>{shipment.delivery_instructions ? <><p className="mt-2 text-[9px] font-bold uppercase text-black/55">Delivery instructions</p><p className="mt-1 text-[10px]">{shipment.delivery_instructions}</p></> : null}</section>
      <footer className="grid grid-cols-[1fr_120px] border-b border-black"><div className="p-3"><p className="text-[9px] font-bold uppercase text-black/55">Booked</p><p className="mt-1 text-[10px] font-bold">{formatDubaiDate(shipment.booked_at)} · UAE</p><p className="mt-2 text-[8px] leading-3 text-black/55">Received in good condition. This AWB is subject to BloomPath Courier service terms.</p></div><div className="border-l border-black p-3 text-center"><div className="h-10 border-b border-black" /><p className="mt-1 text-[8px] font-bold uppercase">Receiver signature</p></div></footer>
    </article>
  );
}
