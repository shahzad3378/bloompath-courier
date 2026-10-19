"use client";
import {useActionState,useState,useEffect,useRef} from "react";
import {generateGtaAwb,checkGtaRates,checkGtaTracking,checkGtaCredentials,recoverGtaLabel,type GtaState} from "@/app/(portal)/courier-integrations/gta-airskip/actions";
import {useCarrierBusy} from "@/components/carrier-workspace";
import {gtaSenderTerminals,gtaDropoffAddress} from "@/lib/gta-airskip";
const initial: GtaState = {status:"idle",message:""};
function Result({state}:{state:GtaState}) { const ref = useRef<HTMLParagraphElement>(null); useEffect(() => { if(state.status === "error") ref.current?.focus(); },[state]); return <div aria-live="polite" aria-atomic="true">{state.message ? <p ref={ref} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} className="mt-4 rounded-xl border border-[var(--line)] p-4 text-sm">{state.message}{state.tracking ? <strong className="mt-2 block font-mono">Partner AWB: {state.tracking}</strong> : null}</p> : null}</div>; }
export function GtaBookingForm({configured,test,liveEnabled,initialAwb,pickup}:{configured:boolean;test:boolean;liveEnabled:boolean;initialAwb:string;pickup?:{name:string;address:string;address2:string;city:string;state:string;postalCode:string;country:string}|null}) {
  const [state,action,pending] = useActionState(generateGtaAwb,initial);
  const [rates,rateAction,checking] = useActionState(checkGtaRates,initial);
  const [items,setItems] = useState<number[]>([]);
  useCarrierBusy(pending || checking);
  return <form action={action} noValidate className="space-y-5">
    <h2 className="text-xl font-bold">Create a GTA label</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">{test ? "QA environment: labels do not assign a live delivery partner." : "Production environment: booking can incur shipping charges."} One saved FastDrop shipment represents one parcel.</p>
    <fieldset disabled={!configured || pending || checking} className="mt-5 space-y-5 disabled:opacity-70">
      <div className="rounded-2xl bg-[var(--background)] p-4"><h3 className="mb-4 text-sm font-bold">Shipment & service</h3><div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">FastDrop AWB<input name="awb" defaultValue={initialAwb} className="bp-input mt-2 font-mono" /></label>
        <label className="text-sm font-semibold">Sender terminals<input name="terminal" value={gtaSenderTerminals} readOnly className="bp-input mt-2" /><span className="mt-2 block text-xs font-normal text-[var(--muted)]">All four GTA terminals are sent together for rate shopping.</span></label>
        <div className="text-sm font-semibold">GTA service<p className="bp-input mt-2 font-normal">Automatic — GTA selects the available service.</p></div>
        <label className="text-sm font-semibold">Package type<input name="pieces_type" defaultValue="Box" placeholder="Provider-approved type, e.g. Box" maxLength={50} className="bp-input mt-2" /></label>
      </div></div>
      {pickup ? <div className="rounded-xl border border-[var(--line)] p-4 text-sm"><label className="flex items-start gap-3"><input name="use_warehouse" type="checkbox" defaultChecked className="mt-1 size-4" /><span>Use FastDrop sender address<br /><strong>{pickup.name}</strong><br />{pickup.address}{pickup.address2 ? `, ${pickup.address2}` : ""}<br />{pickup.city}, {pickup.state}, {pickup.postalCode}, {pickup.country}</span></label><p className="mt-2 text-[var(--muted)]">The original shipper stays on the FastDrop shipment. Uncheck to use its saved sender address.</p></div> : null}
      <p className="rounded-xl border border-[var(--line)] p-4 text-sm"><strong className="block">Parcel drop-off location</strong>{gtaDropoffAddress}<span className="mt-2 block text-[var(--muted)]">Bring parcels here. The label uses the sender address selected above.</span></p>
      <label className="flex items-start gap-3 text-sm"><input name="confirm_induction" type="checkbox" className="mt-1 size-4" /><span>I confirm the selected sender address is correct.</span></label>
      <div><h3 className="text-sm font-semibold">Required parcel dimensions (cm)</h3><div className="mt-2 grid gap-3 sm:grid-cols-3">{["length","width","height"].map(name => <label key={name} className="text-sm capitalize">{name}<input name={name} type="number" step="any" min="0" className="bp-input mt-2" /></label>)}</div></div>
      <details className="rounded-xl border border-[var(--line)] p-4"><summary className="cursor-pointer text-sm font-semibold">Optional services · signature & insurance</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm"><input name="signature" type="checkbox" className="size-4" />Signature required</label><label className="flex items-center gap-2 text-sm"><input name="insurance" type="checkbox" className="size-4" />Insurance required</label><label className="text-sm">Insurance declared value (if insured)<input name="insurance_value" type="number" step="any" min="0" className="bp-input mt-2" /></label></div></details>
      <div className="space-y-4 rounded-xl border border-[var(--line)] p-4"><h3 className="font-bold">Customs items</h3><p className="text-sm text-[var(--muted)]">Canada domestic shipments do not need HS codes. Add items for cross-border or USPS shipping. Enter actual item weights and declared values in GTA’s agreed units.</p><input name="item_count" type="hidden" value={items.length} />
        {items.map((key,i) => <fieldset key={key} className="rounded-xl border border-[var(--line)] p-4"><legend className="px-2 text-sm font-semibold">Item {i+1}</legend><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">Description<input name={`description_${i}`} maxLength={300} className="bp-input mt-2" /></label>
          <label className="text-sm">Item weight (kg)<input name={`weight_${i}`} type="number" step="any" className="bp-input mt-2" /></label>
          <label className="text-sm">HS code (4–10 digits)<input name={`hs_${i}`} inputMode="numeric" maxLength={10} className="bp-input mt-2" /></label>
          <label className="text-sm">Declared item value<input name={`value_${i}`} type="number" step="any" className="bp-input mt-2" /></label>
          <label className="text-sm">Currency<input name={`currency_${i}`} placeholder="USD or CAD" maxLength={3} className="bp-input mt-2 uppercase" /></label>
          <label className="text-sm">Quantity<input name={`quantity_${i}`} type="number" step="1" defaultValue={1} className="bp-input mt-2" /></label>
        </div></fieldset>)}
        <button type="button" onClick={() => setItems(x => [...x,x.length])} disabled={items.length >= 100} className="bp-button-secondary !min-h-11 !text-sm">Add customs item</button>
        {items.length ? <button type="button" onClick={() => setItems(x => x.slice(0,-1))} className="bp-button-secondary ml-2 !min-h-11 !text-sm">Remove last item</button> : null}
      </div>
      {!test ? <label className="flex items-start gap-3 text-sm"><input name="confirm_live" type="checkbox" className="mt-1 size-4" /><span>I confirm production booking and the resulting GTA shipping charges.</span></label> : null}
      <div className="flex flex-wrap gap-3"><button type="submit" formAction={rateAction} className="bp-button-secondary !min-h-11 !text-sm">{checking ? "Checking rates…" : "Check rates / connection"}</button><button type="submit" disabled={!test && !liveEnabled} className="bp-button-primary !min-h-11 !text-sm">{pending ? "Generating label…" : test ? "Generate QA label" : liveEnabled ? "Generate production AWB" : "Production awaiting activation"}</button></div>
    </fieldset>
    <Result state={rates} />{rates.rates ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Service</th><th>Cost</th><th>Tax</th></tr></thead><tbody>{rates.rates.map((rate,i) => <tr key={i}><td className="py-2">{rate.service}</td><td>{rate.cost.toFixed(2)}</td><td>{rate.tax === null ? "—" : rate.tax.toFixed(2)}</td></tr>)}</tbody></table></div> : null}
    <Result state={state} />{state.bookingId ? <a href={`/api/courier-integrations/gta-airskip/labels/${state.bookingId}`} className="bp-button-secondary mt-3 !min-h-11 !text-sm">Download label</a> : null}
  </form>;
}
export function GtaTrackingForm({bookingId}:{bookingId:string}) {
  const [state,action,pending] = useActionState(checkGtaTracking,initial);
  useCarrierBusy(pending);
  return <form action={action} noValidate className="mt-3"><input type="hidden" name="booking_id" value={bookingId} /><button disabled={pending} className="bp-button-secondary !min-h-11 !text-sm">{pending ? "Checking…" : "Check tracking"}</button><Result state={state} />{state.history ? <div className="mt-3 text-sm"><p>{state.history.status} · {state.history.date} · Status code {state.history.standardStatus ?? "unavailable"}</p><ul className="mt-2 space-y-2">{state.history.events.map((event,i) => <li key={i}>{event.date} — {event.name}{event.location ? ` · ${event.location}` : ""}</li>)}</ul></div> : null}</form>;
}

export function GtaConnectionForm({configured}:{configured:boolean}) {
  const [state,action,pending] = useActionState(checkGtaCredentials,initial);
  useCarrierBusy(pending);
  return <form action={action} noValidate className="bp-panel p-5 sm:p-6"><h2 className="text-xl font-bold">API connection</h2><p className="mt-2 text-sm text-[var(--muted)]">Verify GTA account/API access with a read-only tracking check. No parcel details, booking or shipping charges.</p><button disabled={!configured || pending} className="bp-button-secondary mt-4 !min-h-11 !text-sm">{pending ? "Checking API keys…" : "Verify API keys"}</button><Result state={state} /></form>;
}

export function GtaRecoveryForm({bookingId,tracking}:{bookingId:string;tracking:string|null}) {
  const [state,action,pending] = useActionState(recoverGtaLabel,initial);
  useCarrierBusy(pending);
  return <form action={action} noValidate className="mt-3 space-y-3"><input type="hidden" name="booking_id" value={bookingId} /><label className="block text-sm font-semibold">Tracking number confirmed by GTA<input name="tracking" defaultValue={tracking || ""} maxLength={100} className="bp-input mt-2 font-mono" disabled={pending} /></label><p className="text-sm text-[var(--muted)]">Recover the existing label after GTA confirms the tracking number. This checks the FastDrop reference and creates no new shipment.</p><button disabled={pending} className="bp-button-secondary !min-h-11 !text-sm">{pending ? "Recovering label…" : "Recover existing label"}</button><Result state={state} />{state.bookingId ? <a href={`/api/courier-integrations/gta-airskip/labels/${state.bookingId}`} className="text-[var(--brand)] underline">Download PDF label</a> : null}</form>;
}
