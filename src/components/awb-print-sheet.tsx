import { ShipmentCodes } from "@/components/shipment-codes";
import { formatDubaiDate, formatMoney, serviceLabels, type Shipment } from "@/lib/shipments";

function Detail({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="border-r border-b border-black p-2 last:border-r-0"><p className="text-[9px] font-bold uppercase tracking-wide text-black/55">{label}</p><p className={`mt-1 leading-tight ${strong ? "text-base font-black" : "text-[11px] font-bold"}`}>{value}</p></div>;
}

function addressLine(address: string, address2: string | null | undefined, city: string, state: string | null | undefined, postal: string | null | undefined, country: string | null | undefined) {
  return [address, address2, city, state, postal, country].filter(Boolean).join(", ");
}

export function AwbPrintSheet({ shipment, format, branding }: {
  shipment: Shipment;
  format: "4x6" | "a4";
  branding?: { name: string; logoUrl: string | null; location: string; currency?: string };
}) {
  const brandName = branding?.name || "BloomPath Courier";
  const currency = shipment.currency || branding?.currency || "AED";
  const brandInitials = brandName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "BP";

  return (
    <article className={`awb-print-sheet awb-${format} mx-auto overflow-hidden bg-white text-black`}>
      <header className="grid grid-cols-[1fr_92px] items-stretch border-b-2 border-black">
        <div className="flex min-w-0 items-center gap-2 p-3">
          {branding?.logoUrl ? (
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden bg-white">
              <img src={branding.logoUrl} alt={`${brandName} logo`} className="max-h-full max-w-full object-contain" />
            </span>
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-black text-sm font-black text-white">{brandInitials}</span>
          )}
          <div className="min-w-0">
            <p className="text-base font-black leading-tight">{brandName}</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center border-l-2 border-black px-2 py-2 text-center">
          <p className="text-[8px] font-black uppercase tracking-[0.08em]">Air Waybill</p>
          <p className="mt-1 text-xs font-black leading-tight">{serviceLabels[shipment.service_type]}</p>
        </div>
      </header>

      <section className="border-b-2 border-black px-4 py-2"><ShipmentCodes trackingNumber={shipment.tracking_number} compact /></section>

      <section className="grid grid-cols-2 border-b-2 border-black">
        <div className="border-r-2 border-black p-3">
          <p className="text-[9px] font-bold uppercase text-black/55">From / Shipper</p>
          <p className="mt-1 text-sm font-black">{shipment.sender_name}</p>
          <p className="mt-1 text-[11px] font-bold">{shipment.sender_phone}</p>
          <p className="mt-1 text-[10px] leading-4">{addressLine(shipment.sender_address, shipment.sender_address_2, shipment.sender_city, shipment.sender_state_province, shipment.sender_postal_code, shipment.sender_country_code)}</p>
        </div>
        <div className="p-3">
          <p className="text-[9px] font-bold uppercase text-black/55">To / Consignee</p>
          <p className="mt-1 text-sm font-black">{shipment.consignee_name}</p>
          <p className="mt-1 text-[11px] font-bold">{shipment.consignee_phone}{shipment.consignee_alt_phone ? ` / ${shipment.consignee_alt_phone}` : ""}</p>
          <p className="mt-1 text-[10px] leading-4">{addressLine(shipment.consignee_address, shipment.consignee_address_2, shipment.consignee_city, shipment.consignee_state_province, shipment.consignee_postal_code, shipment.consignee_country_code)}</p>
          {shipment.service_zone_name ? <p className="mt-1 text-[9px] font-bold">Zone: {shipment.service_zone_name}</p> : null}
          {shipment.consignee_landmark ? <p className="mt-1 text-[9px]">Landmark: {shipment.consignee_landmark}</p> : null}
        </div>
      </section>

      <section className="grid grid-cols-4 border-l border-black">
        <Detail label="Reference" value={shipment.reference_number || "—"} />
        <Detail label="Pieces" value={String(shipment.pieces)} />
        <Detail label="Weight" value={`${shipment.weight_kg} kg`} />
        <Detail label="COD Amount" value={formatMoney(shipment.cod_amount, currency)} strong />
      </section>
      <section className="border-b-2 border-black p-3"><p className="text-[9px] font-bold uppercase text-black/55">Contents</p><p className="mt-1 text-[11px] font-bold">{shipment.parcel_description}</p>{shipment.delivery_instructions ? <><p className="mt-2 text-[9px] font-bold uppercase text-black/55">Delivery instructions</p><p className="mt-1 text-[10px]">{shipment.delivery_instructions}</p></> : null}</section>
      <footer className="grid grid-cols-[1fr_120px] border-b border-black"><div className="p-3"><p className="text-[9px] font-bold uppercase text-black/55">Booked</p><p className="mt-1 text-[10px] font-bold">{formatDubaiDate(shipment.booked_at)} · {shipment.consignee_country_code || ""}</p><p className="mt-2 text-[8px] leading-3 text-black/55">Received in good condition. This AWB is subject to {brandName} service terms.</p></div><div className="border-l border-black p-3 text-center"><div className="h-10 border-b border-black" /><p className="mt-1 text-[8px] font-bold uppercase">Receiver signature</p></div></footer>
    </article>
  );
}
