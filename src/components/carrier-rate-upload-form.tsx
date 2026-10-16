"use client";

import { useActionState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, UploadCloud } from "lucide-react";
import { importCarrierRateCardAction, type CarrierRateImportState } from "@/app/(portal)/shippers/[id]/carrier-rates/actions";
import { useShipperBusy } from "@/components/shipper-workspace";

const initialState: CarrierRateImportState = { status: "idle", message: "" };

export function CarrierRateUploadForm({ shipperId }: { shipperId: string }) {
  const [state, action, pending] = useActionState(importCarrierRateCardAction, initialState);
  useShipperBusy(pending);

  return <section className="bp-panel p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8f6ee] text-[#13734b]"><UploadCloud className="size-5" /></span>
        <div><h2 className="font-black text-[#26372f]">Upload a 3PL rate card</h2><p className="mt-1 max-w-xl text-sm leading-6 text-[#74827b]">Add optional local or international carrier prices for this shipper. Customer delivery charges stay separate from 3PL costs.</p></div>
      </div>
      <a href="/api/carrier-rates/template" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cfe0d7] bg-white px-3 text-xs font-bold text-[#13734b] transition hover:bg-[#f5fbf7]"><Download className="size-4" /> Download bulk template</a>
    </div>

    <form action={action} className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <input type="hidden" name="shipper_id" value={shipperId} />
      <label className="text-xs font-bold text-[#53645c]">3PL / carrier name *<input name="carrier_name" required minLength={2} maxLength={120} defaultValue="BroadReach Logistics" placeholder="e.g. BroadReach, GTA, another 3PL" className="bp-input mt-2" /></label>
      <label className="text-xs font-bold text-[#53645c]">Rate card name *<input name="card_name" required minLength={2} maxLength={160} defaultValue="Broad Reach Canada Rates 2026" className="bp-input mt-2" /></label>
      <label className="text-xs font-bold text-[#53645c]">Effective from *<input name="effective_from" type="date" required defaultValue="2026-06-25" className="bp-input mt-2" /></label>
      <label className="text-xs font-bold text-[#53645c]">Destination country code *<input name="country_code" required maxLength={2} pattern="[A-Za-z]{2}" defaultValue="CA" className="bp-input mt-2 uppercase" /></label>
      <label className="text-xs font-bold text-[#53645c]">Rate currency *<input name="currency" required maxLength={3} pattern="[A-Za-z]{3}" defaultValue="CAD" className="bp-input mt-2 uppercase" /></label>
      <label className="text-xs font-bold text-[#53645c]">Excel workbook *<span className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal text-[#697970]"><FileSpreadsheet className="size-4 shrink-0 text-[#13734b]" /><input name="file" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="min-w-0 flex-1 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-[#edf7f2] file:px-2 file:py-1.5 file:text-[11px] file:font-bold file:text-[#13734b]" /></span></label>
      <div className="md:col-span-2 xl:col-span-3"><p className="text-xs leading-5 text-[#87938d]">Accepts the Broad Reach workbook tabs (Canada Post, Regional Canada, Zones) or BloomPath’s two-sheet bulk template. Up to 5 MB.</p></div>
      {state.message ? <div role={state.status === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm font-semibold md:col-span-2 xl:col-span-3 ${state.status === "error" ? "border border-[#efc7c7] bg-[#fff1f1] text-[#a13f3f]" : "border border-[#bfe3cf] bg-[#ebf8f1] text-[#176a47]"}`}>{state.message}</div> : null}
      <div className="md:col-span-2 xl:col-span-3"><button disabled={pending} className="bp-button-primary disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}{pending ? "Validating and importing rates…" : "Validate & upload rate card"}</button></div>
    </form>
  </section>;
}
