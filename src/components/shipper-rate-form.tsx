import Link from "next/link";
import {ShipperSubmitButton} from "@/components/shipper-account-form";
import {saveShipperRateAction} from "@/app/(portal)/shippers/actions";
export function ShipperRateForm({shipper,rate,currency}:{shipper:{id:string};rate:{delivery_rate:number;return_charge_enabled:boolean;return_rate:number;vat_applicable:boolean;vat_rate:number|string;vat_inclusive:boolean;tax_registration_number:string|null}|null;currency:string}) {
 return (                      <form
                        action={saveShipperRateAction} noValidate
                        className="rounded-2xl border border-[#dfe8e3] bg-[#fbfcfb] p-5"
                      >
                        <h4 className="font-bold text-[#26372f]">
                          Commercial rate card
                        </h4>

                        <input
                          type="hidden"
                          name="shipper_id"
                          value={shipper.id}
                        />

                        <label className="mt-4 block text-xs font-bold text-[#526159]">
                          Delivery rate — {currency}
                          <input
                            name="delivery_rate"
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            autoComplete="off"
                            inputMode="decimal"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            defaultValue={Number(
                              rate?.delivery_rate ?? 0,
                            ).toFixed(2)}
                            className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
                          />
                        </label>

                        <label className="mt-4 block text-xs font-bold text-[#526159]">
                          Return charge
                          <select
                            name="return_charge_enabled"
                            defaultValue={String(
                              rate?.return_charge_enabled ?? false,
                            )}
                            className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
                          >
                            <option value="false">Free return</option>
                            <option value="true">Charge return fee</option>
                          </select>
                        </label>

                        <label className="mt-4 block text-xs font-bold text-[#526159]">
                          Return rate — {currency}
                          <input
                            name="return_rate"
                            type="number"
                            step="0.01"
                            min="0"
                            autoComplete="off"
                            inputMode="decimal"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            defaultValue={Number(
                              rate?.return_rate ?? 0,
                            ).toFixed(2)}
                            className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
                          />
                        </label>

                        <p className="mt-3 text-xs text-[#87938d]">
                          Reattempt fee: {currency} 0.00
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                        <div className="mt-5 rounded-xl border border-[#e2e9e5] bg-[#fafcfb] p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-[#53645c]">
                            Tax & VAT
                          </p>

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <label className="flex items-center gap-3 text-xs font-bold text-[#53645c]">
                              <input
                                type="checkbox"
                                name="vat_applicable"
                                value="true"
                                defaultChecked={Boolean(rate?.vat_applicable)}
                                className="size-4 rounded border-[#cfdad4]"
                              />
                              VAT Applicable
                            </label>

                            <label className="text-xs font-bold text-[#53645c]">
                              VAT Rate %
                              <input
                                name="vat_rate"
                                type="number"
                                min="0"
                                max="100"
                                step="0.001"
                                defaultValue={Number(rate?.vat_rate ?? 0)}
                                className="mt-2 h-10 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                              />
                            </label>

                            <label className="text-xs font-bold text-[#53645c]">
                              Rate Type
                              <select
                                name="vat_inclusive"
                                defaultValue={String(rate?.vat_inclusive ?? false)}
                                className="mt-2 h-10 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-semibold"
                              >
                                <option value="false">VAT Exclusive</option>
                                <option value="true">VAT Inclusive</option>
                              </select>
                            </label>

                            <label className="text-xs font-bold text-[#53645c]">
                              TRN / Tax Registration Number
                              <input
                                name="tax_registration_number"
                                maxLength={100}
                                defaultValue={rate?.tax_registration_number ?? ""}
                                placeholder="e.g. 100123456700003"
                                className="mt-2 h-10 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                              />
                            </label>
                          </div>

                          <p className="mt-3 text-[11px] leading-5 text-[#87938d]">
                            VAT off = no VAT charged. VAT Inclusive = configured courier rates already include VAT. VAT Exclusive = VAT is added separately on the invoice.
                          </p>
                        </div>

                          <ShipperSubmitButton label="Save new rate"/>

                          <Link
                            href={`/shippers/${shipper.id}/zone-rates`}
                            className="inline-flex h-10 items-center rounded-xl border border-[#d7e3dd] bg-white px-4 text-sm font-bold text-[#315244]"
                          >
                            Manage Zone Rates
                          </Link>
                        </div>
                      </form>);
}
