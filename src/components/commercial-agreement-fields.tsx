"use client";

import { useActionState, useState } from "react";
import { saveCommercialAgreementAction } from "@/app/(portal)/shippers/actions";
import { areaTiers, type CommercialAgreement } from "@/lib/bloompath-commercial";

export function CommercialAgreementFields({ currency, agreement }: { currency: string; agreement?: (CommercialAgreement & { enabled?: boolean }) | null }) {
  const [enabled, setEnabled] = useState(agreement?.enabled ?? Boolean(agreement));
  const [carrierRows, setCarrierRows] = useState<{ id: number; cost: CommercialAgreement["carrier_costs"][number] | null }[]>(() => (agreement?.carrier_costs ?? []).map((cost, id) => ({ id, cost })));
  const [nextId, setNextId] = useState(carrierRows.length);

  return <section className="space-y-4 rounded-xl border border-[#dbe5e0] p-4 lg:col-span-2">
    <label className="flex items-center gap-2 font-bold">
      <input type="checkbox" name="commercial_agreement" value="true" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
      Set fulfillment and delivery agreement
    </label>
    {enabled ? <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Fulfillment fee per order ({currency})
          <input className="bp-input mt-1 w-full" name="fulfillment_fee" type="number" min="0" max="999999.99" step="0.01" defaultValue={agreement?.fulfillment_fee} required />
        </label>
        <label className="text-sm">Agreed charge checkpoint
          <select className="bp-input mt-1 w-full" name="fulfillment_checkpoint" defaultValue={agreement?.fulfillment_checkpoint ?? "delivered"}>
            <option value="dispatched">Packed and dispatched</option>
            <option value="delivered">Delivered</option>
          </select>
        </label>
      </div>
      <h3 className="text-sm font-bold">Customer delivery charges ({currency})</h3>
      <div className="grid gap-3 sm:grid-cols-3">{areaTiers.map((tier) => (
        <label key={tier} className="text-sm capitalize">{tier} area
          <input className="bp-input mt-1 w-full" name={`customer_${tier}`} type="number" min="0" max="999999.99" step="0.01" defaultValue={agreement?.customer_rates[tier]} required />
        </label>
      ))}</div>
      <h3 className="text-sm font-bold">3PL delivery costs ({currency})</h3>
      {carrierRows.map(({ id, cost }, index) => (
        <div key={id} className="grid gap-3 rounded-xl border border-[#dbe5e0] p-3 sm:grid-cols-3">
          <label className="text-sm sm:col-span-3">3PL name
            <input name="carrier_name" defaultValue={cost?.name} className="bp-input mt-1 w-full" maxLength={120} required />
          </label>
          {areaTiers.map((tier) => (
            <label key={tier} className="text-sm capitalize">{tier} cost
              <input name={`carrier_${tier}`} defaultValue={cost?.[tier]} className="bp-input mt-1 w-full" type="number" min="0" max="999999.99" step="0.01" required />
            </label>
          ))}
          <button type="button" className="text-left text-sm font-semibold" onClick={() => setCarrierRows(rows => rows.filter(row => row.id !== id))}>Remove 3PL {index + 1}</button>
        </div>
      ))}
      <button type="button" className="bp-button-secondary" disabled={carrierRows.length >= 20} onClick={() => {
        setCarrierRows(rows => [...rows, { id: nextId, cost: null }]);
        setNextId(nextId + 1);
      }}>Add 3PL</button>
    </> : null}
  </section>;
}

export function CommercialAgreementForm({ shipperId, currency, agreement }: { shipperId: string; currency: string; agreement: (CommercialAgreement & { enabled?: boolean }) | null }) {
  const [state, action, pending] = useActionState(saveCommercialAgreementAction, { status: "idle" as const, message: "" });
  return <form className="bp-panel space-y-4 p-5" action={action}>
    <input type="hidden" name="shipper_id" value={shipperId} />
    <fieldset disabled={pending}><CommercialAgreementFields currency={currency} agreement={agreement} /></fieldset>
    <button className="bp-button-primary" disabled={pending}>{pending ? "Saving…" : "Save agreement"}</button>
    <p role={state.status === "error" ? "alert" : "status"} className="text-sm">{state.message}</p>
  </form>;
}
