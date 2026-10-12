"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Globe2, UploadCloud } from "lucide-react";
import {
  importInternationalShipmentsAction,
  previewInternationalUploadAction,
  type InternationalUploadState,
} from "@/app/(portal)/shipments/import/international/actions";

const initial: InternationalUploadState = { status: "idle", message: "", errors: [], calculations: [], imported: [] };
const emptyQuick = { mode: "air", length: "", width: "", height: "", pieces: "1", actual: "" };

function weight(value: number) {
  return value.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InternationalShipmentUpload({ shippers, requiresShipperSelection }: { shippers: { id: string; full_name: string; email: string }[]; requiresShipperSelection: boolean }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");
  const [quick, setQuick] = useState(emptyQuick);

  const length = Number(quick.length), width = Number(quick.width), height = Number(quick.height);
  const pieces = Number(quick.pieces), actual = Number(quick.actual);
  const validQuick = [length, width, height].every((v) => Number.isFinite(v) && v > 0) && Number.isInteger(pieces) && pieces > 0 && Number.isFinite(actual) && actual >= 0;
  const volumeCbm = validQuick ? length * width * height * pieces / 1_000_000 : 0;
  const volumetricKg = validQuick ? (quick.mode === "air" ? length * width * height * pieces / 6000 : length * width * height * pieces / 1000) : 0;
  const chargeableKg = validQuick ? Math.max(actual, volumetricKg) : 0;
  const chargeableWm = validQuick && quick.mode === "sea" ? Math.max(volumeCbm, actual / 1000) : 0;

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      setState(await previewInternationalUploadAction(initial, new FormData(form)));
    } catch {
      setState({ ...initial, status: "error", message: "Preview failed. Check your connection and retry." });
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    const form = document.getElementById("international-upload-form") as HTMLFormElement | null;
    if (!form) return;
    setBusy(true);
    try {
      setState(await importInternationalShipmentsAction(state, new FormData(form)));
    } catch {
      setState({ ...initial, status: "error", message: "Import could not be completed. Check the shipment list before retrying." });
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-[1300px] space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href="/shipments" className="mb-3 inline-flex text-xs font-bold text-[#587068]">← Back to shipments</Link>
        <p className="text-sm font-semibold text-[#188459]">BloomPath SaaS · International</p>
        <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">International shipment upload</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#74827b]">Upload international shipments and review each shipment’s air or sea chargeable weight before creating AWBs.</p>
      </div>
      <a href="/shipments/import/international/template" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#bdd9ca] bg-white px-5 text-sm font-bold text-[#13734b]">
        <Download className="size-4" /> Download international template
      </a>
    </header>

    <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#188459]"><Globe2 className="size-5" /></span><div><h2 className="font-bold text-[#26372f]">Quick weight calculator</h2><p className="text-xs text-[#7a8881]">Dimensions are per piece, in centimetres.</p></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-[#516159]">Transport mode<select value={quick.mode} onChange={(e) => setQuick({ ...quick, mode: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"><option value="air">Air</option><option value="sea">Sea</option></select></label>
          <label className="text-xs font-bold text-[#516159]">Pieces<input type="number" min="1" step="1" value={quick.pieces} onChange={(e) => setQuick({ ...quick, pieces: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm font-normal" /></label>
          {(["length", "width", "height"] as const).map((key) => <label key={key} className="text-xs font-bold capitalize text-[#516159]">{key} (cm)<input type="number" min="0.1" step="any" value={quick[key]} onChange={(e) => setQuick({ ...quick, [key]: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm font-normal" /></label>)}
          <label className="text-xs font-bold text-[#516159]">Actual total weight (kg)<input type="number" min="0" step="any" value={quick.actual} onChange={(e) => setQuick({ ...quick, actual: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm font-normal" /></label>
        </div>
        {validQuick ? <div className="mt-5 rounded-xl bg-[#f3faf6] p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2"><p>Actual weight <strong>{weight(actual)} kg</strong></p><p>Total volume <strong>{volumeCbm.toFixed(4)} CBM</strong></p><p>Volumetric weight <strong>{weight(volumetricKg)} kg</strong></p>{quick.mode === "sea" ? <p>Sea chargeable W/M <strong>{chargeableWm.toFixed(3)}</strong></p> : null}</div>
          <p className="mt-3 border-t border-[#d8eadf] pt-3 text-base font-black text-[#13734b]">{quick.mode === "air" ? "Air chargeable weight" : "Sea equivalent chargeable weight"}: {weight(chargeableKg)} kg</p>
        </div> : <p className="mt-5 rounded-xl bg-[#f7f9f8] p-4 text-sm text-[#74827b]">Enter dimensions, pieces and actual weight to see the calculation.</p>}
        <p className="mt-3 text-[11px] leading-5 text-[#87938d]">Air: max(actual kg, total cm³ ÷ 6,000). Sea: max(actual kg, total cm³ ÷ 1,000); W/M is the greater of CBM and metric tonnes.</p>
      </div>

      <div className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
        <h2 className="font-bold text-[#26372f]">Upload international shipments</h2>
        <p className="mt-1 text-sm text-[#7a8881]">CSV or Excel · up to 5,000 shipments · dimensions required · one row per shipment</p>
        <form id="international-upload-form" onSubmit={preview} className="mt-5">
          {requiresShipperSelection ? <label className="mb-4 block text-xs font-bold text-[#516159]">Shipper for this batch *<select name="shipper_id" required defaultValue="" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"><option value="" disabled>Select active shipper</option>{shippers.map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.full_name} · {shipper.email}</option>)}</select></label> : null}
          <label className="grid min-h-40 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#bed5c9] bg-[#f8fbf9] p-6 text-center"><input type="file" name="file" accept=".csv,.xlsx" className="sr-only" required onChange={(e) => { setFilename(e.target.files?.[0]?.name ?? ""); setState(initial); }} /><span><FileSpreadsheet className="mx-auto size-8 text-[#13734b]" /><span className="mt-3 block font-bold text-[#26372f]">{filename || "Select international CSV or Excel"}</span></span></label>
          <button disabled={busy || !filename} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white disabled:opacity-55"><UploadCloud className="size-4" />{busy ? "Calculating…" : "Preview shipments and weights"}</button>
        </form>
      </div>
    </section>

    {state.status !== "idle" ? <section className={"overflow-hidden rounded-2xl border bg-white " + (state.status === "error" ? "border-[#efcccc]" : "border-[#b9dfca]")}>
      <div className={"flex items-start gap-3 px-5 py-4 " + (state.status === "error" ? "bg-[#fff3f3] text-[#a63e3e]" : "bg-[#edf9f2] text-[#176d49]")}>
        {state.status === "error" ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
        <div><p className="font-bold">{state.status === "error" ? "Review upload" : state.status === "success" ? "International upload complete" : "Review calculations before import"}</p><p className="mt-1 text-sm">{state.message}</p></div>
      </div>
      {state.errors.length ? <div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f8faf9]"><tr><th className="px-4 py-3">Row</th><th className="px-4 py-3">Column</th><th className="px-4 py-3">Issue</th></tr></thead><tbody>{state.errors.map((error, i) => <tr key={String(error.row) + "-" + i} className="border-t"><td className="px-4 py-3">{error.row}</td><td className="px-4 py-3 font-mono text-xs">{error.field}</td><td className="px-4 py-3">{error.message}</td></tr>)}</tbody></table></div> : null}
      {state.calculations.length ? <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-[#f8faf9] text-[11px] uppercase text-[#77847e]"><tr><th className="px-4 py-3">Row / AWB</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3">Dimensions × pieces</th><th className="px-4 py-3">Actual kg</th><th className="px-4 py-3">Volume</th><th className="px-4 py-3">Volumetric kg</th><th className="px-4 py-3">Chargeable kg</th><th className="px-4 py-3">Sea W/M</th><th className="px-4 py-3">AWB</th></tr></thead><tbody>{state.calculations.map((item) => {
        const created = state.imported.find((row) => row.referenceNumber === item.referenceNumber);
        return <tr key={String(item.row) + "-" + String(item.referenceNumber)} className="border-t"><td className="px-4 py-3">{item.row} · {item.referenceNumber || item.consignee}</td><td className="px-4 py-3 font-bold uppercase">{item.mode}</td><td className="px-4 py-3">{item.lengthCm}×{item.widthCm}×{item.heightCm} cm × {item.pieces}</td><td className="px-4 py-3">{weight(item.actualWeightKg)}</td><td className="px-4 py-3">{item.volumeCbm.toFixed(4)} CBM</td><td className="px-4 py-3">{weight(item.volumetricWeightKg)}</td><td className="px-4 py-3 font-black">{weight(item.chargeableWeightKg)}</td><td className="px-4 py-3">{item.chargeableWm === null ? "—" : item.chargeableWm.toFixed(3)}</td><td className="px-4 py-3 font-mono">{created?.trackingNumber || "Preview"}</td></tr>;
      })}</tbody></table></div> : null}
      {state.status === "ready" ? <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"><p className="text-xs text-[#74827b]">Confirm only after reviewing the chargeable weights above.</p><button type="button" onClick={confirmImport} disabled={busy} className="h-11 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white disabled:opacity-55">{busy ? "Creating shipments…" : "Confirm and create shipments"}</button></div> : null}
    </section> : null}
  </div>;
}
