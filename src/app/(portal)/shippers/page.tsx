import Link from "next/link";
import {
  BadgeDollarSign,
  ChevronDown,
  CirclePause,
  CirclePlay,
  RotateCcw,
  Store,
  Truck,
  UserX,
} from "lucide-react";
import {
  createShipperAction,
  saveShipperRateAction,
  setShipperStatusAction,
} from "@/app/(portal)/shippers/actions";
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
  status: "pending" | "active" | "suspended" | "inactive";
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

type BusinessRow = {
  shipper_id: string;
  company_name: string;
  contact_person: string | null;
  address: string | null;
  city: string | null;
  cod_cycle_days: number;
};

function statusLabel(status: ShipperRow["status"]) {
  if (status === "active") return "Active";
  if (status === "suspended") return "Suspended";
  if (status === "inactive") return "Closed";
  return "Pending";
}

function statusClass(status: ShipperRow["status"]) {
  if (status === "active") return "bg-[#e5f3eb] text-[#16724b]";
  if (status === "suspended") return "bg-[#fff0d8] text-[#976019]";
  if (status === "inactive") return "bg-[#f8eeee] text-[#a34b4b]";
  return "bg-[#eef1f0] text-[#68766f]";
}

export default async function ShippersPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    created?: string;
    status_saved?: string;
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

  const canManageAccounts = [
    "super_admin",
    "operations_admin",
  ].includes(profile.role);

  const [
    { data: shipperData, error: shipperError },
    { data: rateData },
    { data: businessData },
  ] = await Promise.all([
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

    supabase
      .from("shipper_business_profiles")
      .select(
        "shipper_id, company_name, contact_person, address, city, cod_cycle_days",
      )
      .eq("organization_id", profile.organization_id),
  ]);

  const shippers = (shipperData ?? []) as ShipperRow[];
  const rates = (rateData ?? []) as RateRow[];
  const businesses = (businessData ?? []) as BusinessRow[];

  const rateByShipper = new Map<string, RateRow>();
  for (const rate of rates) {
    if (!rateByShipper.has(rate.shipper_id)) {
      rateByShipper.set(rate.shipper_id, rate);
    }
  }

  const businessByShipper = new Map(
    businesses.map((business) => [business.shipper_id, business]),
  );

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
            Create sellers, manage account status and maintain commercial rates.
          </p>
        </div>
      </div>

      {params.created === "1" ? (
        <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          Shipper account and initial rate card created successfully.
        </div>
      ) : null}

      {params.saved === "1" ? (
        <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          Shipper rate card updated successfully.
        </div>
      ) : null}

      {params.status_saved === "1" ? (
        <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          Shipper account status updated.
        </div>
      ) : null}

      {params.error ? (
        <div className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          The requested shipper action could not be completed. Please retry.
        </div>
      ) : null}

      {canManageAccounts ? (
        <details className="group mt-6 overflow-hidden rounded-2xl border border-[#cfe2d8] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-5 sm:px-6">
            <div>
              <p className="text-sm font-semibold text-[#188459]">
                New customer
              </p>
              <h2 className="mt-1 text-xl font-bold text-[#26372f]">
                Create Shipper
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Create login, business profile and initial rate card.
              </p>
            </div>

            <span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
              <ChevronDown className="size-5 transition group-open:rotate-180" />
            </span>
          </summary>

          <form
            action={createShipperAction}
            className="grid gap-4 border-t border-[#e8eeeb] bg-[#fbfcfb] p-5 sm:p-6 lg:grid-cols-2"
          >
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
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-bold text-[#526159] lg:col-span-2">
              Business / return address
              <textarea
                name="address"
                rows={3}
                maxLength={500}
                className="mt-2 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 py-2.5 text-sm font-normal"
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
              Delivery rate — AED
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
              Return rate — AED
              <input
                name="return_rate"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0.00"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
              />
            </label>

            <div className="flex flex-col gap-3 rounded-xl border border-[#e4ebe7] bg-white p-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
              <p className="text-xs text-[#74827b]">
                Reattempt fee is always AED 0.00.
              </p>

              <button className="h-11 rounded-xl bg-[#13734b] px-6 text-sm font-bold text-white">
                Create Shipper
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        <div className="border-b border-[#e8eeeb] px-5 py-4">
          <h2 className="font-bold text-[#26372f]">
            Shipper accounts
          </h2>
          <p className="mt-1 text-xs text-[#87938d]">
            Active, suspended and closed customer accounts.
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
                Use Create Shipper above to add your first customer.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#edf1ef]">
            {shippers.map((shipper) => {
              const rate = rateByShipper.get(shipper.id);
              const business = businessByShipper.get(shipper.id);

              return (
                <div
                  key={shipper.id}
                  className="grid gap-5 p-5 xl:grid-cols-[1fr_1fr]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-bold text-[#26372f]">
                        {business?.company_name ||
                          shipper.full_name ||
                          "Unnamed shipper"}
                      </h3>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(shipper.status)}`}
                      >
                        {statusLabel(shipper.status)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-[#68766f]">
                      {shipper.email}
                    </p>
                    <p className="mt-1 text-sm text-[#87938d]">
                      {shipper.phone || "No phone recorded"}
                    </p>

                    {business ? (
                      <div className="mt-3 text-xs leading-5 text-[#7a8881]">
                        <p>
                          {business.contact_person
                            ? `Contact: ${business.contact_person}`
                            : "No contact person"}
                        </p>
                        <p>
                          {[business.city, business.address]
                            .filter(Boolean)
                            .join(" · ") || "No address recorded"}
                        </p>
                        <p>
                          COD cycle: every {business.cod_cycle_days} day
                          {business.cod_cycle_days === 1 ? "" : "s"}
                        </p>
                      </div>
                    ) : null}

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
                        ? `Rate effective ${formatDubaiDate(rate.effective_from)}`
                        : "No active rate card"}
                    </div>

                    {canManageAccounts ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {shipper.status === "active" ? (
                          <form action={setShipperStatusAction}>
                            <input type="hidden" name="shipper_id" value={shipper.id} />
                            <input type="hidden" name="status" value="suspended" />
                            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e4c98e] bg-[#fffaf1] px-3 text-xs font-bold text-[#8a651f]">
                              <CirclePause className="size-4" />
                              Suspend
                            </button>
                          </form>
                        ) : null}

                        {shipper.status === "suspended" ? (
                          <form action={setShipperStatusAction}>
                            <input type="hidden" name="shipper_id" value={shipper.id} />
                            <input type="hidden" name="status" value="active" />
                            <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#13734b] px-3 text-xs font-bold text-white">
                              <CirclePlay className="size-4" />
                              Reactivate
                            </button>
                          </form>
                        ) : null}

                        {shipper.status !== "inactive" ? (
                          <form action={setShipperStatusAction}>
                            <input type="hidden" name="shipper_id" value={shipper.id} />
                            <input type="hidden" name="status" value="inactive" />
                            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e2c8c8] bg-white px-3 text-xs font-bold text-[#a13f3f]">
                              <UserX className="size-4" />
                              Close account
                            </button>
                          </form>
                        ) : null}

                        {shipper.status === "inactive" &&
                        profile.role === "super_admin" ? (
                          <form action={setShipperStatusAction}>
                            <input type="hidden" name="shipper_id" value={shipper.id} />
                            <input type="hidden" name="status" value="active" />
                            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cde3d7] bg-white px-3 text-xs font-bold text-[#13734b]">
                              <CirclePlay className="size-4" />
                              Reopen account
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    {canEditRates ? (
                      <form
                        action={saveShipperRateAction}
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
                          Delivery rate — AED
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
                          Return rate — AED
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
                          Reattempt fee: AED 0.00
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button className="h-10 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white">
                            Save new rate
                          </button>

                          <Link
                            href={`/shippers/${shipper.id}/zone-rates`}
                            className="inline-flex h-10 items-center rounded-xl border border-[#d7e3dd] bg-white px-4 text-sm font-bold text-[#315244]"
                          >
                            Manage Zone Rates
                          </Link>
                        </div>
                      </form>
                    ) : null}
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
