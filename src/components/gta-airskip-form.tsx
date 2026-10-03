"use client";
import {useActionState,useState,useEffect,useRef} from "react";
import {generateGtaAwb,checkGtaRates,checkGtaTracking,type GtaState} from "@/app/(portal)/courier-integrations/gta-airskip/actions";
const initial: GtaState = {status:"idle",message:""};
function Result({state}:{state:GtaState}) { const ref = useRef<HTMLParagraphElement>(null); useEffect(() => { if(state.status === "error") ref.current?.focus(); },[state]); return <div aria-live="polite" aria-atomic="true">{state.message ? <p ref={ref} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} className="mt-4 rounded-xl border border-[var(--line)] p-4 text-sm">{state.message}{state.tracking ? <strong className="mt-2 block font-mono">Partner AWB: {state.tracking}</strong> : null}</p> : null}</div>; }
export function GtaBookingForm({configured,test,liveEnabled,initialAwb}:{configured:boolean;test:boolean;liveEnabled:boolean;initialAwb:string}) {
  const [state,action,pending] = useActionState(generateGtaAwb,initial);
  const [rates,rateAction,checking] = useActionState(checkGtaRates,initial);
  const [items,setItems] = useState<number[]>([]);
  return <form action={action} noValidate className="bp-panel p-5 sm:p-6">
    <h2 className="text-xl font-bold">GTA AirSkip booking</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">{test ? "QA environment: labels do not assign a live delivery partner." : "Production environment: booking can incur shipping charges."} One saved FastDrop shipment represents one parcel.</p>
    <fieldset disabled={!configured || pending || checking} className="mt-5 space-y-5 disabled:opacity-70">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">FastDrop AWB<input name="awb" defaultValue={initialAwb} className="bp-input mt-2 font-mono" /></label>
        <label className="text-sm font-semibold">Induction terminal<input name="terminal" placeholder="Provider-confirmed terminal" maxLength={30} className="bp-input mt-2" /></label>
        <label className="text-sm font-semibold">Service (optional)<input name="service" maxLength={100} className="bp-input mt-2" /><span className="mt-1 block font-normal text-[var(--muted)]">Leave blank for GTA to select the appropriate service.</span></label>
        <label className="text-sm font-semibold">Destination terminal (middle-mile services)<input name="destination_terminal" maxLength={30} className="bp-input mt-2" /></label>
        <label className="text-sm font-semibold">Package type<input name="pieces_type" placeholder="Provider-approved type, e.g. Box" maxLength={50} className="bp-input mt-2" /></label>
      </div>
      <label className="flex items-start gap-3 text-sm"><input name="confirm_induction" type="checkbox" className="mt-1 size-4" /><span>I confirm the saved sender address is the actual GTA induction location. Review the shipment address before continuing.</span></label>
      <div><h3 className="text-sm font-semibold">Required parcel dimensions (cm)</h3><div className="mt-2 grid gap-3 sm:grid-cols-3">{["length","width","height"].map(name => <label key={name} className="text-sm capitalize">{name}<input name={name} type="number" step="any" min="0" className="bp-input mt-2" /></label>)}</div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm"><input name="signature" type="checkbox" className="size-4" />Signature required</label><label className="flex items-center gap-2 text-sm"><input name="insurance" type="checkbox" className="size-4" />Insurance required</label><label className="text-sm">Insurance declared value (if insured)<input name="insurance_value" type="number" step="any" min="0" className="bp-input mt-2" /></label></div>
      <div className="space-y-4"><h3 className="font-bold">Customs items</h3><p className="text-sm text-[var(--muted)]">Canada domestic shipments do not need HS codes. Add items for cross-border or USPS shipping. Enter actual item weights and declared values in GTA’s agreed units.</p><input name="item_count" type="hidden" value={items.length} />
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
  return <form action={action} noValidate className="mt-3"><input type="hidden" name="booking_id" value={bookingId} /><button disabled={pending} className="bp-button-secondary !min-h-11 !text-sm">{pending ? "Checking…" : "Check tracking"}</button><Result state={state} />{state.history ? <div className="mt-3 text-sm"><p>{state.history.status} · {state.history.date} · Status code {state.history.standardStatus ?? "unavailable"}</p><ul className="mt-2 space-y-2">{state.history.events.map((event,i) => <li key={i}>{event.date} — {event.name}{event.location ? ` · ${event.location}` : ""}</li>)}</ul></div> : null}</form>;
}
