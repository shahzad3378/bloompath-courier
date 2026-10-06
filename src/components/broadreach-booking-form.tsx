"use client";

import { useActionState, useState } from "react";
import { checkBroadReachConnection, generateBroadReachAwb, type BroadReachState } from "@/app/(portal)/courier-integrations/broadreach/actions";

import {useCarrierBusy} from "@/components/carrier-workspace";
const initialState: BroadReachState = { status: "idle", message: "" };
export function BroadReachBookingForm({ configured, liveEnabled, initialAwb }: { configured: boolean; liveEnabled: boolean; initialAwb: string }) {
  const [state, action, pending] = useActionState(generateBroadReachAwb, initialState);
  const [connection, checkAction, checking] = useActionState(checkBroadReachConnection, initialState);
  const busy = pending || checking;
  useCarrierBusy(busy);
  const [mode, setMode] = useState("test");
  const [items, setItems] = useState([0]);
  return <form action={action} noValidate className="space-y-5">
    <h2 className="text-xl font-bold">Generate BroadReach AWB</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Canada uses ca_rateshop. USA uses us_rateshop. One shipment must represent one physical parcel.</p>
    <fieldset disabled={busy || !configured} className="mt-5 space-y-5 disabled:opacity-70">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">FastDrop AWB<input name="awb" defaultValue={initialAwb} required maxLength={100} className="bp-input mt-2 font-mono" /></label>
        <label className="text-sm font-semibold">Booking mode<select name="mode" value={mode} onChange={(event) => setMode(event.target.value)} className="bp-input mt-2"><option value="test">Test label</option><option value="live" disabled={!liveEnabled}>Live shipment{!liveEnabled ? " — awaiting activation" : ""}</option></select></label>
      </div>
      <div><button type="submit" formAction={checkAction} formNoValidate className="bp-button-secondary !min-h-11 !text-sm">{checking ? "Checking API connection…" : "Check API connection"}</button><p className="mt-2 text-sm text-[var(--muted)]">Checks rates using the saved shipment addresses and weight. No new AWB is created.</p></div>
      <label className="block max-w-xs text-sm font-semibold">Declared-value currency<input name="currency" placeholder="CAD or USD" required pattern="[A-Za-z]{3}" maxLength={3} className="bp-input mt-2 uppercase" /><span className="mt-1 block text-sm font-normal text-[var(--muted)]">Use the currency of the item values below.</span></label>
      <div><p className="text-sm font-semibold">Parcel dimensions (optional, cm)</p><div className="mt-2 grid gap-3 sm:grid-cols-3">{["length", "width", "height"].map((name) => <label key={name} className="text-sm capitalize">{name}<input name={name} type="number" step="0.1" min="0.1" className="bp-input mt-2" /></label>)}</div></div>
      <input type="hidden" name="item_count" value={items.length} />
      <div className="space-y-4"><h3 className="font-bold">Parcel contents</h3><p className="text-sm text-[var(--muted)]">Enter actual item values. USA cross-border shipments also need SKU, country of origin and a 10-digit HS code.</p>
        {items.map((key, index) => <fieldset key={key} className="rounded-xl border border-[var(--line)] p-4"><legend className="px-2 text-sm font-semibold">Item {index + 1}</legend><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">Description<input name={`description_${index}`} required maxLength={300} className="bp-input mt-2" /></label>
          <label className="text-sm">Quantity (pieces)<input name={`qty_${index}`} type="number" min={1} step={1} defaultValue={1} required className="bp-input mt-2" /></label>
          <label className="text-sm">Value per piece<input name={`value_${index}`} type="number" min={0} step="0.01" required className="bp-input mt-2" /></label>
          <label className="text-sm">SKU<input name={`sku_${index}`} maxLength={100} className="bp-input mt-2" /></label>
          <label className="text-sm">Country of origin<input name={`origin_${index}`} placeholder="e.g. CN" pattern="[A-Za-z]{2}" maxLength={2} className="bp-input mt-2 uppercase" /></label>
          <label className="text-sm">HS code<input name={`hscode_${index}`} inputMode="numeric" pattern="[0-9]{10}" maxLength={10} className="bp-input mt-2" /></label>
        </div></fieldset>)}
        <button type="button" onClick={() => setItems((current) => [...current, current.length])} disabled={items.length >= 100} className="bp-button-secondary !min-h-11 !text-sm focus-visible:outline-2 focus-visible:outline-offset-2">Add item</button>
        {items.length > 1 ? <button type="button" onClick={() => setItems((current) => current.slice(0, -1))} className="bp-button-secondary ml-2 !min-h-11 !text-sm focus-visible:outline-2 focus-visible:outline-offset-2">Remove last item</button> : null}
      </div>
      {mode === "live" ? <label className="flex items-start gap-3 rounded-xl bg-[var(--brand-soft)] p-4 text-sm"><input type="checkbox" name="confirm_live" required className="mt-1 size-4" /><span>Book this shipment with BroadReach. Live booking may incur shipping charges.</span></label> : <p className="text-sm text-[var(--muted)]">A test label does not assign a delivery partner or update shipment custody.</p>}
      <button type="submit" className="bp-button-primary !min-h-11 !text-sm disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2">{pending ? "Generating label…" : mode === "test" ? "Generate test label" : "Generate live AWB"}</button>
    </fieldset>
    <div aria-live="polite" aria-atomic="true" className="mt-4">{state.message ? <p className={`rounded-xl border p-4 text-sm ${state.status === "success" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--danger)]"}`}>{state.message}{state.tracking ? <span className="mt-2 block font-mono font-bold">{state.test ? "TEST" : "LIVE"} AWB: {state.tracking}</span> : null}</p> : null}</div>
    <div aria-live="polite" aria-atomic="true">{connection.message ? <p className={`mt-3 rounded-xl border p-4 text-sm ${connection.status === "success" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--danger)]"}`}>{connection.message}</p> : null}</div>
    {state.bookingId ? <a href={`/api/courier-integrations/broadreach/labels/${state.bookingId}`} className="bp-button-secondary mt-3 !min-h-11 !text-sm">Download {state.test ? "test " : ""}label</a> : null}
  </form>;
}
