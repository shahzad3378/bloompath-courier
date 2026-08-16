import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  LayoutDashboard,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "BloomPath SaaS Control Center",
};

function money(value: number, currency = "AED") {
  return `${currency} ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dateLabel(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function SaasDashboardPage() {
  const platformAdmin = await requirePlatformAdmin();
  const admin = createAdminClient();
  const db = admin as any;

  const [
    { data: organizations },
    { data: plans },
    { data: subscriptions },
    { data: profiles },
  ] = await Promise.all([
    db
      .from("organizations")
      .select("id, name, slug, is_active, created_at")
      .order("created_at", { ascending: false }),

    db
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
      .order("display_order"),

    db
      .from("organization_subscriptions")
      .select(`
        id,
        organization_id,
        plan_id,
        status,
        billing_cycle,
        trial_starts_at,
        trial_ends_at,
        current_period_starts_at,
        current_period_ends_at,
        next_billing_at,
        price_override,
        currency,
        auto_renew,
        suspended_at,
        cancelled_at,
        created_at
      `)
      .order("created_at", { ascending: false }),

    db
      .from("profiles")
      .select("id, organization_id, role, status"),
  ]);

  const organizationRows = organizations ?? [];
  const planRows = plans ?? [];
  const subscriptionRows = subscriptions ?? [];
  const profileRows = profiles ?? [];

  const planMap = new Map<number, any>(
    planRows.map((plan: any) => [Number(plan.id), plan]),
  );

  const subscriptionMap = new Map<string, any>(
    subscriptionRows.map((subscription: any) => [
      String(subscription.organization_id),
      subscription,
    ]),
  );

  const activeSubscriptions = subscriptionRows.filter(
    (row: any) => row.status === "active",
  ).length;

  const trialSubscriptions = subscriptionRows.filter(
    (row: any) => row.status === "trial",
  ).length;

  const suspendedSubscriptions = subscriptionRows.filter(
    (row: any) =>
      row.status === "suspended" ||
      row.status === "past_due",
  ).length;

  const monthlyRecurringRevenue = subscriptionRows
    .filter((row: any) => row.status === "active")
    .reduce((sum: number, subscription: any) => {
      const plan = planMap.get(Number(subscription.plan_id));

      if (!plan) return sum;

      if (subscription.price_override !== null) {
        if (subscription.billing_cycle === "annual") {
          return sum + Number(subscription.price_override) / 12;
        }

        return sum + Number(subscription.price_override);
      }

      if (subscription.billing_cycle === "annual") {
        return sum + Number(plan.annual_price || 0) / 12;
      }

      if (subscription.billing_cycle === "custom") {
        return sum;
      }

      return sum + Number(plan.monthly_price || 0);
    }, 0);

  const activeUsers = profileRows.filter(
    (row: any) => row.status === "active",
  ).length;

  const driverCount = profileRows.filter(
    (row: any) =>
      row.role === "driver" && row.status === "active",
  ).length;

  const tenantRows = organizationRows.map((organization: any) => {
    const subscription = subscriptionMap.get(organization.id);
    const plan = subscription
      ? planMap.get(Number(subscription.plan_id))
      : null;

    const orgProfiles = profileRows.filter(
      (row: any) => row.organization_id === organization.id,
    );

    return {
      ...organization,
      subscription,
      plan,
      users: orgProfiles.filter(
        (row: any) => row.status === "active",
      ).length,
      drivers: orgProfiles.filter(
        (row: any) =>
          row.role === "driver" &&
          row.status === "active",
      ).length,
      shippers: orgProfiles.filter(
        (row: any) =>
          row.role === "shipper" &&
          row.status === "active",
      ).length,
    };
  });

  return (
    <div className="min-h-screen bg-[#f3f6f5]">
      <header className="border-b border-[#dfe7e3] bg-[#10291f] text-white">
        <div className="mx-auto flex min-h-20 max-w-[1600px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-[#2ca66e] font-black">
              BP
            </span>

            <div>
              <p className="font-bold tracking-tight">
                BloomPath Courier SaaS
              </p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                Platform Control Center
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-right sm:block">
              <p className="text-xs font-bold">
                {platformAdmin.email || "Platform Admin"}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/45">
                BloomPath Platform Admin
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-bold transition hover:bg-white/15"
            >
              <LayoutDashboard className="size-4" />
              Courier Portal
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-7 lg:px-8 lg:py-9">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-[#188459]">
              <ShieldCheck className="size-4" />
              Platform administration
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
              SaaS Control Center
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-[#74827b]">
              Manage courier companies, plans, subscriptions and platform usage
              from one BloomPath workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/saas/companies/new"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#13734b] px-5 text-xs font-bold text-white"
            >
              <Building2 className="size-4" />
              Add Courier Company
            </Link>

            <div className="inline-flex items-center gap-2 rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-xs font-bold text-[#13734b]">
              <Sparkles className="size-4" />
              Multi-tenant SaaS active
            </div>
          </div>
        </div>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {[
            {
              label: "Courier Companies",
              value: String(organizationRows.length),
              icon: Building2,
            },
            {
              label: "Active Subscriptions",
              value: String(activeSubscriptions),
              icon: CheckCircle2,
            },
            {
              label: "Trial Accounts",
              value: String(trialSubscriptions),
              icon: CalendarClock,
            },
            {
              label: "Past Due / Suspended",
              value: String(suspendedSubscriptions),
              icon: ShieldCheck,
            },
            {
              label: "Active Users",
              value: String(activeUsers),
              icon: UsersRound,
            },
            {
              label: "MRR Estimate",
              value: money(monthlyRecurringRevenue),
              icon: CircleDollarSign,
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="rounded-2xl border border-[#e0e8e4] bg-white p-5"
              >
                <Icon className="size-5 text-[#13734b]" />

                <p className="mt-4 text-2xl font-black text-[#26372f]">
                  {item.value}
                </p>

                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                  {item.label}
                </p>
              </div>
            );
          })}
        </section>

        <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
            <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
              <div>
                <h2 className="font-bold text-[#26372f]">
                  Courier Companies
                </h2>

                <p className="mt-1 text-xs text-[#87938d]">
                  All organizations running on the BloomPath platform.
                </p>
              </div>

              <Building2 className="size-5 text-[#13734b]" />
            </div>

            {tenantRows.length === 0 ? (
              <p className="p-10 text-center text-sm text-[#87938d]">
                No courier companies have been created yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left text-sm">
                  <thead className="bg-[#f8faf9] text-[10px] uppercase tracking-wide text-[#77847e]">
                    <tr>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Subscription</th>
                      <th className="px-4 py-3">Users</th>
                      <th className="px-4 py-3">Drivers</th>
                      <th className="px-4 py-3">Shippers</th>
                      <th className="px-4 py-3">Renewal</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#edf1ef]">
                    {tenantRows.map((row: any) => (
                      <tr key={row.id} className="hover:bg-[#fbfcfb]">
                        <td className="px-4 py-4">
                          <p className="font-bold text-[#30443a]">
                            {row.name}
                          </p>

                          <p className="mt-1 font-mono text-[10px] text-[#96a09b]">
                            {row.slug}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <span className="rounded-full bg-[#edf8f2] px-2.5 py-1 text-[10px] font-black uppercase text-[#176a47]">
                            {row.plan?.name || "No Plan"}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                              row.subscription?.status === "active"
                                ? "bg-[#e8f7ef] text-[#13734b]"
                                : row.subscription?.status === "trial"
                                  ? "bg-[#eef4ff] text-[#46639b]"
                                  : "bg-[#fff0f0] text-[#b74646]"
                            }`}
                          >
                            {row.subscription?.status || "none"}
                          </span>
                        </td>

                        <td className="px-4 py-4 font-semibold">
                          {row.users}
                        </td>

                        <td className="px-4 py-4 font-semibold">
                          {row.drivers}
                        </td>

                        <td className="px-4 py-4 font-semibold">
                          {row.shippers}
                        </td>

                        <td className="px-4 py-4 text-xs text-[#65736c]">
                          {dateLabel(
                            row.subscription?.next_billing_at ||
                              row.subscription?.current_period_ends_at ||
                              row.subscription?.trial_ends_at ||
                              null,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
              <div className="border-b border-[#e8eeeb] px-5 py-4">
                <h2 className="font-bold text-[#26372f]">
                  SaaS Plans
                </h2>

                <p className="mt-1 text-xs text-[#87938d]">
                  Current commercial packages.
                </p>
              </div>

              <div className="divide-y divide-[#edf1ef]">
                {planRows.map((plan: any) => (
                  <div key={plan.id} className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-[#30443a]">
                          {plan.name}
                        </p>

                        <p className="mt-1 text-xs text-[#87938d]">
                          {plan.code}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-black text-[#13734b]">
                          {Number(plan.monthly_price || 0) === 0
                            ? "Custom"
                            : money(
                                Number(plan.monthly_price),
                                plan.currency,
                              )}
                        </p>

                        {Number(plan.monthly_price || 0) > 0 ? (
                          <p className="mt-1 text-[10px] text-[#909b96]">
                            per month
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-[#69766f]">
                      <p>
                        Users:{" "}
                        <strong>
                          {plan.max_internal_users ?? "Unlimited"}
                        </strong>
                      </p>

                      <p>
                        Drivers:{" "}
                        <strong>
                          {plan.max_drivers ?? "Unlimited"}
                        </strong>
                      </p>

                      <p>
                        AWBs:{" "}
                        <strong>
                          {plan.max_awbs_per_month
                            ? `${Number(
                                plan.max_awbs_per_month,
                              ).toLocaleString()}/mo`
                            : "Unlimited"}
                        </strong>
                      </p>

                      <p>
                        Live Map:{" "}
                        <strong>
                          {plan.live_map_enabled ? "Yes" : "No"}
                        </strong>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#cfe3d8] bg-[#edf8f2] p-5">
              <BadgeDollarSign className="size-5 text-[#13734b]" />

              <p className="mt-3 font-bold text-[#30443a]">
                Revenue Overview
              </p>

              <p className="mt-2 text-3xl font-black text-[#13734b]">
                {money(monthlyRecurringRevenue)}
              </p>

              <p className="mt-1 text-xs text-[#678076]">
                Estimated normalized monthly recurring revenue from active
                subscriptions.
              </p>
            </div>

            <div className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
              <PackageCheck className="size-5 text-[#13734b]" />

              <p className="mt-3 font-bold text-[#30443a]">
                Platform Activity
              </p>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#7c8983]">
                    Total active drivers
                  </span>
                  <strong>{driverCount}</strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-[#7c8983]">
                    Commercial plans
                  </span>
                  <strong>{planRows.length}</strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-[#7c8983]">
                    Active tenants
                  </span>
                  <strong>
                    {
                      organizationRows.filter(
                        (row: any) => row.is_active,
                      ).length
                    }
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-7 flex justify-end">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#13734b] hover:underline"
          >
            Open courier operations
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
