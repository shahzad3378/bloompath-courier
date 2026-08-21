"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, ExternalLink, FileSpreadsheet, LoaderCircle, Printer, UploadCloud } from "lucide-react";
import { importShipmentsAction, type BulkUploadState, type ImportedShipment } from "@/app/(portal)/shipments/import/actions";

const initialBulkUploadState: BulkUploadState = { status: "idle", message: "", errors: [], imported: [] };
type ShipperOption = { id: string; full_name: string; email: string };

function downloadCsv(shipments: ImportedShipment[], manifestOnly = false) {
  const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const rows = manifestOnly
    ? [["tracking_number"], ...shipments.map((shipment) => [shipment.trackingNumber])]
    : [["tracking_number", "reference_number", "shipment_url"], ...shipments.map((shipment) => [shipment.trackingNumber, shipment.referenceNumber ?? "", `${window.location.origin}/shipments/${shipment.id}`])];
  const csv = rows.map((row) => row.map((value) => escape(String(value))).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = manifestOnly ? "courieros-manifest-awbs.csv" : "courieros-import-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadExcel(shipments: ImportedShipment[]) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("AWBs");
  sheet.columns = [
    { header: "Tracking Number", key: "tracking", width: 24 },
    { header: "Reference Number", key: "reference", width: 28 },
    { header: "Shipment URL", key: "url", width: 55 },
  ];
  shipments.forEach((shipment) => sheet.addRow({
    tracking: shipment.trackingNumber,
    reference: shipment.referenceNumber ?? "",
    url: `${window.location.origin}/shipments/${shipment.id}`,
  }));
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "courieros-awb-report.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}

export function BulkShipmentUpload({ shippers, requiresShipperSelection }: { shippers: ShipperOption[]; requiresShipperSelection: boolean }) {
  const [state, formAction, pending] = useActionState(importShipmentsAction, initialBulkUploadState);
  const [fileName, setFileName] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(state.imported.length / pageSize));
  const visible = useMemo(() => showAll ? state.imported : state.imported.slice((page - 1) * pageSize, page * pageSize), [state.imported, page, showAll]);
  const selectedShipments = useMemo(() => state.imported.filter((shipment) => selected.has(shipment.id)), [state.imported, selected]);

  useEffect(() => {
    setPage(1);
    setShowAll(false);
    setSelected(new Set());
  }, [state.imported]);

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(state.imported.map((shipment) => shipment.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const printRows = selectedShipments.length > 0 ? selectedShipments : visible;
  const printable = printRows.slice(0, 500);
  const printableIds = printable.map((shipment) => shipment.id).join(",");

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/shipments" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to shipments</Link>
          <p className="text-sm font-semibold text-[#188459]">Batch order booking</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Universal bulk shipment upload</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#74827b]">Upload up to 5,000 shipments per file. Canada, USA and UAE use the same international address structure.</p>
        </div>
        <a href="/shipments/import/template" className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#bdd9ca] bg-white px-5 text-sm font-bold text-[#13734b]"><Download className="size-4" /> Download universal CSV</a>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <form action={formAction} className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-7">
          <div className="flex items-start gap-3 border-b border-[#edf1ef] pb-5"><span className="grid size-11 place-items-center rounded-xl bg-[#e7f4ed] text-[#188459]"><UploadCloud className="size-5" /></span><div><h2 className="font-bold text-[#26372f]">Choose your completed file</h2><p className="mt-1 text-sm text-[#7a8881]">.xlsx or .csv · Up to 5,000 shipments · 20 MB</p></div></div>
          {requiresShipperSelection ? <label className="mt-5 block text-xs font-bold text-[#516159]">Shipper for this batch *<select name="shipper_id" required defaultValue="" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"><option value="" disabled>Select active shipper</option>{shippers.map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.full_name} · {shipper.email}</option>)}</select></label> : null}
          <label className="mt-6 grid min-h-48 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#bed5c9] bg-[#f8fbf9] p-6 text-center"><input name="file" type="file" accept=".xlsx,.csv" className="sr-only" required onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} /><span><FileSpreadsheet className="mx-auto size-8 text-[#13734b]" /><span className="mt-3 block font-bold text-[#26372f]">{fileName || "Select Excel or CSV"}</span></span></label>
          <button disabled={pending || !fileName} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-6 text-sm font-bold text-white disabled:opacity-55">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}{pending ? "Validating and booking…" : "Validate file & generate AWBs"}</button>
        </form>

        <aside className="rounded-2xl bg-[#10291f] p-6 text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#65d79c]">Large batch workflow</p><div className="mt-5 space-y-4 text-xs leading-5 text-white/65"><p><strong className="text-white">1.</strong> Upload up to 5,000 shipments.</p><p><strong className="text-white">2.</strong> View AWBs 1–100, Next, Previous or All.</p><p><strong className="text-white">3.</strong> Select all and download Excel / manifest AWB file.</p><p><strong className="text-white">4.</strong> Bulk-load that AWB file into Pickup Manifest and bulk receive at warehouse.</p></div></aside>
      </div>

      {state.status !== "idle" ? <section className={`mt-5 overflow-hidden rounded-2xl border bg-white ${state.status === "success" ? "border-[#b9dfca]" : "border-[#efcccc]"}`}>
        <div className={`flex items-start gap-3 px-5 py-4 ${state.status === "success" ? "bg-[#edf9f2] text-[#176d49]" : "bg-[#fff3f3] text-[#a63e3e]"}`}>{state.status === "success" ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}<div><p className="font-bold">{state.status === "success" ? "Bulk upload complete" : "Upload needs attention"}</p><p className="mt-1 text-sm">{state.message}</p></div></div>
        {state.errors.length > 0 ? <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-[#f8faf9]"><tr><th className="px-4 py-3">Row</th><th className="px-4 py-3">Column</th><th className="px-4 py-3">Issue</th></tr></thead><tbody>{state.errors.map((error, index) => <tr key={`${error.row}-${index}`} className="border-t"><td className="px-4 py-3">{error.row}</td><td className="px-4 py-3 font-mono text-xs">{error.field}</td><td className="px-4 py-3 text-[#a13f3f]">{error.message}</td></tr>)}</tbody></table></div> : null}

        {state.imported.length > 0 ? <>
          <div className="border-b px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-[#26372f]">Generated AWBs: {state.imported.length}</p><p className="mt-1 text-xs text-[#87938d]">Selected: {selected.size}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={selectAll} className="h-9 rounded-lg border px-3 text-xs font-bold">Select all</button><button type="button" onClick={clearSelection} className="h-9 rounded-lg border px-3 text-xs font-bold">Clear</button><button type="button" onClick={() => void downloadExcel(selectedShipments.length ? selectedShipments : state.imported)} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold text-[#13734b]"><Download className="size-3.5" /> Excel report</button><button type="button" onClick={() => downloadCsv(selectedShipments.length ? selectedShipments : state.imported, true)} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold text-[#13734b]"><Download className="size-3.5" /> Manifest AWBs</button></div></div>
            <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={page <= 1 || showAll} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-9 rounded-lg border px-3 text-xs font-bold disabled:opacity-40">Previous</button><span className="text-xs font-bold text-[#68766f]">{showAll ? `All ${state.imported.length}` : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, state.imported.length)} of ${state.imported.length}`}</span><button type="button" disabled={page >= pageCount || showAll} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className="h-9 rounded-lg border px-3 text-xs font-bold disabled:opacity-40">Next</button><button type="button" onClick={() => setShowAll((value) => !value)} className="h-9 rounded-lg border px-3 text-xs font-bold">{showAll ? "Show 100" : "All"}</button>{printableIds ? <><Link href={`/print/shipments/bulk?ids=${encodeURIComponent(printableIds)}&format=4x6`} target="_blank" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#13734b] px-3 text-xs font-bold text-white"><Printer className="size-3.5" /> Print {printable.length} 4×6</Link><Link href={`/print/shipments/bulk?ids=${encodeURIComponent(printableIds)}&format=a4`} target="_blank" className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold"><Printer className="size-3.5" /> A4</Link></> : null}</div>
            {printRows.length > 500 ? <p className="mt-2 text-xs font-semibold text-[#a56b19]">Printing is limited to 500 AWBs per print request. Excel and manifest exports can include all {state.imported.length}.</p> : null}
          </div>

          <div className="max-h-[620px] overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="sticky top-0 bg-[#f8faf9] text-[11px] uppercase text-[#77847e]"><tr><th className="px-4 py-3">Select</th><th className="px-4 py-3">#</th><th className="px-4 py-3">AWB</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{visible.map((shipment) => { const index = state.imported.findIndex((row) => row.id === shipment.id) + 1; return <tr key={shipment.id} className="border-t"><td className="px-4 py-3"><input type="checkbox" checked={selected.has(shipment.id)} onChange={() => toggle(shipment.id)} /></td><td className="px-4 py-3 text-xs text-[#87938d]">{index}</td><td className="px-4 py-3 font-mono font-black">{shipment.trackingNumber}</td><td className="px-4 py-3">{shipment.referenceNumber || "—"}</td><td className="px-4 py-3 text-right"><Link href={`/shipments/${shipment.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-[#13734b]">Open <ExternalLink className="size-3" /></Link></td></tr>; })}</tbody></table></div>
        </> : null}
      </section> : null}
    </div>
  );
}
