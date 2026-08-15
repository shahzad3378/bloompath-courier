import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  PackageCheck,
  RotateCcw,
  Truck,
  WalletCards,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import {
  formatAed,
  formatDubaiDate,
  type Shipment,
} from "@/lib/shipments";

const toneClass = {
  green: "bg-[#e6f5ed] text-[#188459]",
  blue: "bg-[#e8f0fb] text-[#376eb1]",
  teal: "bg-[#e4f5f3] text-[#27847c]",
  orange: "bg-[#fff2df] text-[#c47717]",
  red: "bg-[#fdeaea] text-[#c45151]",
  purple: "bg-[#f0eafb] text-[#7251ae]",
};

type DashboardStats = {
  booked: number;
  outForDelivery: number;
  delivered: number;
  undelivered: number;
  returns: number;
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

const rangeLinks = [
  ["Today", "today"],
  ["Yesterday", "yesterday"],
  ["Last 7 Days", "7d"],
  ["Last 30 Days", "30d"],
  ["This Month", "month"],
] as const;

export function DashboardUI({
  name,
  stats,
  recent,
  range,
  movement,
}: {
  name: string;
  stats: DashboardStats;
  recent: RecentShipment[];
  range: RangeData;
  movement: MovementBucket[];
}) {
  const statCards = [
    {
      label: "Shipments booked",
      value: String(stats.booked),
      note: range.label,
      icon: PackageCheck,
      tone: "green",
    },
    {
      label: "Out for delivery",
      value: String(stats.outForDelivery),
      note: "Current live queue",
      icon: Truck,
      tone: "blue",
    },
    {
      label: "Delivered",
      value: String(stats.delivered),
      note: range.label,
      icon: ArrowUpRight,
      tone: "teal",
    },
    {
      label: "Undelivered",
      value: String(stats.undelivered),
      note: "Current action queue",
      icon: ArrowDownRight,
      tone: "orange",
    },
    {
      label: "Returns pending",
      value: String(stats.returns),
      note: "Current RTO queue",
      icon: RotateCcw,
      tone: "red",
    },
    {
      label: "COD collected",
      value: formatAed(stats.codCollected),
      note: range.label,
      icon: WalletCards,
      tone: "purple",
    },
  ] as const;

  const maxMovement = Math.max(
    1,
    ...movement.map((item) => item.count),
  );

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="fade-up flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm font-semibold text-[#188459]">
            Operations overview
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            Good day, {name.split(" ")[0] || "Team"}
          </h1>
          <p className="mt-2 text-sm text-[#74827b]">
            Review live operations or compare performance across a selected date range.
          </p>
        </div>

        <div className="w-full max-w-3xl rounded-2xl border border-[#dfe7e3] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#405048]">
            <CalendarDays className="size-4 text-[#188459]" />
            {range.label}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {rangeLinks.map(([label, key]) => (
              <Link
                key={key}
                href={`/dashboard?range=${key}`}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  range.key === key
                    ? "bg-[#13734b] text-white"
                    : "bg-[#f3f6f4] text-[#586860] hover:bg-[#e9f0ec]"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          <form
            action="/dashboard"
            method="get"
            className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto]"
          >
            <input type="hidden" name="range" value="custom" />

            <span className="flex items-center text-xs font-bold text-[#68766f]">
              Custom
            </span>

            <input
              name="from"
              type="date"
              defaultValue={range.from}
              required
              className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs text-[#405048]"
            />

            <input
              name="to"
              type="date"
              defaultValue={range.to}
              required
              className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs text-[#405048]"
            />

            <button className="h-10 rounded-lg bg-[#376eb1] px-4 text-xs font-bold text-white">
              Apply
            </button>
          </form>
        </div>
      </div>

      <section className="fade-up-delay mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {statCards.map(({ label, value, note, icon: Icon, tone }) => (
          <article
            key={label}
            className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]"
          >
            <div
              className={`grid size-10 place-items-center rounded-xl ${toneClass[tone]}`}
            >
              <Icon className="size-5" />
            </div>
            <p className="mt-5 text-2xl font-bold tracking-tight text-[#17231e]">
              {value}
            </p>
            <p className="mt-1 text-sm font-semibold text-[#405048]">
              {label}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-[#8a9690]">
              {note}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.45fr_0.8fr]">
        <article className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-[#1d2d25]">
                Shipment movement
              </h2>
              <p className="mt-1 text-xs text-[#84918a]">
                {range.label}
              </p>
            </div>
            <span className="rounded-lg bg-[#edf5f1] px-3 py-1.5 text-xs font-semibold text-[#37604e]">
              {movement.reduce((sum, item) => sum + item.count, 0)} booked
            </span>
          </div>

          <div className="mt-8 flex h-56 items-end gap-2 overflow-x-auto border-b border-l border-[#e3eae6] px-4">
            {movement.map((item, index) => {
              const height =
                item.count === 0
                  ? 3
                  : Math.max(8, (item.count / maxMovement) * 100);

              return (
                <div
                  key={`${item.label}-${index}`}
                  className="flex h-full min-w-8 flex-1 items-end justify-center"
                  title={`${item.label}: ${item.count}`}
                >
                  <div
                    className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-[#81b79a] to-[#dcece3]"
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>

          <div
            className="mt-3 grid gap-1 text-center text-[10px] font-medium text-[#8a9690]"
            style={{
              gridTemplateColumns: `repeat(${Math.max(
                movement.length,
                1,
              )}, minmax(32px, 1fr))`,
            }}
          >
            {movement.map((item, index) => (
              <span key={`${item.label}-label-${index}`}>
                {item.label}
              </span>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-[#e0e8e4] bg-[#10291f] p-6 text-white shadow-[0_8px_30px_rgba(24,51,39,0.08)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#60c892]">
            V1 status
          </p>
          <h2 className="mt-3 text-xl font-bold">
            Core courier operations are live
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Booking, warehouse, dispatch, delivery attempts, returns and COD custody are active.
          </p>

          <div className="mt-6 space-y-4">
            {[
              ["AWB & booking", "Ready"],
              ["Warehouse & dispatch", "Ready"],
              ["Delivery & RTS", "Ready"],
              ["COD & finance", "In progress"],
            ].map(([label, status], index) => (
              <div key={label} className="flex items-center gap-3">
                <span
                  className={`grid size-7 place-items-center rounded-full text-xs font-bold ${
                    index < 3
                      ? "bg-[#2ca66e]"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="flex-1 text-sm text-white/75">
                  {label}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-white/35">
                  {status}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        <div className="flex items-center justify-between border-b border-[#e6ece9] px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-bold text-[#1d2d25]">
              Recent shipments
            </h2>
            <p className="mt-1 text-xs text-[#84918a]">
              Latest bookings within the selected period
            </p>
          </div>
          <Link
            href="/shipments"
            className="text-xs font-bold text-[#188459]"
          >
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="grid min-h-48 place-items-center px-6 py-10 text-center">
            <div>
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf5f1] text-[#188459]">
                <PackageCheck className="size-6" />
              </div>
              <p className="mt-4 font-semibold text-[#33433b]">
                No shipments in this period
              </p>
              <p className="mt-1 max-w-sm text-sm text-[#829089]">
                Change the date range or create a new shipment.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#edf1ef]">
            {recent.map((shipment) => (
              <Link
                key={shipment.id}
                href={`/shipments/${shipment.id}`}
                className="grid gap-2 px-5 py-4 transition hover:bg-[#fbfcfb] sm:grid-cols-[1fr_1fr_150px_120px] sm:items-center sm:px-6"
              >
                <div>
                  <p className="text-sm font-bold text-[#24362d]">
                    {shipment.tracking_number}
                  </p>
                  <p className="mt-1 text-xs text-[#87938d]">
                    {formatDubaiDate(shipment.booked_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#405048]">
                    {shipment.consignee_name}
                  </p>
                  <p className="mt-1 text-xs text-[#87938d]">
                    {shipment.consignee_city}
                  </p>
                </div>
                <p className="text-sm font-bold text-[#405048]">
                  {formatAed(shipment.cod_amount)}
                </p>
                <StatusBadge status={shipment.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
