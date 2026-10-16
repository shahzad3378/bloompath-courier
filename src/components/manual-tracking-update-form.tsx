"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, ScanLine } from "lucide-react";
import { recordManualTrackingAction, type ManualTrackingState } from "@/app/(portal)/warehouse/manual-tracking/actions";
import { customerTrackingLabels, manualTrackingStatuses } from "@/lib/customer-tracking";

const initialState: ManualTrackingState = { status: "idle", message: "" };

export function ManualTrackingUpdateForm({ defaultDateTime }: { defaultDateTime: string }) {
  const [state, action, pending] = useActionState(recordManualTrackingAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const awbRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
    awbRef.current?.focus();
  }, [state]);

  return <form ref={formRef} action={action} noValidate aria-busy={pending} className="bp-panel p-5 sm:p-6">
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]"><ScanLine className="size-5" aria-hidden="true" /></span>
      <div><h2 className="font-bold text-[#26372f]">Scan or enter an AWB</h2><p className="mt-1 text-xs leading-5 text-[#74827b]">Choose the customer-visible milestone and when it happened. This updates tracking history without changing delivery custody or proof-of-delivery records.</p></div>
    </div>
    <fieldset disabled={pending} className="mt-5 grid gap-4 sm:grid-cols-2 disabled:opacity-60">
      <label className="sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-[#526159]">Tracking / AWB number</span><input ref={awbRef} autoFocus autoComplete="off" name="tracking_number" maxLength={40} required placeholder="Scan barcode or enter AWB" className="bp-input h-12 w-full font-mono uppercase" /></label>
      <label><span className="mb-2 block text-xs font-semibold text-[#526159]">Tracking status</span><select name="status" defaultValue={manualTrackingStatuses[0]} required className="bp-input h-12 w-full"><option value="" disabled>Select status</option>{manualTrackingStatuses.map((status) => <option key={status} value={status}>{customerTrackingLabels[status]}</option>)}</select></label>
      <label><span className="mb-2 block text-xs font-semibold text-[#526159]">Status date and time · Dubai</span><input type="datetime-local" name="occurred_at" defaultValue={defaultDateTime} required className="bp-input h-12 w-full" /></label>
    </fieldset>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-[#87938d]">You can select an earlier date and time for a backdated scan.</p><button disabled={pending} className="bp-button-primary gap-2 !min-h-11 !text-sm">{pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ScanLine className="size-4" aria-hidden="true" />}{pending ? "Saving update…" : "Update customer tracking"}</button></div>
    <div aria-live="polite" aria-atomic="true">{state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`mt-4 rounded-lg px-3 py-2 text-xs font-semibold ${state.status === "success" ? "bg-[#e8f6ee] text-[#176a47]" : "bg-[#fff0f0] text-[#a13f3f]"}`}>{state.message}</p> : null}</div>
  </form>;
}
