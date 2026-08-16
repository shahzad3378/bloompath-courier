import {
  BadgeDollarSign,
  CheckCircle2,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSaasPlanAction } from "./actions";

export const metadata = {
  title: "Rates & Plans",
};

function valueOrBlank(value: unknown) {
  return value === null || value === undefined
    ? ""
    : String(value);
}

export default async function SaasPlansPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    error?: string;
  }>;
}) {
  await requirePlatformAdmin();

  const params = await searchParams;
  const admin = createAdminClient();

  const { data: plans, error } = await admin
    .from("saas_plans")
    .select(`
      id,
      code,
      name,
      monthly_price,
      annual_price,
      currency,
      max_internal_users,
      max_drivers,
      max_shippers,
      max_awbs_per_month,
      custom_reports_enabled,
      live_map_enabled,
      api_enabled,
      white_label_enabled,
      custom_domain_enabled,
      is_active,
      display_order
    `)
    .order("display_order");

  return (
    <div className="bp-page">
      <div>
        <p className="bp-section-label">
          SaaS Management
        </p>

        <h1 className="bp-heading mt-1 text-3xl font-black">
          Rates & Plans
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-[#74827b]">
          Manage subscription pricing, usage limits and
          features available to courier-company tenants.
        </p>
      </div>

      {params.saved ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          <CheckCircle2 className="size-5" />
          SaaS plan updated successfully.
        </div>
      ) : null}

      {params.error ? (
        <div className="mt-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          Plan could not be updated. Check the values and retry.
        </div>
      ) : null}

      {error ? (
        <div className="bp-panel mt-6 p-10 text-center text-sm font-semibold text-[#a13f3f]">
          SaaS plans could not be loaded.
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {(plans ?? []).map((plan) => (
            <form
              key={plan.id}
              action={updateSaasPlanAction}
              className="bp-panel overflow-hidden"
            >
              <input
                type="hidden"
                name="plan_id"
                value={plan.id}
              />

              <div className="bp-panel-header flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]">
                    <BadgeDollarSign className="size-5" />
                  </span>

                  <div>
                    <h2 className="text-lg font-black text-[#26372f]">
                      {plan.name}
                    </h2>

                    <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                      {plan.code}
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-[#526159]">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={plan.is_active}
                    className="size-4"
                  />
                  Active Plan
                </label>
              </div>

              <div className="p-5 sm:p-6">
                <section>
                  <div className="flex items-center gap-2">
                    <BadgeDollarSign className="size-4 text-[#15905c]" />

                    <h3 className="text-sm font-black text-[#34453c]">
                      Subscription Rates
                    </h3>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <label className="text-xs font-bold text-[#53645c]">
                      Monthly Rate ({plan.currency})
                      <input
                        name="monthly_price"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        defaultValue={Number(
                          plan.monthly_price || 0,
                        )}
                        className="bp-input mt-2"
                      />
                    </label>

                    <label className="text-xs font-bold text-[#53645c]">
                      Annual Rate ({plan.currency})
                      <input
                        name="annual_price"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        defaultValue={Number(
                          plan.annual_price || 0,
                        )}
                        className="bp-input mt-2"
                      />
                    </label>

                    <div className="rounded-xl bg-[#f5f8f6] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                        Currency
                      </p>

                      <p className="mt-2 text-lg font-black text-[#26372f]">
                        {plan.currency}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="mt-7 border-t border-[#edf1ef] pt-6">
                  <div className="flex items-center gap-2">
                    <Gauge className="size-4 text-[#15905c]" />

                    <h3 className="text-sm font-black text-[#34453c]">
                      Usage Limits
                    </h3>
                  </div>

                  <p className="mt-1 text-[11px] text-[#87938d]">
                    Leave a field empty for unlimited usage.
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="text-xs font-bold text-[#53645c]">
                      Internal Users
                      <input
                        name="max_internal_users"
                        type="number"
                        min="0"
                        defaultValue={valueOrBlank(
                          plan.max_internal_users,
                        )}
                        className="bp-input mt-2"
                      />
                    </label>

                    <label className="text-xs font-bold text-[#53645c]">
                      Drivers
                      <input
                        name="max_drivers"
                        type="number"
                        min="0"
                        defaultValue={valueOrBlank(
                          plan.max_drivers,
                        )}
                        className="bp-input mt-2"
                      />
                    </label>

                    <label className="text-xs font-bold text-[#53645c]">
                      Shippers
                      <input
                        name="max_shippers"
                        type="number"
                        min="0"
                        defaultValue={valueOrBlank(
                          plan.max_shippers,
                        )}
                        className="bp-input mt-2"
                      />
                    </label>

                    <label className="text-xs font-bold text-[#53645c]">
                      AWBs / Month
                      <input
                        name="max_awbs_per_month"
                        type="number"
                        min="0"
                        defaultValue={valueOrBlank(
                          plan.max_awbs_per_month,
                        )}
                        className="bp-input mt-2"
                      />
                    </label>
                  </div>
                </section>

                <section className="mt-7 border-t border-[#edf1ef] pt-6">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-[#15905c]" />

                    <h3 className="text-sm font-black text-[#34453c]">
                      Plan Features
                    </h3>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      [
                        "custom_reports_enabled",
                        "Custom Reports",
                        plan.custom_reports_enabled,
                      ],
                      [
                        "live_map_enabled",
                        "Live Map",
                        plan.live_map_enabled,
                      ],
                      [
                        "api_enabled",
                        "API Access",
                        plan.api_enabled,
                      ],
                      [
                        "white_label_enabled",
                        "White Label",
                        plan.white_label_enabled,
                      ],
                      [
                        "custom_domain_enabled",
                        "Custom Domain",
                        plan.custom_domain_enabled,
                      ],
                    ].map(([name, label, enabled]) => (
                      <label
                        key={String(name)}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e4ebe7] bg-[#fafcfb] p-4"
                      >
                        <input
                          type="checkbox"
                          name={String(name)}
                          defaultChecked={Boolean(enabled)}
                          className="size-4"
                        />

                        <span className="text-xs font-bold text-[#53645c]">
                          {String(label)}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>

                <div className="mt-7 flex justify-end border-t border-[#edf1ef] pt-5">
                  <button
                    type="submit"
                    className="bp-button-primary"
                  >
                    <CheckCircle2 className="size-4" />
                    Save {plan.name}
                  </button>
                </div>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
