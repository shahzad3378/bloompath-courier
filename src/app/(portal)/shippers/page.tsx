import { BadgeDollarSign, RotateCcw, Store, Truck } from "lucide-react";
import { saveShipperRateAction } from "@/app/(portal)/shippers/actions";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Shippers" };

const accessRoles = [
  "super_admin",
  "operations_admin",
  "finance_staff",
  "customer_service",
] as const;

type ShipperRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  status: string;
};

type RateRow = {
  id: number;
  shipper_id: string;
  delivery_rate: number;
  return_charge_enabled: boolean;
  return_rate: number;
  currency: string;
  effective_from: string;
};

export default async function ShippersPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    shipper?: string;
  }>;
}) {
  const profile = await requireProfile(accessRoles);
  const params = await searchParams;
  const supabase = await createClient();

  const canEditRates = [
    "super_admin",
    "operations_admin",
    "finance_staff",
  ].includes(profile.role);

  const [{ data: shipperData, error: shipperError }, { data: rateData }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, status")
        .eq("organization_id", profile.organization_id)
        .eq("role", "shipper")
        .order("full_name", { ascending: true }),

      supabase
        .from("shipper_rates")
        .select(
          "id, shipper_id, delivery_rate, return_charge_enabled, return_rate, currency, effective_from",
        )
        .eq("organization_id", profile.organization_id)
        .is("effective_to", null)
        .order("effective_from", { ascending: false }),
    ]);

  const shippers = (shipperData ?? []) as ShipperRow[];
  const rates = (rateData ?? []) as RateRow[];

  const rateByShipper = new Map<string, RateRow>();

  for (const rate of rates) {
    if (!rateByShipper.has(rate.shipper_id)) {
      rateByShipper.set(rate.shipper_id, rate);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]">
          <Store className="size-6" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#188459]">
            Customer accounts
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            Shippers & rate cards
          </h1>
          <p className="mt-2 text-sm text-[#74827b]">
            Configure seller-specific delivery and optional return charges used automatically in COD settlements.
          </p>
        </div>
      </div>

      {params.saved === "1" ? (
        <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          Shipper rate card updated successfully.
        </div>
      ) : null}

      {params.error ? (
        <div className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          Rate card could not be saved. Please verify the values and retry.
        </div>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        <div className="border-b border-[#e8eeeb] px-5 py-4">
          <h2 className="font-bold text-[#26372f]">
            Seller rate cards
          </h2>
          <p className="mt-1 text-xs text-[#87938d]">
            Reattempts are free. Return charge can be enabled or disabled per seller.
          </p>
        </div>

        {shipperError ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            Shippers could not be loaded.
          </p>
        ) : shippers.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <Store className="mx-auto size-10 text-[#9aaba2]" />
              <h2 className="mt-4 font-bold text-[#405048]">
                No shipper accounts
              </h2>
              <p className="mt-1 text-sm text-[#87938d]">
                Create a user with the Shipper role first.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#edf1ef]">
            {shippers.map((shipper) => {
              const rate = rateByShipper.get(shipper.id);

              return (
                <div
                  key={shipper.id}
                  className="grid gap-5 p-5 xl:grid-cols-[1.1fr_1fr]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-bold text-[#26372f]">
                        {shipper.full_name || "Unnamed shipper"}
                      </h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          shipper.status === "active"
                            ? "bg-[#e5f3eb] text-[#16724b]"
                            : "bg-[#f0f1f0] text-[#68766f]"
                        }`}
                      >
                        {shipper.status}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-[#68766f]">
                      {shipper.email}
                    </p>
                    <p className="mt-1 text-sm text-[#87938d]">
                      {shipper.phone || "No phone recorded"}
                    </p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[#dfe8e3] bg-[#f8faf9] p-4">
                        <div className="flex items-center gap-2">
                          <Truck className="size-4 text-[#13734b]" />
                          <p className="text-xs font-bold uppercase tracking-wide text-[#7b8982]">
                            Delivery
                          </p>
                        </div>
                        <p className="mt-2 text-2xl font-black text-[#26372f]">
                          AED {Number(rate?.delivery_rate ?? 0).toFixed(2)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-[#eadac9] bg-[#fffaf5] p-4">
                        <div className="flex items-center gap-2">
                          <RotateCcw className="size-4 text-[#b76223]" />
                          <p className="text-xs font-bold uppercase tracking-wide text-[#7b8982]">
                            Return
                          </p>
                        </div>
                        <p className="mt-2 text-2xl font-black text-[#26372f]">
                          {rate?.return_charge_enabled
                            ? `AED ${Number(rate.return_rate).toFixed(2)}`
                            : "Free"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-xs text-[#87938d]">
                      <BadgeDollarSign className="size-4" />
                      {rate
                        ? `Current rate effective ${formatDubaiDate(rate.effective_from)}`
                        : "No rate card configured yet"}
                    </div>
                  </div>

                  <div>
                    {canEditRates ? (
                      <form
                        action={saveShipperRateAction}
                        className="rounded-2xl border border-[#dfe8e3] bg-[#fbfcfb] p-5"
                      >
                        <input
                          type="hidden"
                          name="shipper_id"
                          value={shipper.id}
                        />

                        <h4 className="font-bold text-[#26372f]">
                          Update rate card
                        </h4>

                        <label className="mt-4 block text-xs font-bold text-[#526159]">
                          Delivery rate — AED per delivered shipment
                          <input
                            name="delivery_rate"
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            defaultValue={Number(rate?.delivery_rate ?? 0).toFixed(2)}
                            className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal outline-none focus:border-[#2b9466]"
                          />
                        </label>

                        <label className="mt-4 flex items-center gap-3 rounded-xl border border-[#eadac9] bg-white px-4 py-3">
                          <input
                            type="checkbox"
                            name="return_charge_enabled_ui"
                            defaultChecked={rate?.return_charge_enabled ?? false}
                            className="size-4"
                            onChange={(event) => {
                              const form = event.currentTarget.form;
                              if (!form) return;
                              const hidden = form.elements.namedItem(
                                "return_charge_enabled",
                              ) as HTMLInputElement | null;
                              if (hidden) {
                                hidden.value = String(event.currentTarget.checked);
                              }
                            }}
                          />
                          <span>
                            <span className="block text-sm font-bold text-[#526159]">
                              Charge for Return to Seller
                            </span>
                            <span className="block text-xs text-[#87938d]">
                              Leave off for sellers with free returns.
                            </span>
                          </span>
                        </label>

                        <input
                          type="hidden"
                          name="return_charge_enabled"
                          defaultValue={String(
                            rate?.return_charge_enabled ?? false,
                          )}
                        />

                        <label className="mt-4 block text-xs font-bold text-[#526159]">
                          Return rate — AED per returned shipment
                          <input
                            name="return_rate"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={Number(rate?.return_rate ?? 0).toFixed(2)}
                            className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal outline-none focus:border-[#b76223]"
                          />
                        </label>

                        <p className="mt-3 text-xs leading-5 text-[#87938d]">
                          Reattempt fee is fixed at AED 0.00 and is not charged separately.
                        </p>

                        <button className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white">
                          Save new rate
                        </button>
                      </form>
                    ) : (
                      <div className="rounded-xl border border-[#e4d5b8] bg-[#fffaf1] p-4 text-sm font-semibold text-[#8a651f]">
                        Finance or admin access is required to change rate cards.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
