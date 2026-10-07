"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { SelectableTable } from "@/components/selectable-table";
import { createThreePLManifestAction, changeThreePLManifestAction, type ManifestState } from "@/app/(portal)/dispatch/3pl/manifests/actions";
const initial: ManifestState = { status: "idle", message: "" };
export type ManifestCandidate = { tracking_number: string; consignee_name: string; consignee_city: string; carrier_id: string | null; partner_tracking_number: string | null };
function Feedback({ state }: { state: ManifestState }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.status === "error") ref.current?.focus(); }, [state]);
  return <p ref={ref} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} className={`min-h-6 text-sm ${state.status === "error" ? "text-red-700" : "text-[#13734b]"}`}>{state.message}</p>;
}
export function CreateThreePLManifestForm({ requestId, carriers, shipments, awbBrandName }: { awbBrandName: string; requestId: string; carriers: { id: string; name: string }[]; shipments: ManifestCandidate[] }) {
  const [state, action, pending] = useActionState(createThreePLManifestAction, initial);
  const [carrier, setCarrier] = useState("");
  const visible = carrier ? shipments.filter((s) => !s.carrier_id || s.carrier_id === carrier) : [];
  return <form action={action} onReset={(event) => event.preventDefault()} noValidate className="bp-panel">
    <div className="bp-panel-header"><h2 className="text-lg font-bold">Create 3PL Manifest</h2><p className="mt-1 text-sm text-[#66756e]">Select warehouse parcels or scan/paste their {awbBrandName} AWBs. Creating a draft keeps parcels at warehouse.</p></div>
    <fieldset disabled={pending} className="min-w-0 space-y-5 p-5">
      <input type="hidden" name="request_id" value={requestId} />
      <label className="block text-sm font-semibold" htmlFor="manifest-carrier">Delivery partner</label>
      <select id="manifest-carrier" name="carrier_id" className="bp-input" value={carrier} onChange={(e) => setCarrier(e.target.value)} aria-describedby="manifest-carrier-help">
        <option value="">Select partner</option>{carriers.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}
      </select>
      <p id="manifest-carrier-help" className="text-sm text-[#66756e]">Changing partner clears table selection. Existing bookings must match the selected partner.</p>
      <div key={carrier} className="overflow-hidden rounded-xl border border-[#dfe7e3]">
        <SelectableTable visibleCount={visible.length} selectionMode="dropdown">
          <table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f4f7f6]"><tr><th className="p-3">Select</th><th className="p-3">{awbBrandName} AWB</th><th className="p-3">Consignee / city</th><th className="p-3">Partner AWB</th></tr></thead><tbody>
            {visible.map((s) => <tr className="bp-table-row border-t border-[#dfe7e3]" key={s.tracking_number}><td className="p-3"><input data-table-row-select name="tracking_number" value={s.tracking_number} type="checkbox" aria-label={`Select ${s.tracking_number}`} className="size-4 accent-[#13734b]" /></td><td className="p-3 font-mono font-bold">{s.tracking_number}</td><td className="p-3">{s.consignee_name}<p className="text-[#66756e]">{s.consignee_city}</p></td><td className="p-3 font-mono">{s.partner_tracking_number || "Not booked"}</td></tr>)}
          </tbody></table>
          {!visible.length && <p className="p-5 text-sm text-[#66756e]">{carrier ? "No available warehouse parcels in this list. Scan/paste AWBs below, or receive parcels at warehouse first." : "Select a delivery partner to see available parcels."}</p>}
        </SelectableTable>
      </div>
      <p className="text-sm text-[#66756e]">Showing available parcels from the latest 100 warehouse shipments. Use the AWB field for other parcels; up to 500 per manifest.</p>
      <label className="block text-sm font-semibold" htmlFor="manifest-awbs">Scan / paste additional {awbBrandName} AWBs</label>
      <textarea id="manifest-awbs" name="awbs" rows={5} maxLength={50500} className="bp-input resize-none font-mono" placeholder="One AWB per line" aria-describedby="manifest-awbs-help" />
      <p id="manifest-awbs-help" className="text-sm text-[#66756e]">Use one AWB per line or separate with commas. Duplicate AWBs are included once.</p>
      <label className="block text-sm font-semibold" htmlFor="manifest-notes">Internal notes (optional)</label>
      <textarea id="manifest-notes" name="notes" rows={3} maxLength={1000} className="bp-input resize-none" />
      <Feedback state={state} />
      <button type="submit" disabled={pending || !carrier} className="bp-button-primary min-w-48 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Creating…" : "Create 3PL Manifest"}</button>
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
