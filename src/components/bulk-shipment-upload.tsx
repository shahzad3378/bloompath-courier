"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  LoaderCircle,
  Printer,
  UploadCloud,
} from "lucide-react";
import {
  importShipmentsAction,
  initialBulkUploadState,
  type ImportedShipment,
} from "@/app/(portal)/shipments/import/actions";

function downloadResults(shipments: ImportedShipment[]) {
  const escape = (value: string) => {
    const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replaceAll('"', '""')}"`;
  };
  const rows = [
    ["tracking_number", "reference_number", "shipment_url"],
    ...shipments.map((shipment) => [
      shipment.trackingNumber,
      shipment.referenceNumber ?? "",
      `${window.location.origin}/shipments/${shipment.id}`,
    ]),
  ];
  const csv = rows.map((row) => row.map((value) => escape(String(value))).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "bloompath-courier-import-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function BulkShipmentUpload() {
  const [state, formAction, pending] = useActionState(importShipmentsAction, initialBulkUploadState);
  const [fileName, setFileName] = useState("");

  return (
    <div className="mx-auto max-w-[1250px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/shipments" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to shipments</Link>
          <p className="text-sm font-semibold text-[#188459]">Batch order booking</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Bulk shipment upload</h1>
          <p className="mt-2 text-sm text-[#74827b]">Upload up to 500 UAE shipments from Excel or CSV and generate all AWBs together.</p>
        </div>
        <a href="/templates/bloompath-courier-bulk-upload-template.xlsx" download className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#bdd9ca] bg-white px-5 text-sm font-bold text-[#13734b] shadow-sm transition hover:bg-[#edf7f2]"><Download className="size-4" /> Download Excel template</a>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <form action={formAction} className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:p-7">
          <div className="flex items-start gap-3 border-b border-[#edf1ef] pb-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#188459]"><UploadCloud className="size-5" /></span>
            <div><h2 className="font-bold text-[#26372f]">Choose your completed file</h2><p className="mt-1 text-sm text-[#7a8881]">Accepted: .xlsx or .csv · Maximum file size: 5 MB</p></div>
          </div>

          <label className="mt-6 grid min-h-52 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#bed5c9] bg-[#f8fbf9] p-6 text-center transition hover:border-[#2b9466] hover:bg-[#f1f8f4]">
            <input
              name="file"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              required
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
            />
            <span>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-[#13734b] shadow-sm"><FileSpreadsheet className="size-7" /></span>
              <span className="mt-4 block font-bold text-[#26372f]">{fileName || "Click to select an Excel or CSV file"}</span>
              <span className="mt-1 block text-xs text-[#7d8b84]">The file is validated before anything is booked.</span>
            </span>
          </label>

          <button disabled={pending || !fileName} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-6 text-sm font-bold text-white shadow-lg shadow-[#13734b]/15 transition hover:bg-[#0d5e3d] disabled:cursor-not-allowed disabled:opacity-55">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {pending ? "Validating and booking…" : "Validate file & generate AWBs"}
          </button>
          <p className="mt-3 text-center text-xs text-[#84918b]">If any row has an error, the entire upload is stopped so partial batches are never created.</p>
        </form>

        <aside className="rounded-2xl border border-[#e0e8e4] bg-[#10291f] p-6 text-white shadow-[0_8px_30px_rgba(24,51,39,0.08)]">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#65d79c]">3 simple steps</p>
          <ol className="mt-5 space-y-6">
            {[
              ["1", "Download the template", "Keep the header row unchanged and use the built-in dropdowns."],
              ["2", "Add one shipment per row", "Required fields have an asterisk. Remove no columns."],
              ["3", "Upload and review", "Fix row-level errors or open the generated AWBs after success."],
            ].map(([number, title, copy]) => (
              <li key={number} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-black text-[#65d79c]">{number}</span><span><span className="block text-sm font-bold">{title}</span><span className="mt-1 block text-xs leading-5 text-white/55">{copy}</span></span></li>
            ))}
          </ol>
          <div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-4 text-xs leading-5 text-white/60"><strong className="text-white/85">Tip:</strong> Keep phone numbers as text in Excel so the +971 prefix is preserved.</div>
        </aside>
      </div>

      {state.status !== "idle" ? (
        <section aria-live="polite" className={`mt-5 overflow-hidden rounded-2xl border bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)] ${state.status === "success" ? "border-[#b9dfca]" : "border-[#efcccc]"}`}>
          <div className={`flex items-start gap-3 px-5 py-4 ${state.status === "success" ? "bg-[#edf9f2] text-[#176d49]" : "bg-[#fff3f3] text-[#a63e3e]"}`}>
            {state.status === "success" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" />}
            <div><p className="font-bold">{state.status === "success" ? "Bulk upload complete" : "Upload needs attention"}</p><p className="mt-1 text-sm opacity-85">{state.message}</p></div>
          </div>

          {state.errors.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="px-5 py-3">Excel row</th><th className="px-5 py-3">Column</th><th className="px-5 py-3">Issue</th></tr></thead>
                <tbody className="divide-y divide-[#edf1ef]">{state.errors.map((error, index) => <tr key={`${error.row}-${error.field}-${index}`}><td className="px-5 py-3 font-bold text-[#34453c]">{error.row}</td><td className="px-5 py-3 font-mono text-xs text-[#596961]">{error.field}</td><td className="px-5 py-3 text-[#7c4545]">{error.message}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}

          {state.imported.length > 0 ? (
            <>
              <div className="flex flex-col justify-between gap-3 border-b border-[#e8eeeb] px-5 py-4 sm:flex-row sm:items-center">
                <p className="text-sm font-semibold text-[#516159]">Generated AWBs</p>
                <button type="button" onClick={() => downloadResults(state.imported)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#cddbd4] px-3 text-xs font-bold text-[#13734b]"><Download className="size-3.5" /> Download results CSV</button>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="sticky top-0 border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="px-5 py-3">AWB</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
                  <tbody className="divide-y divide-[#edf1ef]">{state.imported.map((shipment) => <tr key={shipment.id}><td className="px-5 py-3 font-bold text-[#25372e]">{shipment.trackingNumber}</td><td className="px-5 py-3 text-[#68776f]">{shipment.referenceNumber || "—"}</td><td className="px-5 py-3"><span className="flex justify-end gap-2"><Link href={`/shipments/${shipment.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dce6e1] px-2.5 text-xs font-bold text-[#13734b]">Open <ExternalLink className="size-3" /></Link><Link href={`/print/shipments/${shipment.id}?format=4x6`} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#13734b] px-2.5 text-xs font-bold text-white"><Printer className="size-3" /> Print</Link></span></td></tr>)}</tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
