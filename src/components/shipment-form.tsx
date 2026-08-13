"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { createShipmentAction, type CreateShipmentState } from "@/app/(portal)/shipments/actions";
import { uaeCities } from "@/lib/shipments";

const initialState: CreateShipmentState = { message: "" };
const inputClass = "mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3.5 text-sm text-[#25352d] outline-none transition placeholder:text-[#a2ada7] focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10";
const textAreaClass = "mt-1.5 min-h-24 w-full resize-y rounded-xl border border-[#dbe5e0] bg-white px-3.5 py-3 text-sm text-[#25352d] outline-none transition placeholder:text-[#a2ada7] focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10";
const labelClass = "text-xs font-bold text-[#516159]";

function CitySelect({ name, defaultValue = "Dubai" }: { name: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={inputClass} required>
      {uaeCities.map((city) => <option key={city} value={city}>{city}</option>)}
    </select>
  );
}

export function ShipmentForm() {
  const [state, formAction, pending] = useActionState(createShipmentAction, initialState);

  return (
    <form action={formAction} className="mx-auto max-w-[1200px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/shipments" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to shipments</Link>
          <p className="text-sm font-semibold text-[#188459]">Order booking</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Create shipment & AWB</h1>
          <p className="mt-2 text-sm text-[#74827b]">Enter UAE delivery details. A tracking number will be generated automatically.</p>
        </div>
        <button disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white shadow-lg shadow-[#13734b]/15 transition hover:bg-[#0d5e3d] disabled:cursor-wait disabled:opacity-60">
          <PackagePlus className="size-4" /> {pending ? "Booking…" : "Book shipment"}
        </button>
      </div>

      {state.message ? <p role="alert" className="mt-5 rounded-xl border border-[#f1cece] bg-[#fff3f3] px-4 py-3 text-sm font-semibold text-[#a63e3e]">{state.message}</p> : null}

      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:p-6">
          <div className="border-b border-[#edf1ef] pb-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">01 · Pickup</p><h2 className="mt-1 font-bold text-[#26372f]">Sender details</h2></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Sender name *<input name="sender_name" maxLength={120} className={inputClass} placeholder="BloomPath Store" required /></label>
            <label className={labelClass}>Phone number *<input name="sender_phone" type="tel" minLength={7} maxLength={20} className={inputClass} placeholder="+971 50 000 0000" required /></label>
            <label className={labelClass}>City *<CitySelect name="sender_city" /></label>
            <label className={labelClass}>Reference number<input name="reference_number" maxLength={80} className={inputClass} placeholder="Seller order ID" /></label>
            <label className={`${labelClass} sm:col-span-2`}>Pickup address *<textarea name="sender_address" minLength={5} maxLength={500} className={textAreaClass} placeholder="Building, street, area" required /></label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:p-6">
          <div className="border-b border-[#edf1ef] pb-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">02 · Delivery</p><h2 className="mt-1 font-bold text-[#26372f]">Consignee details</h2></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Consignee name *<input name="consignee_name" maxLength={120} className={inputClass} placeholder="Customer full name" required /></label>
            <label className={labelClass}>Primary phone *<input name="consignee_phone" type="tel" minLength={7} maxLength={20} className={inputClass} placeholder="+971 50 000 0000" required /></label>
            <label className={labelClass}>Alternative phone<input name="consignee_alt_phone" type="tel" maxLength={20} className={inputClass} placeholder="Optional" /></label>
            <label className={labelClass}>City *<CitySelect name="consignee_city" /></label>
            <label className={labelClass}>Area<input name="consignee_area" maxLength={120} className={inputClass} placeholder="Dubai Marina" /></label>
            <label className={labelClass}>Landmark<input name="consignee_landmark" maxLength={200} className={inputClass} placeholder="Near metro / mall" /></label>
            <label className={`${labelClass} sm:col-span-2`}>Delivery address *<textarea name="consignee_address" minLength={5} maxLength={500} className={textAreaClass} placeholder="Building, apartment, street, area" required /></label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:p-6 xl:col-span-2">
          <div className="border-b border-[#edf1ef] pb-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">03 · Parcel</p><h2 className="mt-1 font-bold text-[#26372f]">Service, package & payment</h2></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className={labelClass}>Service *<select name="service_type" defaultValue="next_day" className={inputClass}><option value="same_day">Same day</option><option value="next_day">Next day</option><option value="standard">Standard</option></select></label>
            <label className={labelClass}>Payment *<select name="payment_type" defaultValue="cod" className={inputClass}><option value="cod">Cash on delivery</option><option value="prepaid">Prepaid</option></select></label>
            <label className={labelClass}>Pieces *<input name="pieces" type="number" min="1" max="999" defaultValue="1" className={inputClass} required /></label>
            <label className={labelClass}>Weight (kg) *<input name="weight_kg" type="number" min="0.001" max="1000" step="0.001" defaultValue="1" className={inputClass} required /></label>
            <label className={labelClass}>COD amount (AED) *<input name="cod_amount" type="number" min="0" max="9999999999" step="0.01" defaultValue="0" className={inputClass} required /></label>
            <label className={`${labelClass} sm:col-span-2 xl:col-span-3`}>Parcel description *<input name="parcel_description" minLength={2} maxLength={500} className={inputClass} placeholder="Product name / contents" required /></label>
            <label className={`${labelClass} sm:col-span-2 xl:col-span-4`}>Delivery instructions<textarea name="delivery_instructions" maxLength={500} className={textAreaClass} placeholder="Call before delivery, preferred time, access notes…" /></label>
          </div>
        </section>
      </div>

      <div className="mt-5 flex justify-end"><button disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-6 text-sm font-bold text-white disabled:opacity-60"><PackagePlus className="size-4" /> {pending ? "Booking…" : "Generate AWB"}</button></div>
    </form>
  );
}
