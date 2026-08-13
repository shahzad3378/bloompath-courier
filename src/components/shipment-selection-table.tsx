"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, Printer } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatAed, formatDubaiDate, type Shipment } from "@/lib/shipments";

export function ShipmentSelectionTable({ shipments }: { shipments: Shipment[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const allSelected = shipments.length > 0 && shipments.every((shipment) => selected.has(shipment.id));
  const selectedIds = useMemo(
    () => shipments.filter((shipment) => selected.has(shipment.id)).map((shipment) => shipment.id),
    [selected, shipments],
  );

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(shipments.map((shipment) => shipment.id)));
  }

  function toggleOne(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openBulkPrint(format: "4x6" | "a4") {
    if (selectedIds.length === 0) return;
    const query = new URLSearchParams({ ids: selectedIds.join(","), format });
    window.open(`/print/shipments/bulk?${query.toString()}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <div className="flex flex-col justify-between gap-3 border-b border-[#e8eeeb] bg-[#fbfcfb] px-5 py-3 sm:flex-row sm:items-center">
        <p className="text-xs font-semibold text-[#68776f]">{selectedIds.length ? `${selectedIds.length} shipment${selectedIds.length === 1 ? "" : "s"} selected` : "Select shipments below for bulk printing"}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={selectedIds.length === 0} onClick={() => openBulkPrint("4x6")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#13734b] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Printer className="size-3.5" /> Print selected 4×6</button>
          <button type="button" disabled={selectedIds.length === 0} onClick={() => openBulkPrint("a4")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cddbd4] bg-white px-3 text-xs font-bold text-[#405048] disabled:cursor-not-allowed disabled:opacity-40"><Printer className="size-3.5" /> Print selected A4</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1010px] text-left">
          <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="w-12 px-5 py-3.5"><input aria-label="Select all visible shipments" type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 accent-[#13734b]" /></th><th className="px-5 py-3.5">AWB / Reference</th><th className="px-5 py-3.5">Consignee</th><th className="px-5 py-3.5">Destination</th><th className="px-5 py-3.5">COD</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Booked</th><th className="px-5 py-3.5 text-right">View</th></tr></thead>
          <tbody className="divide-y divide-[#edf1ef]">
            {shipments.map((shipment) => <tr key={shipment.id} className={`text-sm transition hover:bg-[#fbfcfb] ${selected.has(shipment.id) ? "bg-[#f0f8f4]" : ""}`}><td className="px-5 py-4"><input aria-label={`Select ${shipment.tracking_number}`} type="checkbox" checked={selected.has(shipment.id)} onChange={() => toggleOne(shipment.id)} className="size-4 accent-[#13734b]" /></td><td className="px-5 py-4"><p className="font-bold text-[#24362d]">{shipment.tracking_number}</p><p className="mt-1 text-xs text-[#87938d]">{shipment.reference_number || "No seller reference"}</p></td><td className="px-5 py-4"><p className="font-semibold text-[#34453c]">{shipment.consignee_name}</p><p className="mt-1 text-xs text-[#87938d]">{shipment.consignee_phone}</p></td><td className="px-5 py-4 text-[#516159]">{shipment.consignee_city}{shipment.consignee_area ? ` · ${shipment.consignee_area}` : ""}</td><td className="px-5 py-4 font-semibold text-[#34453c]">{formatAed(shipment.cod_amount)}</td><td className="px-5 py-4"><StatusBadge status={shipment.status} /></td><td className="px-5 py-4 text-xs text-[#68766f]">{formatDubaiDate(shipment.booked_at)}</td><td className="px-5 py-4 text-right"><Link aria-label={`View ${shipment.tracking_number}`} href={`/shipments/${shipment.id}`} className="inline-grid size-9 place-items-center rounded-lg border border-[#dfe7e3] text-[#13734b] hover:bg-[#edf7f2]"><Eye className="size-4" /></Link></td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
