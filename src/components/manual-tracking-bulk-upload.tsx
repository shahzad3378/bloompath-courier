"use client";

import { useActionState } from "react";
import { bulkRecordManualTrackingAction, type ManualTrackingBulkState } from "@/app/(portal)/warehouse/manual-tracking/bulk-actions";
import { customerTrackingLabels, manualTrackingStatuses } from "@/lib/customer-tracking";
import { trackingTimeZones } from "@/lib/tracking-timezones";

const initialState: ManualTrackingBulkState = { status: "idle", message: "", rows: [] };

export function ManualTrackingBulkUpload() {
  const [state, action, pending] = useActionState(bulkRecordManualTrackingAction, initialState);
  return <div className="space-y-5">
    <form action={action} onSubmit={(event) => {
      if (!window.confirm("Save tracking updates for the valid rows in this file? Duplicate AWBs and invalid rows will be skipped.")) event.preventDefault();
    }} className="bp-panel max-w-4xl space-y-5 p-5 sm:p-6">
      <div><h2 className="text-lg font-bold text-[#26372f]">Upload tracking updates</h2><p className="mt-1 text-sm leading-6 text-[#74827b]">One AWB per row. Delivered updates do not require a POD photo. The upload saves valid rows and lists any rows it skips.</p></div>
      <a href="/warehouse/manual-tracking/bulk-template" className="inline-flex rounded-lg bg-[#174ea6] px-4 py-2.5 text-xs font-bold text-white">Download Excel template</a>
      <label className="block text-xs font-bold text-[#526159]">Choose Excel or CSV file<input className="bp-input mt-2 w-full" type="file" name="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required /></label>
      <div className="rounded-xl bg-[#f7f9fc] p-4 text-xs leading-5 text-[#65736c]">
        <p><b>Required columns:</b> tracking_number, status, occurred_at. time_zone is optional; when blank, the system detects the shipment’s local zone.</p>
        <p className="mt-2"><b>Date/time:</b> YYYY-MM-DDTHH:mm. Use the local time when the scan happened.</p>
        <p className="mt-2"><b>Status codes:</b> {manualTrackingStatuses.map((status) => <span key={status} className="mr-2 inline-block"><code>{status}</code> = {customerTrackingLabels[status]}</span>)}</p>
        <p className="mt-2"><b>time_zone values:</b> {trackingTimeZones.map((zone) => <code key={zone.value} className="mr-2">{zone.value}</code>)}. Leave blank to auto-detect.</p>
        <p className="mt-2">Maximum 500 rows and 5 MB. Each AWB can appear once per file. POD is not included in this upload.</p>
      </div>
      <button disabled={pending} className="bp-button-primary disabled:opacity-50">{pending ? "Saving updates…" : "Upload tracking updates"}</button>
    </form>
    {state.message ? <section className="bp-panel space-y-3 p-5" aria-live="polite">
      <p role={state.status === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${state.status === "success" ? "bg-blue-50 text-blue-800" : "bg-red-50 text-red-700"}`}>{state.message}</p>
      {state.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b border-[#dce6e1] text-[#526159]"><th className="px-2 py-2">File row</th><th className="px-2 py-2">AWB</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Result</th></tr></thead><tbody>{state.rows.map((row) => <tr key={row.row} className="border-b border-[#edf1ef]"><td className="px-2 py-2">{row.row}</td><td className="px-2 py-2 font-mono">{row.trackingNumber || "—"}</td><td className="px-2 py-2">{row.status ? customerTrackingLabels[row.status as keyof typeof customerTrackingLabels] ?? row.status : "—"}</td><td className={`px-2 py-2 font-medium ${row.ok ? "text-[#176a47]" : "text-[#a13f3f]"}`}>{row.message}</td></tr>)}</tbody></table></div> : null}
    </section> : null}
  </div>;
}
