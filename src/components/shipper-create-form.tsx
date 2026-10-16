"use client";
import {useActionState} from "react";
import {createShipperAction} from "@/app/(portal)/shippers/actions";
import {Feedback, PasswordInput, useShipperBusy} from "@/components/shipper-account-form";
export function ShipperCreateForm({currency}:{currency:string}) {
 const [state,action,pending]=useActionState(createShipperAction,{status:"idle" as const,message:""});
 useShipperBusy(pending);
 return (          <form
            action={action} noValidate data-account-form
            className="bp-panel grid gap-4 p-5 sm:p-6 lg:grid-cols-2"
          >
            <fieldset disabled={pending} className="contents">
            <label className="text-xs font-bold text-[#526159]">
              Company / shipper name
              <input
                name="company_name"
                required
                minLength={2}
                maxLength={150}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-bold text-[#526159]">
              Contact person
              <input
                name="contact_person"
                maxLength={150}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-bold text-[#526159]">
              Login email
              <input
                name="email"
                type="email"
                required
                maxLength={200}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-bold text-[#526159]">
              Phone
              <input
                name="phone"
                maxLength={50}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-bold text-[#526159]">
              City
              <input
                name="city"
                maxLength={100}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-bold text-[#526159]">
              Temporary password
              <PasswordInput name="password" />
            </label>

            <label className="text-xs font-bold text-[#526159] lg:col-span-2">
              Business / return address
              <textarea
                name="address"
                rows={3}
                style={{resize:"none"}}
                maxLength={500}
                className="resize-none mt-2 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 py-2.5 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-bold text-[#526159]">
              COD settlement cycle
              <select
                name="cod_cycle_days"
                defaultValue="7"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              >
                <option value="1">Daily</option>
                <option value="3">Every 3 days</option>
                <option value="7">Weekly</option>
                <option value="14">Every 14 days</option>
                <option value="30">Monthly</option>
              </select>
            </label>

            <label className="text-xs font-bold text-[#526159]">
              Delivery rate — {currency}
              <input
                name="delivery_rate"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="15.00"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-bold text-[#526159]">
              Return charge
              <select
                name="return_charge_enabled"
                defaultValue="false"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              >
                <option value="false">Free return</option>
                <option value="true">Charge return fee</option>
              </select>
            </label>

            <label className="text-xs font-bold text-[#526159]">
              Return rate — {currency}
              <input
                name="return_rate"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0.00"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-[#e4ebe7] bg-white p-4 text-xs font-bold text-[#526159]">
              <input
                type="checkbox"
                name="vat_applicable"
                value="true"
                className="size-4 rounded border-[#cfdad4]"
              />
              VAT applicable to courier rates
            </label>

            <label className="text-xs font-bold text-[#526159]">
              VAT rate %
              <input
                name="vat_rate"
                type="number"
                min="0"
                max="100"
                step="0.001"
                defaultValue="5"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-bold text-[#526159]">
              VAT rate type
              <select
                name="vat_inclusive"
                defaultValue="false"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              >
                <option value="false">VAT exclusive</option>
                <option value="true">VAT inclusive</option>
              </select>
            </label>

            <label className="text-xs font-bold text-[#526159]">
              TRN / Tax Registration Number
              <input
                name="tax_registration_number"
                maxLength={100}
                placeholder="e.g. 100123456700003"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-[#dfeae4] bg-[#f7fbf8] p-4 text-xs font-semibold text-[#526159] lg:col-span-2">
              <input type="checkbox" name="upload_rates_after" value="true" className="mt-0.5 size-4 rounded border-[#cfdad4]" />
              <span><span className="block font-black text-[#34453c]">Add optional 3PL rates after creating this shipper</span><span className="mt-1 block font-normal leading-5 text-[#74827b]">Next page lets you upload local-zone or international carrier rate cards in bulk. These remain separate from the shipper’s delivery charges.</span></span>
            </label>

            <div className="flex flex-col gap-3 rounded-xl border border-[#e4ebe7] bg-white p-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
              <p className="text-xs text-[#74827b]">
                Reattempt fee is always {currency} 0.00.
              </p>

              <button disabled={pending} className="bp-button-primary">
                {pending ? "Creating…" : "Create shipper"}
              </button>
            </div>
            </fieldset>
            <Feedback state={state} />
          </form>);
}
