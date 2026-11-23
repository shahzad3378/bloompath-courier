"use client";
import { useActionState } from "react";
import { repriceZoneChargesAction, type ZoneRepriceState } from "@/app/(portal)/shippers/[id]/zone-rates/import-actions";
import { formatMoney } from "@/lib/currency";
export function ZoneRateRepriceForm({ shipperId }: { shipperId: string }) {
  const [state, action, pending] = useActionState(repriceZoneChargesAction, { status: "idle", message: "" } as ZoneRepriceState);
  const preview = state.status === "preview" && Number(state.changed) > 0;
  return <section className="bp-panel mt-6 p-5"><h2 className="font-black">Recalculate unbilled shipment charges</h2><p className="mt-2 text-sm leading-6 text-[#74827b]">After uploading agreed rates, preview corrections to this shipper&apos;s uninvoiced delivery/return charges. Review the amounts before applying. Invoices and settlements are protected.</p>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className="mt-4 rounded-xl bg-[#f4f7f5] p-4 text-sm">{state.message}</p> : null}
    {state.totals?.map(row => <p key={row.currency} className="mt-3 text-sm font-bold">{row.currency}: charges {formatMoney(row.before, row.currency)} → {formatMoney(row.after, row.currency)}</p>)}
    <form action={action} className="mt-4"><input type="hidden" name="shipper_id" value={shipperId} /><input type="hidden" name="preview_token" value={state.previewToken || ""} /><input type="hidden" name="phase" value={preview ? "apply" : "preview"} /><button disabled={pending} className={preview ? "bp-button-primary" : "bp-button-secondary"}>{pending ? "Processing…" : preview ? `Apply current zone rates to ${state.changed} unbilled AWBs` : "Preview charge corrections"}</button></form>
  </section>;
}
