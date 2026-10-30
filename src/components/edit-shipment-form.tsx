"use client";

import { useActionState } from "react";
import { editShipmentAction } from "@/app/(portal)/shipments/edit-action";
import { ShipmentStateField } from "@/components/shipment-state-field";
import type { Shipment } from "@/lib/shipments";

export function EditShipmentForm({ shipment }: { shipment: Shipment }) {
  const [state, action, pending] = useActionState(editShipmentAction, { message: "" });
  function field(key: keyof Shipment, label: string, maxLength: number, required = false) {
    return <label key={key} className="text-xs font-bold text-[#516159]">{label}{required ? " *" : ""}
      <input name={key} defaultValue={String(shipment[key] ?? "")} maxLength={maxLength}
        required={required} className="bp-input mt-1.5 w-full" />
    </label>;
  }
  return <details className="mt-5 rounded-2xl border border-[#e0e8e4] bg-white p-5">
    <summary className="cursor-pointer font-bold text-[#26372f]">Edit shipment</summary>
    <form action={action} noValidate className="mt-4 space-y-5" aria-busy={pending}>
      <input type="hidden" name="shipment_id" value={shipment.id} />
      <input type="hidden" name="updated_at" value={shipment.updated_at} />
      <p className="text-sm text-[#74827b]">Save corrections to this shipment. Existing carrier labels retain their original details.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["sender", "consignee"] as const).map(side => <fieldset key={side} className="grid min-w-0 gap-3">
          <legend className="mb-3 font-bold text-[#26372f]">{side === "sender" ? "Sender" : "Customer"} · {shipment[`${side}_country_code`]}</legend>
          {field(`${side}_name`, "Name", 120, true)}
          {field(`${side}_phone`, "Phone", 20, true)}
          {field(`${side}_address`, "Address", 500, true)}
          {field(`${side}_address_2`, "Address line 2", 500)}
          {field(`${side}_city`, "City", 80, true)}
          <ShipmentStateField side={side} countryCode={shipment[`${side}_country_code`] || ""} defaultValue={shipment[`${side}_state_province`]} />
          {field(`${side}_postal_code`, "Postal / ZIP code", 30)}
        </fieldset>)}
        {field("reference_number", "Reference number", 80)}
        {field("consignee_alt_phone", "Customer alternate phone", 20)}
        {field("consignee_area", "Customer area", 120)}
        {field("consignee_landmark", "Customer landmark", 200)}
        {field("parcel_description", "Parcel description", 500, true)}
        {field("delivery_instructions", "Delivery instructions", 500)}
      </div>
      {state.message ? <p role="alert" className="text-sm font-semibold text-red-700">{state.message}</p> : null}
      <button disabled={pending} className="h-11 min-w-36 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{pending ? "Saving…" : "Save changes"}</button>
    </form>
  </details>;
}
