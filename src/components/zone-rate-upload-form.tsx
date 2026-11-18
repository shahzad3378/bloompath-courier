"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { importZoneRatesAction, type ZoneRateImportState } from "@/app/(portal)/shippers/[id]/zone-rates/import-actions";

export function ZoneRateUploadForm({ shipperId, currency }: { shipperId: string; currency: string }) {
  const [file, setFile] = useState<File | null>(null), [previewFile, setPreviewFile] = useState<File | null>(null);
  const [state, action, pending] = useActionState(async (previous: ZoneRateImportState, form: FormData) => {
    if (file) form.set("file", file);
    form.set("phase", previewFile === file && file !== null && previous.status === "preview" ? "import" : "preview");
    const result = await importZoneRatesAction(previous, form);
    if (result.status === "preview") setPreviewFile(file);
    if (result.status === "success") { setFile(null); setPreviewFile(null); }
    return result;
  }, { status: "idle", message: "" } as ZoneRateImportState);
  const ready = state.status === "preview" && previewFile === file && file !== null;
  return <section className="bp-panel mt-6 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black">Upload zone rates from Excel</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#74827b]">Download this shipper&apos;s template, fill agreed zone and weight rates in {currency}, then validate before importing. Each customer keeps a separate rate card.</p></div><Link href={`/shippers/${shipperId}/zone-rates/template`} className="bp-button-secondary">Download Excel template</Link></div>
    <form action={action} className="mt-5 space-y-4"><input type="hidden" name="shipper_id" value={shipperId} /><label className="block text-xs font-bold">Zone-rate file (.xlsx, up to 5 MB)<input name="file" type="file" accept=".xlsx" disabled={pending} onChange={event => { setFile(event.target.files?.[0] || null); setPreviewFile(null); }} className="bp-input mt-2 block w-full" /></label>{file ? <p className="text-xs text-[#74827b]">Selected: {file.name}</p> : null}
      {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`rounded-xl border p-4 text-sm ${state.status === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-[#bfe3cf] bg-[#ebf8f1] text-[#176a47]"}`}>{state.message}</p> : null}
      {ready ? <div className="overflow-x-auto"><p className="mb-2 text-xs text-[#74827b]">Preview: first {state.preview?.length} of {state.count} rates. Import applies all validated rows.</p><table className="w-full min-w-[750px] text-left text-xs"><thead><tr>{["Zone ID", "Service", "Currency", "Delivery", "Weight KG", "Extra KG", "COD fee", "Return"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{state.preview?.map((row, i) => <tr key={i} className="border-t"><td className="p-2">{row.service_zone_id}</td><td>{row.service_type}</td><td>{row.currency}</td><td>{row.delivery_rate.toFixed(2)}</td><td>{row.weight_from_kg}–{row.weight_to_kg ?? "Unlimited"}</td><td>{row.additional_kg_rate.toFixed(2)}</td><td>{row.cod_fee.toFixed(2)}</td><td>{row.return_charge_enabled ? row.return_rate.toFixed(2) : "Free"}</td></tr>)}</tbody></table></div> : null}
      <div className="flex flex-wrap items-center gap-4"><button disabled={pending || !file} className="bp-button-primary disabled:opacity-50">{pending ? "Processing…" : ready ? `Confirm import of ${state.count} rates` : "Validate & preview"}</button><p className="text-xs text-[#74827b]">Invalid files save nothing. Only matching tiers for this shipper are replaced.</p></div>
    </form><p className="mt-4 text-xs leading-6 text-[#74827b]">Rates apply to new delivery/return finance entries from the import time. Existing finance snapshots and issued invoices keep their original charges. A shipment must be assigned to the matching service zone for zone pricing to apply.</p>
  </section>;
}
