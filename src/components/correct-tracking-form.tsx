"use client";
import { useActionState, useState } from "react";
import { correctTrackingAction } from "@/app/(portal)/shipments/correct-tracking-action";
import { customerTrackingLabels, manualTrackingStatuses, type CustomerTrackingEvent } from "@/lib/customer-tracking";
import type { Shipment } from "@/lib/shipments";
function localTime(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const p = (type: string) => parts.find(part => part.type === type)?.value;
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:${p("second")}`;
}
export function CorrectTrackingForm({ shipment, events }: { shipment: Shipment; events: CustomerTrackingEvent[] }) {
  const scans = [...events].sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at) || b.id-a.id);
  const [eventId,setEventId] = useState(String(scans.find(e => e.status === "delivered")?.id ?? scans[0]?.id ?? ""));
  const [timezone,setTimezone] = useState(shipment.consignee_country_code === "CA" ? "America/Toronto" : "Asia/Dubai");
  const [state,action,pending] = useActionState(correctTrackingAction, { message: "" });
  const scan = scans.find(e => String(e.id) === eventId);
  if (!scan) return <p className="text-sm">No tracking scans are available to correct.</p>;
  return <section className="border-t pt-5">
    <h3 className="font-bold">Correct tracking status or date</h3>
    <p className="mt-2 text-sm text-[#74827b]">Choose the timezone before entering the corrected date and time. Correct an existing scan after a wrong upload. Before/after values and your name remain in Activity Log. Dispatch and physical warehouse custody use their own scan workflows. Completed shipments need finance review before reopening.</p>
    <form action={action} noValidate aria-busy={pending} className="mt-4 space-y-4">
      <input type="hidden" name="shipment_id" value={shipment.id}/><input type="hidden" name="updated_at" value={shipment.updated_at}/>
      <input type="hidden" name="expected_event_at" value={scan.created_at}/><input type="hidden" name="expected_status" value={scan.status}/>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold">Scan to correct<select name="event_id" value={eventId} disabled={pending} onChange={e => setEventId(e.target.value)} className="bp-input mt-1.5 w-full">{scans.map(e => <option key={e.id} value={e.id}>{customerTrackingLabels[e.status]} · {localTime(e.created_at,timezone).replace("T"," ")}</option>)}</select></label>
        <label className="text-xs font-bold">Corrected status<select key={eventId} name="status" defaultValue={scan.status} disabled={pending} className="bp-input mt-1.5 w-full">{manualTrackingStatuses.map(s => <option key={s} value={s}>{customerTrackingLabels[s]}</option>)}</select></label>
        <label className="text-xs font-bold">Timezone<select name="timezone" value={timezone} disabled={pending} onChange={e => setTimezone(e.target.value)} className="bp-input mt-1.5 w-full">{["America/Toronto","Asia/Dubai","UTC"].map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="text-xs font-bold">Corrected date and time<input key={`${eventId}:${timezone}`} type="datetime-local" step="1" name="occurred_at" defaultValue={localTime(scan.created_at,timezone)} disabled={pending} className="bp-input mt-1.5 w-full"/></label>
      </div>
      <label className="block text-xs font-bold">Reason for correction<input name="reason" minLength={5} maxLength={500} disabled={pending} className="bp-input mt-1.5 w-full"/></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm_correction" disabled={pending} className="mt-1"/>I confirm that this scan’s status, date and timezone are correct.</label>
      {state.message ? <p role="alert" className="text-sm font-semibold text-red-700">{state.message}</p> : null}
      <button disabled={pending} className="bp-button-primary min-w-44 disabled:opacity-60">{pending ? "Saving…" : "Save scan correction"}</button>
    </form>
  </section>;
}
