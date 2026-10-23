"use client";
import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, ScanLine, Warehouse } from "lucide-react";
import { receiveWarehouseShipmentAction, type WarehouseReturnActionState } from "@/app/(portal)/warehouse/actions";

const initialState: WarehouseReturnActionState = { status: "idle", message: "" };
export function WarehouseReceiveForm() {
  const [state, action, pending] = useActionState(receiveWarehouseShipmentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  useEffect(() => {
    if (state.status !== "idle") {
      formRef.current?.reset();
      submittingRef.current = false;
    }
    inputRef.current?.focus();
  }, [state]);
  useEffect(() => () => { if (scanTimerRef.current) clearTimeout(scanTimerRef.current); }, []);
  function submitScan() {
    if (submittingRef.current || pending || !inputRef.current?.value.trim()) return;
    formRef.current?.requestSubmit();
  }
  return <form ref={formRef} action={action} onSubmit={(event) => { if (submittingRef.current) { event.preventDefault(); return; } submittingRef.current = true; }} noValidate className="bp-panel p-5" aria-busy={pending}>
    <div className="flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Warehouse className="size-5" aria-hidden="true" /></span>
      <div><h2 className="font-bold">Warehouse receive scan</h2><p id="warehouse-receive-help" className="mt-1 text-xs text-[var(--muted)]">Scan an AWB or customer reference. Each scan receives automatically and gets ready for the next parcel.</p></div>
    </div>
    <fieldset disabled={pending} className="mt-4 disabled:opacity-60">
      <label htmlFor="warehouse-receive-awb" className="mb-2 block text-xs font-semibold">Inbound AWB / reference number</label>
      <div className="flex flex-wrap gap-2">
        <input id="warehouse-receive-awb" ref={inputRef} autoFocus autoComplete="off" name="tracking_number" maxLength={80} placeholder="Scan / enter AWB or reference" aria-describedby="warehouse-receive-help warehouse-receive-result" aria-invalid={state.status === "error"} onChange={() => { if (scanTimerRef.current) clearTimeout(scanTimerRef.current); scanTimerRef.current = setTimeout(submitScan, 250); }} className="bp-input min-w-0 flex-1 basis-40 font-mono uppercase" />
        <button className="bp-button-primary gap-2 !min-h-12 !text-sm" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ScanLine className="size-4" aria-hidden="true" />}{pending ? "Receiving…" : "Receive"}</button>
      </div>
    </fieldset>
    <div id="warehouse-receive-result" aria-live="polite" aria-atomic="true">{state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${state.status === "success" ? "bg-[#e8f6ee] text-[#176a47]" : "bg-[#fff0f0] text-[#a13f3f]"}`}>{state.message}</p> : null}</div>
  </form>;
}
