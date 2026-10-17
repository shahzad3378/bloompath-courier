"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { SelectableTable } from "@/components/selectable-table";
import { compareManifestRatesAction, createThreePLManifestAction, changeThreePLManifestAction, type ManifestRateState, type ManifestState } from "@/app/(portal)/dispatch/3pl/manifests/actions";
const initial: ManifestState = { status: "idle", message: "" };
const initialRates: ManifestRateState = { status: "idle", message: "", awbsKey: "", shipments: [] };
export type ManifestCandidate = { tracking_number: string; consignee_name: string; consignee_city: string; carrier_id: string | null; partner_tracking_number: string | null };
function Feedback({ state }: { state: ManifestState }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.status === "error") ref.current?.focus(); }, [state]);
  return <p ref={ref} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} className={`min-h-6 text-sm ${state.status === "error" ? "text-red-700" : "text-[#13734b]"}`}>{state.message}</p>;
}
export function CreateThreePLManifestForm({ requestId, carriers, shipments, awbBrandName }: { awbBrandName: string; requestId: string; carriers: { id: string; name: string }[]; shipments: ManifestCandidate[] }) {
  const [state, action, pending] = useActionState(createThreePLManifestAction, initial);
  const [rateState, compareAction, comparing] = useActionState(compareManifestRatesAction, initialRates);
  const [carrier, setCarrier] = useState("");
  const [selectedAwbs, setSelectedAwbs] = useState<string[]>([]);
  const [rawAwbs, setRawAwbs] = useState("");
  const visible = carrier ? shipments.filter((s) => !s.carrier_id || s.carrier_id === carrier) : shipments;
  const currentAwbs = [...new Set([...selectedAwbs, ...rawAwbs.split(/[\s,;]+/)].map((awb) => awb.trim().toUpperCase()).filter(Boolean))];
  const currentAwbsKey = JSON.stringify(currentAwbs);
  const showRates = rateState.status === "success" && rateState.awbsKey === currentAwbsKey;
  return <form action={action} onReset={(event) => event.preventDefault()} noValidate className="bp-panel">
    <div className="bp-panel-header"><h2 className="text-lg font-bold">Compare rates and create 3PL Manifest</h2><p className="mt-1 text-sm text-[#66756e]">1. Select or paste warehouse AWBs. 2. Check mapped 3PL rates and estimated margin. 3. Choose the delivery partner. Rate checking is optional; creating a draft keeps parcels at warehouse.</p></div>
    <fieldset disabled={pending || comparing} className="min-w-0 space-y-5 p-5">
      <input type="hidden" name="request_id" value={requestId} />
      <div className="overflow-hidden rounded-xl border border-[#dfe7e3]">
        <SelectableTable visibleCount={visible.length} selectionMode="dropdown" onSelectionChange={setSelectedAwbs}>
          <table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f4f7f6]"><tr><th className="p-3">Select</th><th className="p-3">{awbBrandName} AWB</th><th className="p-3">Consignee / city</th><th className="p-3">Partner AWB</th></tr></thead><tbody>
            {visible.map((s) => <tr className="bp-table-row border-t border-[#dfe7e3]" key={s.tracking_number}><td className="p-3"><input data-table-row-select name="tracking_number" value={s.tracking_number} checked={selectedAwbs.includes(s.tracking_number)} onChange={(event) => setSelectedAwbs((current) => event.target.checked ? [...current, s.tracking_number] : current.filter((awb) => awb !== s.tracking_number))} type="checkbox" aria-label={`Select ${s.tracking_number}`} className="size-4 accent-[#13734b]" /></td><td className="p-3 font-mono font-bold">{s.tracking_number}</td><td className="p-3">{s.consignee_name}<p className="text-[#66756e]">{s.consignee_city}</p></td><td className="p-3 font-mono">{s.partner_tracking_number || "Not booked"}</td></tr>)}
          </tbody></table>
          {!visible.length && <p className="p-5 text-sm text-[#66756e]">No available warehouse parcels in this list. Scan/paste AWBs below, or receive parcels at warehouse first.</p>}
        </SelectableTable>
      </div>
      <p className="text-sm text-[#66756e]">Showing available parcels from the latest 100 warehouse shipments. Existing bookings must match the delivery partner selected below. Up to 500 AWBs per manifest.</p>
      <label className="block text-sm font-semibold" htmlFor="manifest-awbs">Scan / paste additional {awbBrandName} AWBs</label>
      <textarea id="manifest-awbs" name="awbs" value={rawAwbs} onChange={(event) => setRawAwbs(event.target.value)} rows={5} maxLength={50500} className="bp-input resize-none font-mono" placeholder="One AWB per line" aria-describedby="manifest-awbs-help" />
      <p id="manifest-awbs-help" className="text-sm text-[#66756e]">Use one AWB per line or separate with commas. Duplicate AWBs are included once.</p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe7e3] bg-[#f8faf9] p-4">
        <div><p className="font-bold text-[#26372f]">2. Rate validation</p><p className="mt-1 text-xs text-[#66756e]">Compare saved active rates for these customers before choosing a partner.</p></div>
        <button type="submit" formAction={compareAction} disabled={!currentAwbs.length || currentAwbs.length > 500 || pending || comparing} className="bp-button-secondary disabled:cursor-not-allowed disabled:opacity-50">{comparing ? "Comparing saved rates…" : `Compare rates for ${currentAwbs.length} AWB${currentAwbs.length === 1 ? "" : "s"}`}</button>
      </div>
      {rateState.status === "error" && rateState.awbsKey === currentAwbsKey && <p role="alert" className="rounded-lg bg-[#fff0f0] px-3 py-2 text-sm font-semibold text-red-700">{rateState.message}</p>}
      {showRates && <section aria-live="polite" className="space-y-3 rounded-xl border border-[#cfe5d8] bg-[#f4faf6] p-4">
        <p className="text-sm font-bold text-[#176a47]">{rateState.message}</p>
        {rateState.shipments.map((row) => <article key={row.trackingNumber} className="rounded-lg border border-[#dfe7e3] bg-white p-3">
          <div className="flex flex-wrap justify-between gap-2"><div><p className="font-mono text-sm font-black text-[#26372f]">{row.trackingNumber}</p><p className="text-xs text-[#66756e]">{row.customer}</p></div><p className="text-right text-xs text-[#66756e]">Customer rate<br/><strong className="font-mono text-sm text-[#26372f]">{row.billedAmount === null || !row.billedCurrency ? "Not set" : new Intl.NumberFormat("en-CA", { style: "currency", currency: row.billedCurrency }).format(row.billedAmount)}</strong></p></div>
          {row.quotes.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{row.quotes.map((quote) => <div key={quote.carrierId} className="rounded-lg border border-[#e4ebe7] p-3 text-xs"><p className="font-bold text-[#26372f]">{quote.carrierName}</p><p className="mt-1 text-[#66756e]">{quote.service} · carrier rate</p><p className="font-mono font-bold">{new Intl.NumberFormat("en-CA", { style: "currency", currency: quote.currency }).format(quote.amount)}</p><p className={`mt-2 font-bold ${quote.margin === null ? "text-[#66756e]" : quote.margin >= 0 ? "text-[#176a47]" : "text-[#a13f3f]"}`}>{quote.margin === null ? "P/L: currency or customer rate unavailable" : `Est. P/L: ${new Intl.NumberFormat("en-CA", { style: "currency", currency: quote.currency, signDisplay: "always" }).format(quote.margin)}`}</p></div>)}</div> : <p className="mt-2 text-xs text-[#66756e]">No applicable mapped carrier rate was found for this shipment.</p>}
          {row.note && <p className="mt-2 text-xs text-[#77847e]">{row.note}</p>}
        </article>)}
        <p className="text-[11px] leading-5 text-[#77847e]">Est. P/L is customer delivery charge minus the lowest applicable saved carrier rate for each partner. It excludes taxes and carrier accessorials. Different currencies are not converted.</p>
      </section>}
      <div className="rounded-xl border border-[#dfe7e3] p-4">
        <label className="block text-sm font-semibold" htmlFor="manifest-carrier">3. Select delivery partner</label>
        <select id="manifest-carrier" name="carrier_id" required className="bp-input mt-2" value={carrier} onChange={(e) => { const next = e.target.value; setCarrier(next); setSelectedAwbs((current) => current.filter((awb) => { const shipment = shipments.find((row) => row.tracking_number === awb); return !next || !shipment?.carrier_id || shipment.carrier_id === next; })); }}>
          <option value="">Select partner after reviewing rates</option>{carriers.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}
        </select>
        <p className="mt-2 text-xs text-[#66756e]">Carrier names and rates come from your active 3PL accounts and mapped rate cards.</p>
      </div>
      <label className="block text-sm font-semibold" htmlFor="manifest-notes">Internal notes (optional)</label>
      <textarea id="manifest-notes" name="notes" rows={3} maxLength={1000} className="bp-input resize-none" />
      <Feedback state={state} />
      <button type="submit" disabled={pending || !carrier || !currentAwbs.length || currentAwbs.length > 500} className="bp-button-primary min-w-48 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Creating…" : "Create 3PL Manifest"}</button>
    </fieldset>
  </form>;
}
export function ThreePLManifestChangeForm({ id, count, operation }: { id: string; count: number; operation: "confirm" | "cancel" }) {
  const [state, action, pending] = useActionState(changeThreePLManifestAction, initial);
  const [acknowledged, setAcknowledged] = useState(false);
  return <form action={action} noValidate className="bp-panel p-5">
    <fieldset disabled={pending} className="space-y-4">
      <input type="hidden" name="manifest_id" value={id} /><input type="hidden" name="operation" value={operation} />
      <h2 className="text-lg font-bold">{operation === "confirm" ? "Confirm Handover" : "Cancel draft"}</h2>
      <p className="text-sm text-[#66756e]">{operation === "confirm" ? `All ${count} listed shipments will move to delivery-partner custody. Customer tracking will show In transit.` : "Cancel only before physical handover. The parcels stay at warehouse and can be added to a new manifest."}</p>
      {operation === "confirm" && <><label htmlFor="manifest-receiver" className="block text-sm font-semibold">Receiver name</label><input id="manifest-receiver" name="receiver_name" maxLength={120} className="bp-input" autoComplete="off" /></>}
      <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" name="acknowledge" value="yes" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[#13734b]" />{operation === "confirm" ? `I have physically handed over all ${count} listed shipments to this delivery partner.` : `I want to cancel this draft containing ${count} shipments.`}</label>
      <Feedback state={state} />
      <button type="submit" disabled={pending || !acknowledged} className={`${operation === "confirm" ? "bp-button-primary" : "bp-button-secondary"} min-w-48 disabled:cursor-not-allowed disabled:opacity-50`}>{pending ? "Saving…" : operation === "confirm" ? "Confirm Handover" : "Cancel draft"}</button>
    </fieldset>
  </form>;
}
export function ManifestPrintButton({ backHref }: { backHref: string }) {
  return <div className="print-controls mb-5 flex gap-3"><Link className="bp-button-secondary" href={backHref}>Back to manifest</Link><button type="button" onClick={() => window.print()} className="bp-button-primary">Print manifest</button></div>;
}
