"use client";

import { useActionState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, UploadCloud } from "lucide-react";
import { importCarrierRateCardAction, type CarrierRateImportState } from "@/app/(portal)/shippers/[id]/carrier-rates/actions";
import { useShipperBusy } from "@/components/shipper-workspace";

const initialState: CarrierRateImportState = { status: "idle", message: "" };

export type CarrierRateFormDefaults = {
  carrierName?: string;
  cardName?: string;
  countryCode?: string;
  currency?: string;
  effectiveFrom?: string;
  copyZoneMappingsFrom?: string;
};

export function CarrierRateUploadForm({ shipperId, mode = "create", defaults }: {
  shipperId?: string;
  mode?: "create" | "update";
  defaults?: CarrierRateFormDefaults;
}) {
  const [state, action, pending] = useActionState(importCarrierRateCardAction, initialState);
  useShipperBusy(pending);

  return <section className="bp-panel p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8f6ee] text-[#13734b]"><UploadCloud className="size-5" /></span>
        <div><h2 className="font-black text-[#26372f]">{mode === "update" ? "Upload updated 3PL delivery charges" : "Upload 3PL delivery charges"}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-[#74827b]">{mode === "update" ? "This creates a new active version and keeps the old rate card in history. Matching Service Zone mappings are carried over when the 3PL zone codes still exist." : "Import the carrier’s delivery charges by country, service, zone and weight. BloomPath’s own fulfillment fee is configured separately by product group."}</p></div>
      </div>
      <a href="/api/carrier-rates/template" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cfe0d7] bg-white px-3 text-xs font-bold text-[#13734b] transition hover:bg-[#f5fbf7]"><Download className="size-4" /> Download bulk template</a>
    </div>

    <form action={action} className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {shipperId ? <input type="hidden" name="shipper_id" value={shipperId} /> : null}
      {defaults?.copyZoneMappingsFrom ? <input type="hidden" name="copy_zone_mappings_from" value={defaults.copyZoneMappingsFrom} /> : null}
      <label className="text-xs font-bold text-[#53645c]">3PL / carrier name *<input name="carrier_name" required minLength={2} maxLength={120} defaultValue={defaults?.carrierName} placeholder="e.g. BroadReach, GTA, another 3PL" className="bp-input mt-2" /></label>
      <label className="text-xs font-bold text-[#53645c]">Delivery rate card name *<input name="card_name" required minLength={2} maxLength={160} defaultValue={defaults?.cardName} placeholder="e.g. UAE Remote Areas" className="bp-input mt-2" /></label>
      <label className="text-xs font-bold text-[#53645c]">Effective from *<input name="effective_from" type="date" required defaultValue={defaults?.effectiveFrom} className="bp-input mt-2" /></label>
      <label className="text-xs font-bold text-[#53645c]">Destination country code *<input name="country_code" required maxLength={2} pattern="[A-Za-z]{2}" defaultValue={defaults?.countryCode} placeholder="AE" className="bp-input mt-2 uppercase" /></label>
      <label className="text-xs font-bold text-[#53645c]">Rate currency *<input name="currency" required maxLength={3} pattern="[A-Za-z]{3}" defaultValue={defaults?.currency} placeholder="AED" className="bp-input mt-2 uppercase" /></label>
      <label className="text-xs font-bold text-[#53645c]">Excel workbook *<span className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal text-[#697970]"><FileSpreadsheet className="size-4 shrink-0 text-[#13734b]" /><input name="file" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="min-w-0 flex-1 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-[#edf7f2] file:px-2 file:py-1.5 file:text-[11px] file:font-bold file:text-[#13734b]" /></span></label>
      <div className="md:col-span-2 xl:col-span-3"><p className="text-xs leading-5 text-[#87938d]">Accepts the Broad Reach workbook tabs (Canada Post, Regional Canada, Zones) or BloomPath’s bulk template. Up to 5 MB.</p></div>
      {state.message ? <div role={state.status === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm font-semibold md:col-span-2 xl:col-span-3 ${state.status === "error" ? "border border-[#efc7c7] bg-[#fff1f1] text-[#a13f3f]" : "border border-[#bfe3cf] bg-[#ebf8f1] text-[#176a47]"}`}>{state.message}</div> : null}
      <div className="md:col-span-2 xl:col-span-3"><button disabled={pending} className="bp-button-primary disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}{pending ? "Validating and importing delivery charges…" : mode === "update" ? "Upload updated rate file" : "Validate & upload delivery charges"}</button></div>
    </form>
  </section>;
}
