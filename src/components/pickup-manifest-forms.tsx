"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, PackagePlus, ScanLine, Truck, Warehouse } from "lucide-react";
import {
  addManifestShipmentAction,
  createPickupManifestAction,
  markManifestPickedUpAction,
  receiveManifestShipmentAction,
  type ManifestActionState,
} from "@/app/(portal)/pickup-manifests/actions";

const initialManifestActionState: ManifestActionState = { status: "idle", message: "" };

function Feedback({ status, message }: { status: "idle" | "success" | "error"; message: string }) {
  if (!message) return null;
  return <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${status === "success" ? "bg-[#e8f6ee] text-[#176a47]" : "bg-[#fff0f0] text-[#a13f3f]"}`}>{message}</p>;
}

export function CreatePickupManifestForm({ defaultShipperName = "" }: { defaultShipperName?: string }) {
  const [state, action, pending] = useActionState(createPickupManifestAction, initialManifestActionState);
  return (
    <form action={action} className="rounded-2xl border border-[#dfe8e3] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]"><PackagePlus className="size-5" /></span><div><h2 className="font-bold text-[#26372f]">New pickup manifest</h2><p className="mt-0.5 text-xs text-[#7c8982]">Create a dispatch sheet, then scan its AWBs.</p></div></div>
      <label className="mt-4 block text-xs font-bold text-[#526159]">Shipper / pickup account<input name="shipper_name" required minLength={2} maxLength={120} defaultValue={defaultShipperName} placeholder="e.g. Royal Blunt" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm font-normal outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10" /></label>
      <Feedback status={state.status} message={state.message} />
      <button disabled={pending} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}{pending ? "Creating…" : "Create manifest"}</button>
    </form>
  );
}

export function ManifestAwbScanForm({ manifestId }: { manifestId: number }) {
  const [state, action, pending] = useActionState(addManifestShipmentAction, initialManifestActionState);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
    inputRef.current?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="rounded-2xl border border-[#cde3d7] bg-[#f8fcfa] p-5">
      <input type="hidden" name="manifest_id" value={manifestId} />
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#dff2e8] text-[#13734b]"><ScanLine className="size-5" /></span><div><h2 className="font-bold text-[#26372f]">Scan AWBs</h2><p className="mt-0.5 text-xs text-[#74827b]">Scanner ke baad Enter press hoga aur next scan ready ho jayega.</p></div></div>
      <div className="mt-4 flex gap-2"><input ref={inputRef} autoFocus autoComplete="off" name="tracking_number" required placeholder="Scan or enter AWB number" className="h-12 min-w-0 flex-1 rounded-xl border border-[#cbdcd3] bg-white px-4 font-mono text-sm font-bold uppercase outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10" /><button disabled={pending} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <ScanLine className="size-4" />}Add</button></div>
      <Feedback status={state.status} message={state.message} />
    </form>
  );
}

export function ConfirmPickupForm({ manifestId, drivers }: { manifestId: number; drivers: Array<{ id: string; full_name: string; employee_code: string | null }> }) {
  const [state, action, pending] = useActionState(markManifestPickedUpAction, initialManifestActionState);
  return (
    <form action={action} className="rounded-2xl border border-[#cbd9ec] bg-[#f6f9fd] p-5">
      <input type="hidden" name="manifest_id" value={manifestId} />
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e3edfa] text-[#376eb1]"><Truck className="size-5" /></span><div><h2 className="font-bold text-[#26372f]">Confirm shipper handover</h2><p className="mt-0.5 text-xs text-[#74827b]">AWBs will move to Picked Up.</p></div></div>
      <label className="mt-4 block text-xs font-bold text-[#526159]">Assigned driver (optional)<select name="assigned_driver_id" defaultValue="" className="mt-2 h-11 w-full rounded-xl border border-[#cedae9] bg-white px-3 text-sm font-normal outline-none focus:border-[#376eb1]"><option value="">Pickup team / assign later</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name || "Unnamed driver"}{driver.employee_code ? ` · ${driver.employee_code}` : ""}</option>)}</select></label>
      <Feedback status={state.status} message={state.message} />
      <button disabled={pending} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#376eb1] px-4 text-sm font-bold text-white disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Truck className="size-4" />}{pending ? "Confirming…" : "Confirm picked up"}</button>
    </form>
  );
}

export function WarehouseReceiveForm({ manifestId }: { manifestId: number }) {
  const [state, action, pending] = useActionState(receiveManifestShipmentAction, initialManifestActionState);
  const trackingRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success" && formRef.current) {
      const tracking = formRef.current.elements.namedItem("tracking_number") as HTMLInputElement | null;
      if (tracking) tracking.value = "";
    }
    trackingRef.current?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="rounded-2xl border border-[#e4d5b8] bg-[#fffaf1] p-5">
      <input type="hidden" name="manifest_id" value={manifestId} />
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f8ead0] text-[#a56b19]"><Warehouse className="size-5" /></span><div><h2 className="font-bold text-[#26372f]">Warehouse receiving scan</h2><p className="mt-0.5 text-xs text-[#7b7468]">Bin same rahega; successful scan ke baad AWB field clear hogi.</p></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]"><input ref={trackingRef} autoFocus autoComplete="off" name="tracking_number" required placeholder="Scan AWB" className="h-12 rounded-xl border border-[#e2d5be] bg-white px-4 font-mono text-sm font-bold uppercase outline-none focus:border-[#b97a21] focus:ring-4 focus:ring-[#b97a21]/10" /><input autoComplete="off" name="warehouse_location" required maxLength={50} placeholder="Bin e.g. A-01" className="h-12 rounded-xl border border-[#e2d5be] bg-white px-3 text-sm font-bold uppercase outline-none focus:border-[#b97a21]" /><button disabled={pending} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#a56b19] px-5 text-sm font-bold text-white disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Warehouse className="size-4" />}Receive</button></div>
      <Feedback status={state.status} message={state.message} />
    </form>
  );
}
