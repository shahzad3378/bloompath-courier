import {
  Building2,
  CreditCard,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCourierCompany } from "./actions";

export const metadata = {
  title: "Add Courier Company",
};

function errorMessage(code?: string) {
  switch (code) {
    case "missing":
      return "Please complete all required fields.";
    case "slug":
      return "Company slug can only contain lowercase letters, numbers and hyphens.";
    case "awb":
      return "AWB prefix must be 2 to 6 letters or numbers.";
    case "billing":
      return "Select a valid billing cycle.";
    case "market":
      return "Select a valid primary country, operating countries, base currency and supported currencies.";
    case "plan":
      return "Selected SaaS plan is not available.";
    case "company_exists":
      return "A courier company with this slug already exists.";
    case "admin_exists":
      return "This administrator email is already registered.";
    case "organization":
      return "Courier company could not be created.";
    case "provisioning":
      return "Provisioning could not be completed. No partial company was kept.";
    default:
      return null;
  }
}

export default async function NewCourierCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePlatformAdmin();

  const params = await searchParams;
  const message = errorMessage(params.error);

  const admin = createAdminClient();

  const [
    { data: plans },
    { data: countries },
    { data: currencies },
  ] = await Promise.all([
    admin
      .from("saas_plans")
      .select(
        "id, name, code, monthly_price, annual_price, currency, max_internal_users, max_drivers, max_awbs_per_month",
      )
      .eq("is_active", true)
      .order("display_order"),

    admin
      .from("countries")
      .select(
        "code, name, default_currency_code, location_strategy, postal_code_label",
      )
      .eq("is_active", true)
      .order("name"),

    admin
      .from("currencies")
      .select("code, name, symbol")
      .eq("is_active", true)
      .order("code"),
  ]);

  return (
    <div className="bp-page">
      <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[#188459]">
            <Building2 className="size-4" />
            Tenant onboarding
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            Add Courier Company
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Create a new courier tenant, subscription and first administrator.
          </p>
        </div>

        {message ? (
          <div className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
            {message}
          </div>
        ) : null}

        <form action={createCourierCompany} className="mt-7 space-y-6">
          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]">
                <Building2 className="size-5" />
              </span>

              <div>
                <h2 className="font-bold text-[#26372f]">
                  Company Information
                </h2>
                <p className="mt-1 text-xs text-[#87938d]">
                  Core tenant identity and AWB branding.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="text-xs font-bold text-[#53645c]">
                Company Name *
                <input
                  name="company_name"
                  required
                  placeholder="e.g. Fast Drop Logistics"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Company Slug *
                <input
                  name="slug"
                  required
                  placeholder="fast-drop-logistics"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Legal Name
                <input
                  name="legal_name"
                  placeholder="Fast Drop Logistics LLC"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Contact Email
                <input
                  name="contact_email"
                  type="email"
                  placeholder="info@example.com"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Contact Phone
                <input
                  name="contact_phone"
                  placeholder="+971..."
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>



              <label className="text-xs font-bold text-[#53645c]">
                AWB Prefix *
                <input
                  name="awb_prefix"
                  required
                  defaultValue="BP"
                  maxLength={6}
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm uppercase"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]">
                <Building2 className="size-5" />
              </span>

              <div>
                <h2 className="font-bold text-[#26372f]">
                  Market Coverage
                </h2>

                <p className="mt-1 text-xs text-[#87938d]">
                  Configure the tenant's primary market, operating countries and currencies.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="text-xs font-bold text-[#53645c]">
                Primary Country *
                <select
                  name="primary_country"
                  required
                  defaultValue="AE"
                  className="bp-input mt-2 bg-white font-semibold"
                >
                  {(countries ?? []).map((country) => (
                    <option
                      key={country.code}
                      value={country.code}
                    >
                      {country.name} ({country.code})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Base Currency *
                <select
                  name="base_currency"
                  required
                  defaultValue="AED"
                  className="bp-input mt-2 bg-white font-semibold"
                >
                  {(currencies ?? []).map((currency) => (
                    <option
                      key={currency.code}
                      value={currency.code}
                    >
                      {currency.code} — {currency.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-6">
              <p className="text-xs font-bold text-[#53645c]">
                Operating Countries *
              </p>

              <p className="mt-1 text-[11px] text-[#87938d]">
                Select every country where this courier company will operate.
              </p>

              <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto rounded-xl border border-[#e4ebe7] bg-[#fafcfb] p-3 sm:grid-cols-2 lg:grid-cols-3">
                {(countries ?? []).map((country) => (
                  <label
                    key={country.code}
                    className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3"
                  >
                    <input
                      type="checkbox"
                      name="operating_countries"
                      value={country.code}
                      defaultChecked={country.code === "AE"}
                      className="mt-0.5 size-4"
                    />

                    <span>
                      <span className="block text-xs font-bold text-[#34453c]">
                        {country.name}
                      </span>

                      <span className="mt-1 block text-[10px] text-[#87938d]">
                        {country.location_strategy.replaceAll("_", " ")}
                        {country.postal_code_label
                          ? ` · ${country.postal_code_label}`
                          : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-bold text-[#53645c]">
                Supported Currencies *
              </p>

              <p className="mt-1 text-[11px] text-[#87938d]">
                Base currency must also be selected below.
              </p>

              <div className="mt-3 grid gap-2 rounded-xl border border-[#e4ebe7] bg-[#fafcfb] p-3 sm:grid-cols-2 lg:grid-cols-4">
                {(currencies ?? []).map((currency) => (
                  <label
                    key={currency.code}
                    className="flex cursor-pointer items-center gap-3 rounded-xl bg-white p-3"
                  >
                    <input
                      type="checkbox"
                      name="supported_currencies"
                      value={currency.code}
                      defaultChecked={currency.code === "AED"}
                      className="size-4"
                    />

                    <span>
                      <span className="block text-xs font-black text-[#34453c]">
                        {currency.code}
                      </span>

                      <span className="mt-0.5 block text-[10px] text-[#87938d]">
                        {currency.name}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]">
                <CreditCard className="size-5" />
              </span>

              <div>
                <h2 className="font-bold text-[#26372f]">
                  Subscription
                </h2>
                <p className="mt-1 text-xs text-[#87938d]">
                  Assign the commercial package and billing cycle.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-3">
              <label className="text-xs font-bold text-[#53645c]">
                SaaS Plan *
                <select
                  name="plan_id"
                  required
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-semibold"
                >
                  {(plans ?? []).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Billing Cycle *
                <select
                  name="billing_cycle"
                  defaultValue="monthly"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-semibold"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Trial Days
                <input
                  name="trial_days"
                  type="number"
                  min="0"
                  max="90"
                  defaultValue="14"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {(plans ?? []).map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-xl border border-[#e5ebe8] bg-[#fafcfb] p-4"
                >
                  <p className="font-bold text-[#30443a]">
                    {plan.name}
                  </p>

                  <p className="mt-2 text-sm font-black text-[#13734b]">
                    {Number(plan.monthly_price) === 0
                      ? "Custom Pricing"
                      : `${plan.currency} ${Number(
                          plan.monthly_price,
                        ).toFixed(2)}/mo`}
                  </p>

                  <div className="mt-3 space-y-1 text-[11px] text-[#7b8881]">
                    <p>
                      Users: {plan.max_internal_users ?? "Unlimited"}
                    </p>
                    <p>
                      Drivers: {plan.max_drivers ?? "Unlimited"}
                    </p>
                    <p>
                      AWBs:{" "}
                      {plan.max_awbs_per_month
                        ? `${Number(
                            plan.max_awbs_per_month,
                          ).toLocaleString()}/month`
                        : "Unlimited"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]">
                <UserRoundPlus className="size-5" />
              </span>

              <div>
                <h2 className="font-bold text-[#26372f]">
                  First Administrator
                </h2>
                <p className="mt-1 text-xs text-[#87938d]">
                  This user becomes the tenant super administrator.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="text-xs font-bold text-[#53645c]">
                Full Name *
                <input
                  name="admin_name"
                  required
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Email *
                <input
                  name="admin_email"
                  type="email"
                  required
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Phone
                <input
                  name="admin_phone"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-[#53645c]">
                Temporary Password *
                <input
                  name="temporary_password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                />
              </label>
            </div>
          </section>

          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#cfe3d8] bg-[#edf8f2] p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-[#13734b]" />
              <div>
                <p className="text-sm font-bold text-[#30443a]">
                  Provision SaaS Tenant
                </p>
                <p className="mt-1 text-xs text-[#678076]">
                  Company, subscription, settings and admin access will be created together.
                </p>
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#13734b] px-6 text-sm font-bold text-white"
            >
              Create Courier Company
            </button>
          </div>
        </form>
    </div>
  );
}
