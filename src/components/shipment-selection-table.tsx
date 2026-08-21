"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, Printer } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatAed, formatDubaiDate, type Shipment } from "@/lib/shipments";

type ShipmentWithAging = Shipment & {
  last_undelivered_at?: string | null;
  undelivered_aging_days?: number | null;
  latest_proof_kind?: "POA" | "POD" | null;
  latest_proof_attempt?: number | null;
};

function agingLabel(days: number | null | undefined) {
  if (days === null || days === undefined) return "—";
  return `${days} ${days === 1 ? "Day" : "Days"}`;
}

function agingClass(days: number | null | undefined) {
  if (days === null || days === undefined) {
    return "text-[#87938d]";
  }

  if (days >= 8) {
    return "bg-[#fff0f0] text-[#b74646]";
  }

  if (days >= 4) {
    return "bg-[#fff3df] text-[#a66516]";
  }

  if (days >= 2) {
    return "bg-[#fff9e8] text-[#8a6a1c]";
  }

  return "bg-[#edf8f2] text-[#176a47]";
}

export function ShipmentSelectionTable({
  shipments,
  archived = false,
}: {
  shipments: ShipmentWithAging[];
  archived?: boolean;
}) {
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
      {!archived ? <div className="flex flex-col justify-between gap-3 border-b border-[#e8eeeb] bg-[#fbfcfb] px-5 py-3 sm:flex-row sm:items-center">
        <p className="text-xs font-semibold text-[#68776f]">{selectedIds.length ? `${selectedIds.length} shipment${selectedIds.length === 1 ? "" : "s"} selected` : "Select shipments below for bulk printing"}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={selectedIds.length === 0} onClick={() => openBulkPrint("4x6")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#13734b] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Printer className="size-3.5" /> Print selected 4×6</button>
          <button type="button" disabled={selectedIds.length === 0} onClick={() => openBulkPrint("a4")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cddbd4] bg-white px-3 text-xs font-bold text-[#405048] disabled:cursor-not-allowed disabled:opacity-40"><Printer className="size-3.5" /> Print selected A4</button>
        </div>
      </div> : <div className="border-b border-[#eedddd] bg-[#fff8f8] px-5 py-3 text-xs font-semibold text-[#8b5555]">Archived AWBs are read-only and excluded from printing and operations.</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1220px] text-left">
          <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr>{!archived ? <th className="w-12 px-5 py-3.5"><input aria-label="Select all visible shipments" type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 accent-[#13734b]" /></th> : null}<th className="px-5 py-3.5">AWB / Reference</th><th className="px-5 py-3.5">Consignee</th><th className="px-5 py-3.5">Destination</th><th className="px-5 py-3.5">COD</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Proof</th><th className="px-5 py-3.5">Aging</th><th className="px-5 py-3.5">{archived ? "Archived" : "Booked"}</th><th className="px-5 py-3.5 text-right">View</th></tr></thead>
          <tbody className="divide-y divide-[#edf1ef]">
            {shipments.map((shipment) => <tr key={shipment.id} className={`text-sm transition hover:bg-[#fbfcfb] ${selected.has(shipment.id) ? "bg-[#f0f8f4]" : ""}`}>{!archived ? <td className="px-5 py-4"><input aria-label={`Select ${shipment.tracking_number}`} type="checkbox" checked={selected.has(shipment.id)} onChange={() => toggleOne(shipment.id)} className="size-4 accent-[#13734b]" /></td> : null}<td className="px-5 py-4"><p className="font-bold text-[#24362d]">{shipment.tracking_number}</p><p className="mt-1 text-xs text-[#87938d]">{shipment.reference_number || "No seller reference"}</p></td><td className="px-5 py-4"><p className="font-semibold text-[#34453c]">{shipment.consignee_name}</p><p className="mt-1 text-xs text-[#87938d]">{shipment.consignee_phone}</p></td><td className="px-5 py-4 text-[#516159]">{shipment.consignee_city}{shipment.consignee_area ? ` · ${shipment.consignee_area}` : ""}</td><td className="px-5 py-4 font-semibold text-[#34453c]">{formatAed(shipment.cod_amount)}</td><td className="px-5 py-4">{archived ? <span className="rounded-full bg-[#f8e7e7] px-2.5 py-1 text-xs font-bold text-[#a13f3f]">Archived</span> : <StatusBadge status={shipment.status} />}</td><td className="px-5 py-4">{shipment.latest_proof_kind ? <Link href={`/shipments/${shipment.id}#delivery-proofs`} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${shipment.latest_proof_kind === "POD" ? "bg-[#e4f3ea] text-[#166b47]" : "bg-[#fff0d8] text-[#976019]"}`}>{shipment.latest_proof_kind} · #{shipment.latest_proof_attempt}</Link> : <span className="text-xs text-[#87938d]">—</span>}</td><td className="px-5 py-4">{shipment.undelivered_aging_days === null || shipment.undelivered_aging_days === undefined ? <span className="text-xs text-[#87938d]">—</span> : <span title={shipment.last_undelivered_at ? `Last undelivered: ${formatDubaiDate(shipment.last_undelivered_at)}` : undefined} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${agingClass(shipment.undelivered_aging_days)}`}>{agingLabel(shipment.undelivered_aging_days)}</span>}</td><td className="px-5 py-4 text-xs text-[#68766f]">{formatDubaiDate(archived && shipment.deleted_at ? shipment.deleted_at : shipment.booked_at)}</td><td className="px-5 py-4 text-right"><Link aria-label={`View ${shipment.tracking_number}`} href={`/shipments/${shipment.id}`} className="inline-grid size-9 place-items-center rounded-lg border border-[#dfe7e3] text-[#13734b] hover:bg-[#edf7f2]"><Eye className="size-4" /></Link></td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
