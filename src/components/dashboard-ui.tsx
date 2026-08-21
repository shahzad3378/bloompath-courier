import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  RotateCcw,
  Truck,
  UsersRound,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import {
  formatAed,
  formatDubaiDate,
  type Shipment,
} from "@/lib/shipments";

type DashboardStats = {
  booked: number;
  inProgress: number;
  warehouse: number;
  delivered: number;
  undelivered: number;
  returns: number;
  liveOutForDelivery: number;
  liveWarehouse: number;
  liveUndelivered: number;
  liveReturns: number;
  codCollected: number;
};

type RecentShipment = Pick<
  Shipment,
  | "id"
  | "tracking_number"
  | "consignee_name"
  | "consignee_city"
  | "cod_amount"
  | "status"
  | "booked_at"
>;

type RangeData = {
  key: "today" | "yesterday" | "7d" | "30d" | "month" | "custom";
  label: string;
  from: string;
  to: string;
};

type MovementBucket = {
  label: string;
  count: number;
};

type DashboardDriver = {
  driverId: string;
  name: string;
  isOnline: boolean;
  recordedAt: string;
};

const rangeLinks = [
  ["Today", "today"],
  ["Yesterday", "yesterday"],
  ["7 Days", "7d"],
  ["30 Days", "30d"],
  ["This Month", "month"],
] as const;

function buildChartPoints(
  movement: MovementBucket[],
  width = 700,
  height = 210,
) {
  if (movement.length === 0) return "";

  const max = Math.max(1, ...movement.map((item) => item.count));
  const denominator = Math.max(1, movement.length - 1);

  return movement
    .map((item, index) => {
      const x = (index / denominator) * width;
      const y = height - (item.count / max) * (height - 30) - 15;
      return `${x},${y}`;
    })
    .join(" ");
}

function driverTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DashboardUI({
  name,
  stats,
  recent,
  range,
  movement,
  drivers,
}: {
  name: string;
  stats: DashboardStats;
  recent: RecentShipment[];
  range: RangeData;
  movement: MovementBucket[];
  drivers: DashboardDriver[];
}) {
  const totalStatus =
    stats.delivered +
    stats.inProgress +
    stats.undelivered +
    stats.returns;

  const deliveredPct =
    totalStatus > 0 ? (stats.delivered / totalStatus) * 100 : 0;

  const inProgressPct =
    totalStatus > 0
      ? (stats.inProgress / totalStatus) * 100
      : 0;

  const undeliveredPct =
    totalStatus > 0
      ? (stats.undelivered / totalStatus) * 100
      : 0;

  const donutBackground =
    totalStatus === 0
      ? "conic-gradient(#edf1ef 0% 100%)"
      : `conic-gradient(
          #15905c 0% ${deliveredPct}%,
          #3f82df ${deliveredPct}% ${deliveredPct + inProgressPct}%,
          #eea33b ${deliveredPct + inProgressPct}% ${
            deliveredPct + inProgressPct + undeliveredPct
          }%,
          #df5555 ${deliveredPct + inProgressPct + undeliveredPct}% 100%
        )`;

  const chartPoints = buildChartPoints(movement);

  const kpis = [
    {
      label: "Total Shipments",
      value: stats.booked,
      note: range.label,
      icon: PackageCheck,
      tone: "bg-[#eaf7f0] text-[#15905c]",
      trend: "Selected period",
      trendClass: "text-[#15905c]",
    },
    {
      label: "Delivered",
      value: stats.delivered,
      note: range.label,
      icon: Truck,
      tone: "bg-[#eaf2ff] text-[#3f82df]",
      trend: "Completed",
      trendClass: "text-[#15905c]",
    },
    {
      label: "In Progress",
      value: stats.inProgress,
      note: range.label,
      icon: Clock3,
      tone: "bg-[#fff3e3] text-[#dd8b24]",
      trend: `${stats.warehouse} Warehouse`,
      trendClass: "text-[#dd8b24]",
    },
    {
      label: "Failed / RTO",
      value: stats.undelivered + stats.returns,
      note: range.label,
      icon: RotateCcw,
      tone: "bg-[#fff0f0] text-[#d85151]",
      trend: `${stats.returns} RTO`,
      trendClass: "text-[#d85151]",
    },
  ];

  return (
    <div className="bp-page">
      <div className="fade-up flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div>
          <h1 className="bp-heading text-3xl font-black">
            Dashboard
          </h1>

          <p className="mt-1 text-sm text-[#74827b]">
            Welcome back, {name.split(" ")[0] || "Admin"}! Here&apos;s what&apos;s happening with your operations.
          </p>
        </div>

        <div className="rounded-xl border border-[#e1e8e4] bg-white p-2 shadow-sm">
          <div className="flex items-center gap-2 px-2 py-1 text-xs font-bold text-[#526159]">
            <CalendarDays className="size-4 text-[#15905c]" />
            {range.label}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {rangeLinks.map(([label, key]) => (
              <Link
                key={key}
                href={`/dashboard?range=${key}`}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                  range.key === key
                    ? "bg-[#15905c] text-white"
                    : "text-[#65736c] hover:bg-[#f2f6f4]"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section className="fade-up-delay mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;

          return (
            <article
              key={item.label}
              className="bp-card p-5"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`grid size-12 shrink-0 place-items-center rounded-full ${item.tone}`}
                >
                  <Icon className="size-5" />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#68766f]">
                    {item.label}
                  </p>

                  <div className="mt-1 flex items-end gap-2">
                    <p className="text-2xl font-black tracking-[-0.035em] text-[#17231e]">
                      {item.value.toLocaleString()}
                    </p>

                    <span
                      className={`mb-0.5 text-[11px] font-bold ${item.trendClass}`}
                    >
                      {item.trend}
                    </span>
                  </div>

                  <p className="mt-1 truncate text-[10px] text-[#99a39e]">
                    {item.note}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.72fr]">
        <article className="bp-panel overflow-hidden">
          <div className="bp-panel-header flex items-center justify-between">
            <div>
              <h2 className="font-black text-[#26372f]">
                Shipments Overview
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Booking movement for the selected period.
              </p>
            </div>

            <span className="rounded-lg bg-[#f3f7f5] px-3 py-1.5 text-[11px] font-bold text-[#64736c]">
              {movement.reduce((sum, item) => sum + item.count, 0)} shipments
            </span>
          </div>

          <div className="px-5 pb-5 pt-6">
            <div className="relative h-[240px] overflow-hidden">
              <div className="absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2, 3].map((line) => (
                  <div
                    key={line}
                    className="border-t border-dashed border-[#e8eeeb]"
                  />
                ))}
              </div>

              {movement.length > 0 ? (
                <svg
                  viewBox="0 0 700 210"
                  preserveAspectRatio="none"
                  className="absolute inset-x-0 bottom-5 h-[205px] w-full overflow-visible"
                >
                  <defs>
                    <linearGradient
                      id="shipmentArea"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#26a269"
                        stopOpacity="0.28"
                      />
                      <stop
                        offset="100%"
                        stopColor="#26a269"
                        stopOpacity="0.01"
                      />
                    </linearGradient>
                  </defs>

                  {chartPoints ? (
                    <>
                      <polygon
                        points={`0,210 ${chartPoints} 700,210`}
                        fill="url(#shipmentArea)"
                      />

                      <polyline
                        points={chartPoints}
                        fill="none"
                        stroke="#15905c"
                        strokeWidth="4"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </>
                  ) : null}
                </svg>
              ) : null}

              <div
                className="absolute inset-x-0 bottom-0 grid gap-1 text-center text-[10px] text-[#89958f]"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(
                    movement.length,
                    1,
                  )}, minmax(0, 1fr))`,
                }}
              >
                {movement.map((item, index) => (
                  <span key={`${item.label}-${index}`}>
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Booked", stats.booked],
                ["Delivered", stats.delivered],
                ["In Progress", stats.inProgress],
                ["Failed / RTO", stats.undelivered + stats.returns],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-[#e6ece9] bg-[#fcfdfc] px-4 py-3"
                >
                  <p className="text-lg font-black text-[#25362e]">
                    {Number(value).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[10px] text-[#87938d]">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <div className="space-y-5">
          <article className="bp-panel overflow-hidden">
            <div className="bp-panel-header flex items-center justify-between">
              <div>
                <h2 className="font-black text-[#26372f]">
                  Active Drivers
                </h2>
                <p className="mt-1 text-xs text-[#87938d]">
                  Latest driver GPS activity.
                </p>
              </div>

              <Link
                href="/live-map"
                className="text-[11px] font-bold text-[#15905c]"
              >
                View map
              </Link>
            </div>

            {drivers.length === 0 ? (
              <div className="p-6 text-center">
                <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#f1f4f2] text-[#87938d]">
                  <UsersRound className="size-5" />
                </div>
                <p className="mt-3 text-xs font-semibold text-[#69766f]">
                  No driver GPS activity yet
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#edf1ef]">
                {drivers.slice(0, 5).map((driver) => (
                  <div
                    key={driver.driverId}
                    className="flex items-center gap-3 px-5 py-3.5"
                  >
                    <div className="grid size-9 place-items-center rounded-full bg-[#eef8f2] text-xs font-black text-[#15905c]">
                      {driver.name.slice(0, 1).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[#33443b]">
                        {driver.name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#8a9690]">
                        Updated {driverTime(driver.recordedAt)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${
                        driver.isOnline
                          ? "bg-[#e8f7ef] text-[#13734b]"
                          : "bg-[#f1f3f2] text-[#7b8580]"
                      }`}
                    >
                      {driver.isOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="bp-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-[#26372f]">
                Shipment Status
              </h2>

              <span className="text-[10px] font-semibold text-[#8c9791]">
                Selected period
              </span>
            </div>

            <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row xl:flex-col 2xl:flex-row">
              <div
                className="relative grid size-40 shrink-0 place-items-center rounded-full"
                style={{
                  background: donutBackground,
                }}
              >
                <div className="grid size-[112px] place-items-center rounded-full bg-white text-center shadow-inner">
                  <div>
                    <p className="text-2xl font-black text-[#17231e]">
                      {totalStatus.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[#89958f]">
                      Total
                    </p>
                  </div>
                </div>
              </div>

              <div className="w-full space-y-3">
                {[
                  ["Delivered", stats.delivered, "#15905c"],
                  ["In Progress", stats.inProgress, "#3f82df"],
                  ["Undelivered", stats.undelivered, "#eea33b"],
                  ["Returns / RTO", stats.returns, "#df5555"],
                ].map(([label, value, color]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between gap-4 text-xs"
                  >
                    <span className="flex items-center gap-2 text-[#5f6d66]">
                      <span
                        className="size-2 rounded-full"
                        style={{
                          backgroundColor: String(color),
                        }}
                      />
                      {label}
                    </span>

                    <strong className="text-[#26372f]">
                      {Number(value).toLocaleString()}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="bp-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-black text-[#26372f]">
                  COD Collections
                </h2>

                <p className="mt-4 text-2xl font-black tracking-[-0.03em] text-[#17231e]">
                  {formatAed(stats.codCollected)}
                </p>

                <p className="mt-1 text-[10px] text-[#87938d]">
                  Collected amount · {range.label}
                </p>
              </div>

              <div className="grid size-12 place-items-center rounded-full bg-[#eaf7f0] text-[#15905c]">
                <CircleDollarSign className="size-5" />
              </div>
            </div>

            <Link
              href="/finance"
              className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#15905c]"
            >
              Open finance
              <ArrowRight className="size-3.5" />
            </Link>
          </article>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
        <article className="bp-panel overflow-hidden">
          <div className="bp-panel-header flex items-center justify-between">
            <div>
              <h2 className="font-black text-[#26372f]">
                Recent Shipments
              </h2>

              <p className="mt-1 text-xs text-[#87938d]">
                Latest bookings within the selected period.
              </p>
            </div>

            <Link
              href="/shipments"
              className="text-xs font-bold text-[#15905c]"
            >
              View all shipments
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="grid min-h-52 place-items-center px-6 py-10 text-center">
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf5f1] text-[#188459]">
                  <PackageCheck className="size-6" />
                </div>

                <p className="mt-4 font-semibold text-[#33433b]">
                  No shipments in this period
                </p>

                <p className="mt-1 text-sm text-[#829089]">
                  Change the date range or create a new shipment.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#85918b]">
                  <tr>
                    <th className="px-5 py-3">AWB Number</th>
                    <th className="px-5 py-3">Recipient</th>
                    <th className="px-5 py-3">Destination</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">COD</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#edf1ef]">
                  {recent.map((shipment) => (
                    <tr
                      key={shipment.id}
                      className="bp-table-row"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/shipments/${shipment.id}`}
                          className="font-mono text-xs font-black text-[#15905c]"
                        >
                          {shipment.tracking_number}
                        </Link>
                      </td>

                      <td className="px-5 py-4 font-semibold text-[#33443b]">
                        {shipment.consignee_name}
                      </td>

                      <td className="px-5 py-4 text-[#65736c]">
                        {shipment.consignee_city}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={shipment.status} />
                      </td>

                      <td className="px-5 py-4 text-xs text-[#65736c]">
                        {formatDubaiDate(shipment.booked_at)}
                      </td>

                      <td className="px-5 py-4 font-bold text-[#33443b]">
                        {formatAed(shipment.cod_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="bp-panel overflow-hidden">
          <div className="bp-panel-header">
            <h2 className="font-black text-[#26372f]">
              Operational Queues
            </h2>

            <p className="mt-1 text-xs text-[#87938d]">
              Items currently requiring attention.
            </p>
          </div>

          <div className="divide-y divide-[#edf1ef]">
            {[
              {
                label: "Out for Delivery",
                value: stats.liveOutForDelivery,
                icon: Truck,
                href: "/dispatch",
                tone: "bg-[#eaf2ff] text-[#3f82df]",
              },
              {
                label: "At Warehouse",
                value: stats.liveWarehouse,
                icon: PackageCheck,
                href: "/warehouse",
                tone: "bg-[#eef8f2] text-[#15905c]",
              },
              {
                label: "Undelivered",
                value: stats.liveUndelivered,
                icon: ArrowDownRight,
                href: "/shipments?status=undelivered",
                tone: "bg-[#fff3e3] text-[#dd8b24]",
              },
              {
                label: "Return Pending",
                value: stats.liveReturns,
                icon: RotateCcw,
                href: "/returns",
                tone: "bg-[#fff0f0] text-[#d85151]",
              },
              {
                label: "Delivered",
                value: stats.delivered,
                icon: ArrowUpRight,
                href: "/shipments?status=delivered",
                tone: "bg-[#eaf7f0] text-[#15905c]",
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#fafcfb]"
                >
                  <span
                    className={`grid size-9 place-items-center rounded-full ${item.tone}`}
                  >
                    <Icon className="size-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#33443b]">
                      {item.label}
                    </p>
                  </div>

                  <strong className="text-sm text-[#26372f]">
                    {item.value.toLocaleString()}
                  </strong>
                </Link>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}
