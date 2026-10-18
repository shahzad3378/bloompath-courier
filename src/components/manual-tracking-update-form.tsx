"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle, ScanLine } from "lucide-react";
import { recordManualTrackingAction, lookupManualTrackingTimeZoneAction, type ManualTrackingState } from "@/app/(portal)/warehouse/manual-tracking/actions";
import { customerTrackingLabels, manualTrackingStatuses } from "@/lib/customer-tracking";
import { isTrackingTimeZone, trackingTimeZones, type TrackingTimeZone } from "@/lib/tracking-timezones";

const initialState: ManualTrackingState = { status: "idle", message: "" };

export function ManualTrackingUpdateForm({ defaultDateTime }: { defaultDateTime: string }) {
  const [state, action, pending] = useActionState(recordManualTrackingAction, initialState);
  const [selectedStatus, setSelectedStatus] = useState<(typeof manualTrackingStatuses)[number]>(manualTrackingStatuses[0]);
  const [occurredAt, setOccurredAt] = useState(defaultDateTime);
  const [timeZone, setTimeZone] = useState<TrackingTimeZone>("Asia/Dubai");
  const [timeZoneHint, setTimeZoneHint] = useState("Scan or enter an AWB to detect the scan location’s local time.");
  const [lookingUp, setLookingUp] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const awbRef = useRef<HTMLInputElement>(null);
  const lookupSequence = useRef(0);
  const manuallySelectedTimeZone = useRef(false);
  const dateTimeEdited = useRef(false);

  async function detectTimeZone(trackingNumber: string, status: string) {
    const tracking = trackingNumber.trim().toUpperCase();
    if (!tracking || manuallySelectedTimeZone.current) return;
    const sequence = ++lookupSequence.current;
    setLookingUp(true);
    setTimeZoneHint("Detecting the scan location’s time zone…");
    try {
      const result = await lookupManualTrackingTimeZoneAction(tracking, status);
      if (sequence !== lookupSequence.current) return;
      if (result.status === "success") {
        setTimeZone(result.timeZone);
        setTimeZoneHint(`Detected ${result.label} from this shipment’s location.`);
        if (!dateTimeEdited.current) setOccurredAt(result.localDateTime);
      } else {
        setTimeZoneHint(result.message);
      }
    } catch {
      if (sequence === lookupSequence.current) setTimeZoneHint("Could not detect the scan time zone. Choose it manually before saving.");
    } finally {
      if (sequence === lookupSequence.current) setLookingUp(false);
    }
  }

  useEffect(() => {
    if (state.status === "success") {
      if (awbRef.current) awbRef.current.value = "";
      manuallySelectedTimeZone.current = false;
      dateTimeEdited.current = false;
      lookupSequence.current += 1;
    }
    awbRef.current?.focus();
  }, [state, defaultDateTime]);

  return <form ref={formRef} action={action} noValidate aria-busy={pending || lookingUp} className="bp-panel p-5 sm:p-6">
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]"><ScanLine className="size-5" aria-hidden="true" /></span>
      <div><h2 className="font-bold text-[#26372f]">Scan or enter an AWB</h2><p className="mt-1 text-xs leading-5 text-[#74827b]">Choose the customer-visible milestone and when it happened. The scan time zone is detected from the shipment’s Canadian city when available.</p></div>
    </div>
    <fieldset disabled={pending} className="mt-5 grid gap-4 sm:grid-cols-2 disabled:opacity-60">
      <label className="sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-[#526159]">Tracking / AWB number</span><input ref={awbRef} autoFocus autoComplete="off" name="tracking_number" maxLength={40} required placeholder="Scan barcode or enter AWB" className="bp-input h-12 w-full font-mono uppercase" onChange={() => {
        lookupSequence.current += 1;
        manuallySelectedTimeZone.current = false;
        dateTimeEdited.current = false;
        setTimeZone("Asia/Dubai");
        setOccurredAt(defaultDateTime);
        setTimeZoneHint("Scan or enter an AWB to detect the scan location’s local time.");
      }} onBlur={(event) => { void detectTimeZone(event.currentTarget.value, selectedStatus); }} onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void detectTimeZone(event.currentTarget.value, selectedStatus);
        }
      }} /></label>
      <label><span className="mb-2 block text-xs font-semibold text-[#526159]">Tracking status</span><select name="status" value={selectedStatus} onChange={(event) => {
        const status = event.target.value as (typeof manualTrackingStatuses)[number];
        setSelectedStatus(status);
        if (awbRef.current?.value && !manuallySelectedTimeZone.current) void detectTimeZone(awbRef.current.value, status);
      }} required className="bp-input h-12 w-full"><option value="" disabled>Select status</option>{manualTrackingStatuses.map((status) => <option key={status} value={status}>{customerTrackingLabels[status]}</option>)}</select></label>
      <label><span className="mb-2 block text-xs font-semibold text-[#526159]">Scan time zone</span><select name="time_zone" value={timeZone} onChange={(event) => {
        const nextTimeZone = event.target.value;
        if (isTrackingTimeZone(nextTimeZone)) {
          manuallySelectedTimeZone.current = true;
          setTimeZone(nextTimeZone);
          const label = trackingTimeZones.find((zone) => zone.value === nextTimeZone)?.label ?? nextTimeZone;
          setTimeZoneHint(`Using ${label} for this status date and time.`);
        }
      }} required className="bp-input h-12 w-full">{trackingTimeZones.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></label>
      <label className="sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-[#526159]">Status date and time · {timeZone}</span><input type="datetime-local" name="occurred_at" value={occurredAt} onChange={(event) => { dateTimeEdited.current = true; setOccurredAt(event.target.value); }} required className="bp-input h-12 w-full" /></label>
    </fieldset>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-[#74827b]" aria-live="polite">{lookingUp ? <span className="inline-flex items-center gap-1.5"><LoaderCircle className="size-3 animate-spin" aria-hidden="true" />{timeZoneHint}</span> : timeZoneHint}</p><p className="text-[11px] text-[#87938d]">Backdated scans keep the date and local time you enter.</p></div>
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3"><button disabled={pending || lookingUp} className="bp-button-primary gap-2 !min-h-11 !text-sm">{pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ScanLine className="size-4" aria-hidden="true" />}{pending ? "Saving update…" : lookingUp ? "Detecting time zone…" : "Update customer tracking"}</button></div>
    <div aria-live="polite" aria-atomic="true">{state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`mt-4 rounded-lg px-3 py-2 text-xs font-semibold ${state.status === "success" ? "bg-[#e8f6ee] text-[#176a47]" : "bg-[#fff0f0] text-[#a13f3f]"}`}>{state.message}</p> : null}</div>
  </form>;
}
