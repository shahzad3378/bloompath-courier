"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, ExternalLink, FileSpreadsheet, LoaderCircle, Printer, UploadCloud } from "lucide-react";
import { importShipmentsAction, type BulkUploadState, type ImportedShipment } from "@/app/(portal)/shipments/import/actions";

const initialBulkUploadState: BulkUploadState = { status: "idle", message: "", errors: [], imported: [] };

function downloadResults(shipments: ImportedShipment[]) {
  const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const rows = [["tracking_number", "reference_number", "shipment_url"], ...shipments.map((shipment) => [shipment.trackingNumber, shipment.referenceNumber ?? "", `${window.location.origin}/shipments/${shipment.id}`])];
  const csv = rows.map((row) => row.map((value) => escape(String(value))).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "courieros-import-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

type ShipperOption = { id: string; full_name: string; email: string };

export function BulkShipmentUpload({ shippers, requiresShipperSelection }: { shippers: ShipperOption[]; requiresShipperSelection: boolean }) {
  const [state, formAction, pending] = useActionState(importShipmentsAction, initialBulkUploadState);
  const [fileName, setFileName] = useState("");
  const importedIds = state.imported.map((shipment) => shipment.id).join(",");

  return (
    <div className="mx-auto max-w-[1250px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/shipments" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to shipments</Link>
          <p className="text-sm font-semibold text-[#188459]">Batch order booking</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Universal bulk shipment upload</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#74827b]">One format for Canada, USA, UAE and future markets. Postal/ZIP, province/state and country codes are stored for zone matching and route planning.</p>
        </div>
        <a href="/shipments/import/template" className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#bdd9ca] bg-white px-5 text-sm font-bold text-[#13734b] shadow-sm transition hover:bg-[#edf7f2]"><Download className="size-4" /> Download universal CSV</a>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <form action={formAction} className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:p-7">
          <div className="flex items-start gap-3 border-b border-[#edf1ef] pb-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#188459]"><UploadCloud className="size-5" /></span>
            <div><h2 className="font-bold text-[#26372f]">Choose your completed file</h2><p className="mt-1 text-sm text-[#7a8881]">Accepted: .xlsx or .csv · Maximum 500 shipments · 5 MB</p></div>
          </div>

          {requiresShipperSelection ? (
            <label className="mt-5 block text-xs font-bold text-[#516159]">Shipper for this batch *
              <select name="shipper_id" required defaultValue="" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal text-[#25352d]">
                <option value="" disabled>Select active shipper</option>
                {shippers.map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.full_name} · {shipper.email}</option>)}
              </select>
              {shippers.length === 0 ? <span className="mt-2 block text-xs font-semibold text-[#a13f3f]">No active shipper is available.</span> : null}
            </label>
          ) : null}

          <label className="mt-6 grid min-h-52 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#bed5c9] bg-[#f8fbf9] p-6 text-center transition hover:border-[#2b9466] hover:bg-[#f1f8f4]">
            <input name="file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" required onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} />
            <span>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-[#13734b] shadow-sm"><FileSpreadsheet className="size-7" /></span>
              <span className="mt-4 block font-bold text-[#26372f]">{fileName || "Click to select an Excel or CSV file"}</span>
              <span className="mt-1 block text-xs text-[#7d8b84]">Country defaults come from the SaaS tenant. CA/US deliveries require Postal/ZIP code.</span>
            </span>
          </label>

          <button disabled={pending || !fileName} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-6 text-sm font-bold text-white disabled:opacity-55">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {pending ? "Validating and booking…" : "Validate file & generate AWBs"}
          </button>
          <p className="mt-3 text-center text-xs text-[#84918b]">Configured postal-prefix/city zones are matched automatically during import.</p>
        </form>

        <aside className="rounded-2xl border border-[#e0e8e4] bg-[#10291f] p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#65d79c]">Universal address rules</p>
          <div className="mt-5 space-y-5 text-xs leading-5 text-white/65">
            <p><strong className="text-white">Canada:</strong> City + Province + Postal Code + CA. Example: Toronto · ON · M4P 0G2.</p>
            <p><strong className="text-white">USA:</strong> City + State + ZIP + US. Example: New York · NY · 10001.</p>
            <p><strong className="text-white">UAE:</strong> City + AE. Postal code can remain blank where unavailable.</p>
            <p><strong className="text-white">Phones:</strong> Keep phone numbers as text so international prefixes are preserved.</p>
          </div>
        </aside>
      </div>

      {state.status !== "idle" ? (
        <section aria-live="polite" className={`mt-5 overflow-hidden rounded-2xl border bg-white ${state.status === "success" ? "border-[#b9dfca]" : "border-[#efcccc]"}`}>
          <div className={`flex items-start gap-3 px-5 py-4 ${state.status === "success" ? "bg-[#edf9f2] text-[#176d49]" : "bg-[#fff3f3] text-[#a63e3e]"}`}>
            {state.status === "success" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" />}
            <div><p className="font-bold">{state.status === "success" ? "Bulk upload complete" : "Upload needs attention"}</p><p className="mt-1 text-sm opacity-85">{state.message}</p></div>
          </div>

          {state.errors.length > 0 ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b bg-[#f8faf9] text-[11px] uppercase text-[#77847e]"><tr><th className="px-5 py-3">Row</th><th className="px-5 py-3">Column</th><th className="px-5 py-3">Issue</th></tr></thead><tbody className="divide-y">{state.errors.map((error, index) => <tr key={`${error.row}-${error.field}-${index}`}><td className="px-5 py-3 font-bold">{error.row}</td><td className="px-5 py-3 font-mono text-xs">{error.field}</td><td className="px-5 py-3 text-[#7c4545]">{error.message}</td></tr>)}</tbody></table></div>
          ) : null}

          {state.imported.length > 0 ? (
            <>
              <div className="flex flex-col justify-between gap-3 border-b px-5 py-4 lg:flex-row lg:items-center">
                <p className="text-sm font-semibold text-[#516159]">Generated AWBs</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/print/shipments/bulk?ids=${encodeURIComponent(importedIds)}&format=4x6`} target="_blank" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#13734b] px-3 text-xs font-bold text-white"><Printer className="size-3.5" /> Print all 4×6</Link>
                  <Link href={`/print/shipments/bulk?ids=${encodeURIComponent(importedIds)}&format=a4`} target="_blank" className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold"><Printer className="size-3.5" /> Print all A4</Link>
                  <button type="button" onClick={() => downloadResults(state.imported)} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold text-[#13734b]"><Download className="size-3.5" /> Results CSV</button>
                </div>
              </div>
              <div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="sticky top-0 border-b bg-[#f8faf9] text-[11px] uppercase text-[#77847e]"><tr><th className="px-5 py-3">AWB</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y">{state.imported.map((shipment) => <tr key={shipment.id}><td className="px-5 py-3 font-bold">{shipment.trackingNumber}</td><td className="px-5 py-3">{shipment.referenceNumber || "—"}</td><td className="px-5 py-3"><span className="flex justify-end gap-2"><Link href={`/shipments/${shipment.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold text-[#13734b]">Open <ExternalLink className="size-3" /></Link><Link href={`/print/shipments/${shipment.id}?format=4x6`} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#13734b] px-2.5 text-xs font-bold text-white"><Printer className="size-3" /> Print</Link></span></td></tr>)}</tbody></table></div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
