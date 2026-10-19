"use client";

import {useRef} from "react";
import type {ReactNode} from "react";

export function GtaAwbExport({children}:{children:ReactNode}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const getBoxes = () => Array.from(containerRef.current?.querySelectorAll<HTMLInputElement>("input[data-gta-awb]") ?? []);

  const toggleAll = () => {
    const boxes = getBoxes();
    const shouldSelect = boxes.some(box => !box.checked);
    boxes.forEach(box => { box.checked = shouldSelect; });
  };

  const downloadSelected = () => {
    const rows = getBoxes()
      .filter(box => box.checked && box.dataset.awb)
      .map(box => [box.dataset.awb!, box.dataset.shipment ?? "", box.dataset.environment ?? "", box.dataset.status ?? ""]);
    if (!rows.length) return;

    const escapeCell = (value:string) => `"${value.replaceAll('"', '""')}"`;
    const csv = "\uFEFF" + [["GTA AWB","Shipment ID","Environment","Booking status"], ...rows].map(row => row.map(escapeCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gta-awbs.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" onClick={toggleAll} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">Select all on this page</button>
      <button type="button" onClick={downloadSelected} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">Download selected AWBs (CSV)</button>
      <span className="text-sm text-[var(--muted)]">Unconfirmed AWBs are not included.</span>
    </div>
    <div ref={containerRef}>{children}</div>
  </div>;
}
