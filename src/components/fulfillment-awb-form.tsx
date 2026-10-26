"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { createFulfillmentAwbAction, type FulfillmentAwbState } from "@/app/(portal)/fulfillment/actions";

export type FulfillmentAwbCountry = {
  code: string;
  name: string;
  location_strategy: string;
  postal_code_label: string | null;
  is_primary: boolean;
};

const initialState: FulfillmentAwbState = { status: "idle", message: "" };
const fieldClass = "bp-input h-10 w-full";

function inferCountry(address: string, countries: FulfillmentAwbCountry[]) {
  const lower = address.toLowerCase();
  return countries.find(country => lower.includes(country.name.toLowerCase()))?.code
    || countries.find(country => country.is_primary)?.code
    || countries[0]?.code
    || "AE";
}

function inferCity(address: string, country: FulfillmentAwbCountry | undefined) {
  let remaining = address.toLowerCase();
  if (country) remaining = remaining.split(country.name.toLowerCase()).join(" ");
  const parts = remaining.replaceAll(",", "-").replaceAll("–", "-").replaceAll("—", "-")
    .split("-").map(part => part.trim()).filter(Boolean);
  const candidate = parts.at(-1) ?? "";
  const compact = candidate.replaceAll(" ", "");
  if (compact === "rasalkhaima" || compact === "rasalkhaimah") return "Ras Al Khaimah";
  return candidate.slice(0, 80);
}

export function FulfillmentAwbForm({
  orderNumber,
  address,
  countries,
}: {
  orderNumber: string;
  address: string;
  countries: FulfillmentAwbCountry[];
}) {
  const [state, action, pending] = useActionState(createFulfillmentAwbAction, initialState);
  const initialCountry = inferCountry(address, countries);
  const [countryCode, setCountryCode] = useState(initialCountry);
  const [city, setCity] = useState(() => inferCity(address, countries.find(country => country.code === initialCountry)));
  const [paymentType, setPaymentType] = useState<"cod" | "prepaid">("cod");
  const country = useMemo(() => countries.find(item => item.code === countryCode), [countries, countryCode]);
  const postalRequired = ["postal_code", "zip_code", "postcode"].includes(country?.location_strategy ?? "");
  const resultClass = state.status === "error" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800";

  return <details className="min-w-[230px]">
    <summary className="cursor-pointer rounded-lg bg-[#174ea6] px-3 py-2 text-center text-xs font-bold text-white">Create AWB</summary>
    <form action={action} className="mt-3 min-w-[280px] space-y-2 rounded-xl border border-[#dce5ee] bg-white p-3 shadow-sm">
      <input type="hidden" name="order_number" value={orderNumber}/>
      <label className="block text-[11px] font-semibold text-[#526159]">Destination country
        <select name="consignee_country_code" value={countryCode} onChange={event => { setCountryCode(event.target.value); setCity(""); }} className={fieldClass} required>
          {countries.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </label>
      <label className="block text-[11px] font-semibold text-[#526159]">Destination city
        <input name="consignee_city" value={city} onChange={event => setCity(event.target.value)} maxLength={80} className={fieldClass} required/>
      </label>
      {postalRequired ? <label className="block text-[11px] font-semibold text-[#526159]">{country?.postal_code_label || "Postal code"}
        <input name="consignee_postal_code" maxLength={30} className={fieldClass} required/>
      </label> : <input type="hidden" name="consignee_postal_code" value=""/>}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-semibold text-[#526159]">Weight (kg)
          <input name="weight_kg" type="number" min="0.001" max="1000" step="0.001" defaultValue="1" className={fieldClass} required/>
        </label>
        <label className="block text-[11px] font-semibold text-[#526159]">Pieces
          <input name="pieces" type="number" min="1" max="999" step="1" defaultValue="1" className={fieldClass} required/>
        </label>
      </div>
      <label className="block text-[11px] font-semibold text-[#526159]">Payment
        <select name="payment_type" value={paymentType} onChange={event => setPaymentType(event.target.value as "cod" | "prepaid")} className={fieldClass} required>
          <option value="cod">Cash on delivery</option><option value="prepaid">Prepaid</option>
        </select>
      </label>
      <label className="block text-[11px] font-semibold text-[#526159]">COD amount
        <input name="cod_amount" type="number" min="0" max="9999999999" step="0.01" defaultValue="0" disabled={paymentType === "prepaid"} className={fieldClass} required={paymentType === "cod"}/>
      </label>
      <p className="text-[10px] leading-4 text-[#78858f]">Confirm actual parcel weight and COD amount. Defaults are 1 kg, 1 piece and COD 0. Sender details come from Organization Settings.</p>
      {state.message ? <div aria-live="polite" role={state.status === "error" ? "alert" : "status"} className={"rounded-lg px-3 py-2 text-[11px] font-semibold " + resultClass}>
        {state.message}{state.status === "success" && state.shipmentId && state.trackingNumber ? <Link className="ml-1 underline" href={"/shipments/" + state.shipmentId}>{state.trackingNumber}</Link> : null}
      </div> : null}
      <button disabled={pending} className="w-full rounded-lg bg-[#174ea6] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{pending ? "Creating AWB…" : "Create AWB"}</button>
    </form>
  </details>;
}
