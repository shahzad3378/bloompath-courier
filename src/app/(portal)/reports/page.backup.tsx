import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Boxes,
  Download,
  FileText,
  PackageCheck,
  RotateCcw,
  SlidersHorizontal,
  Truck,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { formatAed, formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reports" };

type RangeKey = "today" | "7d" | "30d" | "month" | "custom";

function dubaiDayStartUtc(date: Date) {
  const dubai = new Date(date.getTime() + 4 * 60 * 60 * 1000);

  return new Date(
    Date.UTC(
      dubai.getUTCFullYear(),
      dubai.getUTCMonth(),
      dubai.getUTCDate(),
    ) -
      4 * 60 * 60 * 1000,
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

function parseDubaiDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day) - 4 * 60 * 60 * 1000,
  );
}

function money(value: number) {
  return `AED ${Number(value || 0).toFixed(2)}`;
}

function agingDaysSince(value: string) {
  const start = new Date(value);
  const now = new Date();

  const startDubai = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  const nowDubai = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  const startDay = Date.UTC(
    startDubai.getUTCFullYear(),
    startDubai.getUTCMonth(),
    startDubai.getUTCDate(),
  );

  const nowDay = Date.UTC(
    nowDubai.getUTCFullYear(),
    nowDubai.getUTCMonth(),
    nowDubai.getUTCDate(),
  );

  return Math.max(
    0,
    Math.floor((nowDay - startDay) / 86400000),
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    shipper?: string;
    driver?: string;
    status?: string;
    report?: string;
  }>;
}) {
  const profile = await requireProfile(internalRoles);
  const params = await searchParams;

  const reportMode = params.report ?? "overview";

  const now = new Date();
  const todayStart = dubaiDayStartUtc(now);

  const requestedRange = params.range ?? "7d";
  const range: RangeKey = ["today", "7d", "30d", "month", "custom"].includes(
    requestedRange,
  )
    ? (requestedRange as RangeKey)
    : "7d";

  let start = addDays(todayStart, -6);
  let endExclusive = addDays(todayStart, 1);

  if (range === "today") {
    start = todayStart;
  } else if (range === "30d") {
    start = addDays(todayStart, -29);
  } else if (range === "month") {
    const dubai = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    start = new Date(
      Date.UTC(
        dubai.getUTCFullYear(),
        dubai.getUTCMonth(),
        1,
      ) -
        4 * 60 * 60 * 1000,
    );
  } else if (range === "custom") {
    const customFrom = parseDubaiDate(params.from);
    const customTo = parseDubaiDate(params.to);

    if (customFrom && customTo && customFrom <= customTo) {
      start = customFrom;
      endExclusive = addDays(customTo, 1);
    }
  }

  const startIso = start.toISOString();
  const endIso = endExclusive.toISOString();

  const supabase = await createClient();

  let shipmentQuery = supabase
    .from("shipments")
    .select(
      `
      id,
      tracking_number,
      reference_number,
      shipper_id,
      assigned_driver_id,
      consignee_name,
      consignee_city,
      payment_type,
      cod_amount,
      service_type,
      status,
      delivery_attempt_count,
      booked_at,
      delivered_at,
      created_at,
      shipper:profiles!shipments_shipper_id_fkey(full_name,email),
      driver:profiles!shipments_assigned_driver_id_fkey(full_name,email)
      `,
    )
    .is("deleted_at", null)
    .gte("booked_at", startIso)
    .lt("booked_at", endIso)
    .order("booked_at", { ascending: false });

  if (params.shipper) {
    shipmentQuery = shipmentQuery.eq("shipper_id", params.shipper);
  }

  if (params.driver) {
    shipmentQuery = shipmentQuery.eq("assigned_driver_id", params.driver);
  }

  if (params.status) {
    shipmentQuery = shipmentQuery.eq("status", params.status);
  }

  const [
    { data: shipmentData, error: shipmentError },
    { data: shippers },
    { data: drivers },
    { data: ledgerData },
    { data: settlementData },
  ] = await Promise.all([
    shipmentQuery,

    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("organization_id", profile.organization_id)
      .eq("role", "shipper")
      .eq("status", "active")
      .order("full_name"),

    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("organization_id", profile.organization_id)
      .eq("role", "driver")
      .eq("status", "active")
      .order("full_name"),

    supabase
      .from("finance_ledger")
      .select(
        "id, shipment_id, shipper_id, tracking_number, cod_amount, delivery_charge, return_charge, total_charges, net_payable, transaction_type, transaction_at",
      )
      .gte("transaction_at", startIso)
      .lt("transaction_at", endIso),

    supabase
      .from("settlements")
      .select("id, shipper_id, status, net_payable, paid_at, created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso),
  ]);

  const shipments = (shipmentData ?? []) as any[];

  const latestUndeliveredByShipment = new Map<number, string>();

  if (shipments.length > 0) {
    const { data: undeliveredAttempts } = await supabase
      .from("delivery_attempts")
      .select("shipment_id, created_at")
      .in(
        "shipment_id",
        shipments.map((row) => Number(row.id)),
      )
      .eq("outcome", "undelivered")
      .order("created_at", { ascending: false });

    for (const attempt of undeliveredAttempts ?? []) {
      const shipmentId = Number(attempt.shipment_id);

      if (
        !latestUndeliveredByShipment.has(shipmentId) &&
        attempt.created_at
      ) {
        latestUndeliveredByShipment.set(
          shipmentId,
          attempt.created_at,
        );
      }
    }
  }

  const reportShipments = shipments.map((row) => {
    const lastUndeliveredAt =
      latestUndeliveredByShipment.get(Number(row.id)) ?? null;

    const agingClosed =
      row.status === "delivered" ||
      row.status === "returned_to_shipper" ||
      row.status === "cancelled";

    return {
      ...row,
      last_undelivered_at: lastUndeliveredAt,
      aging_days:
        lastUndeliveredAt && !agingClosed
          ? agingDaysSince(lastUndeliveredAt)
          : null,
    };
  });

  const ledgerRows = (ledgerData ?? []) as any[];
  const settlements = (settlementData ?? []) as any[];

  const booked = shipments.length;
  const delivered = shipments.filter((row) => row.status === "delivered").length;
  const undelivered = shipments.filter((row) => row.status === "undelivered").length;
  const outForDelivery = shipments.filter(
    (row) => row.status === "out_for_delivery",
  ).length;
  const returns = shipments.filter(
    (row) =>
      row.status === "return_initiated" ||
      row.status === "returned_to_shipper",
  ).length;

  const totalCod = ledgerRows.reduce(
    (sum, row) => sum + Number(row.cod_amount || 0),
    0,
  );

  const totalCharges = ledgerRows.reduce(
    (sum, row) => sum + Number(row.total_charges || 0),
    0,
  );

  const totalNetPayable = ledgerRows.reduce(
    (sum, row) => sum + Number(row.net_payable || 0),
    0,
  );

  const totalPaid = settlements
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + Number(row.net_payable || 0), 0);

  const shipperMap = new Map<
    string,
    {
      name: string;
      awbs: number;
      delivered: number;
      cod: number;
      charges: number;
      net: number;
    }
  >();

  for (const row of shipments) {
    if (!row.shipper_id) continue;

    const current = shipperMap.get(row.shipper_id) ?? {
      name: row.shipper?.full_name ?? row.shipper?.email ?? "Shipper",
      awbs: 0,
      delivered: 0,
      cod: 0,
      charges: 0,
      net: 0,
    };

    current.awbs += 1;
    if (row.status === "delivered") current.delivered += 1;

    shipperMap.set(row.shipper_id, current);
  }

  for (const row of ledgerRows) {
    const current = shipperMap.get(row.shipper_id);

    if (!current) continue;

    current.cod += Number(row.cod_amount || 0);
    current.charges += Number(row.total_charges || 0);
    current.net += Number(row.net_payable || 0);
  }

  const driverMap = new Map<
    string,
    {
      name: string;
      assigned: number;
      delivered: number;
      undelivered: number;
    }
  >();

  for (const row of shipments) {
    if (!row.assigned_driver_id) continue;

    const current = driverMap.get(row.assigned_driver_id) ?? {
      name: row.driver?.full_name ?? row.driver?.email ?? "Driver",
      assigned: 0,
      delivered: 0,
      undelivered: 0,
    };

    current.assigned += 1;
    if (row.status === "delivered") current.delivered += 1;
    if (row.status === "undelivered") current.undelivered += 1;

    driverMap.set(row.assigned_driver_id, current);
  }

  const deliveryRate =
    booked > 0 ? Math.round((delivered / booked) * 100) : 0;

  const exportParams = new URLSearchParams();

  exportParams.set("range", range);

  if (params.from) exportParams.set("from", params.from);
  if (params.to) exportParams.set("to", params.to);
  if (params.shipper) exportParams.set("shipper", params.shipper);
  if (params.driver) exportParams.set("driver", params.driver);
  if (params.status) exportParams.set("status", params.status);
  if (params.report) exportParams.set("report", params.report);

  const exportHref = `/reports/export?${exportParams.toString()}`;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm font-semibold text-[#188459]">
            Analytics & exports
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            {reportMode === "delivery"
              ? "Delivery Reports"
              : reportMode === "drivers"
                ? "Driver Reports"
                : reportMode === "warehouse"
                  ? "Warehouse Reports"
                  : reportMode === "returns"
                    ? "Returns / RTO Reports"
                    : reportMode === "finance"
                      ? "COD & Finance Reports"
                      : reportMode === "shipments"
                        ? "Shipment Reports"
                        : "Reports"}
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            {reportMode === "delivery"
              ? "Delivered, undelivered, delivery attempts and aging performance."
              : reportMode === "drivers"
                ? "Driver assignments, delivery results and field performance."
                : reportMode === "warehouse"
                  ? "Warehouse received shipments and operational inventory flow."
                  : reportMode === "returns"
                    ? "Return initiated, RTO and returned-to-shipper performance."
                    : reportMode === "finance"
                      ? "COD value, courier charges, settlements and net payable."
                      : reportMode === "shipments"
                        ? "AWB bookings, shipment status and operational activity."
                        : "Operational, shipper, driver and AWB-level reporting."}
          </p>
        </div>

        <form
          action="/reports"
          method="get"
          className="grid w-full gap-2 rounded-2xl border border-[#dfe7e3] bg-white p-3 shadow-sm md:grid-cols-3 xl:max-w-[1050px] xl:grid-cols-7"
        >
          {reportMode !== "overview" ? (
            <input type="hidden" name="report" value={reportMode} />
          ) : null}
          <select
            name="range"
            defaultValue={range}
            className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs font-semibold"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="month">This Month</option>
            <option value="custom">Custom</option>
          </select>

          <input
            name="from"
            type="date"
            defaultValue={params.from ?? ""}
            className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs"
          />

          <input
            name="to"
            type="date"
            defaultValue={params.to ?? ""}
            className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs"
          />

          <select
            name="shipper"
            defaultValue={params.shipper ?? ""}
            className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs font-semibold"
          >
            <option value="">All shippers</option>
            {(shippers ?? []).map((shipper) => (
              <option key={shipper.id} value={shipper.id}>
                {shipper.full_name || shipper.email}
              </option>
            ))}
          </select>

          <select
            name="driver"
            defaultValue={params.driver ?? ""}
            className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs font-semibold"
          >
            <option value="">All drivers</option>
            {(drivers ?? []).map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.full_name || driver.email}
              </option>
            ))}
          </select>

          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs font-semibold"
          >
            <option value="">All statuses</option>
            <option value="booked">Booked</option>
            <option value="ready_for_pickup">Ready for pickup</option>
            <option value="picked_up">Picked up</option>
            <option value="at_warehouse">At warehouse</option>
            <option value="out_for_delivery">Out for delivery</option>
            <option value="delivered">Delivered</option>
            <option value="undelivered">Undelivered</option>
            <option value="return_initiated">Return initiated</option>
            <option value="returned_to_shipper">Returned to shipper</option>
          </select>

          <button className="h-10 rounded-lg bg-[#13734b] px-4 text-xs font-bold text-white">
            Apply filters
          </button>
        </form>
      </div>

      <section className="mt-7">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[#26372f]">
              Report Center
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Quick access to operational, delivery, finance and custom reporting.
            </p>
          </div>

          <Link
            href="/reports/custom"
            className="hidden items-center gap-2 text-xs font-bold text-[#13734b] hover:underline sm:inline-flex"
          >
            <SlidersHorizontal className="size-4" />
            Custom Reports
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Shipment Reports",
              description: "AWB bookings, status and shipment activity.",
              icon: PackageCheck,
              href: "/reports?report=shipments",
            },
            {
              title: "Delivery Reports",
              description: "Delivered, undelivered and attempt performance.",
              icon: Truck,
              href: "/reports?report=delivery",
            },
            {
              title: "Driver Reports",
              description: "Driver assignments and delivery results.",
              icon: UserRoundCheck,
              href: "/reports?report=drivers#driver-performance",
            },
            {
              title: "Warehouse Reports",
              description: "Warehouse received and operational shipment flow.",
              icon: Boxes,
              href: "/reports?report=warehouse",
            },
            {
              title: "Returns / RTO",
              description: "Return initiated and returned shipment reporting.",
              icon: RotateCcw,
              href: "/reports?report=returns",
            },
            {
              title: "COD & Finance",
              description: "COD value, courier charges and net payable.",
              icon: WalletCards,
              href: "/reports?report=finance#awb-detail",
            },
            {
              title: "Settlement Reports",
              description: "Shipper settlement and payout reporting.",
              icon: BadgeDollarSign,
              href: "/finance",
            },
            {
              title: "Custom Reports",
              description: "Build and save your own reusable reports.",
              icon: SlidersHorizontal,
              href: "/reports/custom",
            },
          ].map((report) => {
            const ReportIcon = report.icon;

            return (
              <Link
                key={report.title}
                href={report.href}
                className="group rounded-2xl border border-[#e0e8e4] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#b9d8c9] hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-[#edf8f2] text-[#13734b] transition group-hover:bg-[#13734b] group-hover:text-white">
                    <ReportIcon className="size-5" />
                  </div>

                  <ArrowUpRight className="size-4 text-[#a4afa9] transition group-hover:text-[#13734b]" />
                </div>

                <h3 className="mt-4 text-sm font-black text-[#26372f]">
                  {report.title}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-[#87938d]">
                  {report.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {[
          ["Booked", String(booked), PackageCheck],
          ["Out for delivery", String(outForDelivery), Truck],
          ["Delivered", String(delivered), ArrowUpRight],
          ["Undelivered", String(undelivered), ArrowDownRight],
          ["Returns", String(returns), RotateCcw],
          ["Delivery rate", `${deliveryRate}%`, FileText],
          ["COD", money(totalCod), WalletCards],
          ["Courier charges", money(totalCharges), BadgeDollarSign],
        ].map(([label, value, Icon]) => {
          const CardIcon = Icon as typeof PackageCheck;

          return (
            <div
              key={String(label)}
              className="rounded-2xl border border-[#e0e8e4] bg-white p-4"
            >
              <CardIcon className="size-4 text-[#13734b]" />
              <p className="mt-3 text-xl font-black text-[#26372f]">
                {String(value)}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                {String(label)}
              </p>
            </div>
          );
        })}
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
          <div className="border-b border-[#e8eeeb] px-5 py-4">
            <h2 className="font-bold text-[#26372f]">
              Shipper performance
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              AWBs, delivery performance and financial value by seller.
            </p>
          </div>

          {[...shipperMap.values()].length === 0 ? (
            <p className="p-8 text-center text-sm text-[#87938d]">
              No shipper activity in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-[#f8faf9] text-[11px] uppercase tracking-wide text-[#77847e]">
                  <tr>
                    <th className="px-4 py-3">Shipper</th>
                    <th className="px-4 py-3">AWBs</th>
                    <th className="px-4 py-3">Delivered</th>
                    <th className="px-4 py-3">COD</th>
                    <th className="px-4 py-3">Charges</th>
                    <th className="px-4 py-3">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ef]">
                  {[...shipperMap.values()].map((row) => (
                    <tr key={row.name}>
                      <td className="px-4 py-3 font-bold">{row.name}</td>
                      <td className="px-4 py-3">{row.awbs}</td>
                      <td className="px-4 py-3">{row.delivered}</td>
                      <td className="px-4 py-3">{money(row.cod)}</td>
                      <td className="px-4 py-3">{money(row.charges)}</td>
                      <td className="px-4 py-3 font-black text-[#13734b]">
                        {money(row.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
          <div className="border-b border-[#e8eeeb] px-5 py-4">
            <h2 className="font-bold text-[#26372f]">
              Driver performance
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Assigned shipments and delivery results by driver.
            </p>
          </div>

          {[...driverMap.values()].length === 0 ? (
            <p className="p-8 text-center text-sm text-[#87938d]">
              No driver activity in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-[#f8faf9] text-[11px] uppercase tracking-wide text-[#77847e]">
                  <tr>
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Assigned</th>
                    <th className="px-4 py-3">Delivered</th>
                    <th className="px-4 py-3">Undelivered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ef]">
                  {[...driverMap.values()].map((row) => (
                    <tr key={row.name}>
                      <td className="px-4 py-3 font-bold">{row.name}</td>
                      <td className="px-4 py-3">{row.assigned}</td>
                      <td className="px-4 py-3 text-[#13734b]">
                        {row.delivered}
                      </td>
                      <td className="px-4 py-3 text-[#b76223]">
                        {row.undelivered}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
        <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
          <div>
            <h2 className="font-bold text-[#26372f]">
              AWB detail report
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Row-level shipment detail for the selected period.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-bold text-[#13734b]">
                Net payable {money(totalNetPayable)}
              </p>
              <p className="mt-1 text-[10px] text-[#87938d]">
                Paid {money(totalPaid)}
              </p>
            </div>

            <Link
              href={exportHref}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#bdd9ca] bg-white px-4 text-xs font-bold text-[#13734b] transition hover:bg-[#edf7f2]"
            >
              <Download className="size-4" />
              Export CSV
            </Link>
          </div>
        </div>

        {shipmentError ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            Report data could not be loaded.
          </p>
        ) : reportShipments.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#87938d]">
            No AWBs found for this report.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1360px] text-left text-sm">
              <thead className="bg-[#f8faf9] text-[11px] uppercase tracking-wide text-[#77847e]">
                <tr>
                  <th className="px-4 py-3">AWB</th>
                  <th className="px-4 py-3">Booked</th>
                  <th className="px-4 py-3">Shipper</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Consignee</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Attempt</th>
                  <th className="px-4 py-3">Aging</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">COD</th>
                  <th className="px-4 py-3">Service</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {reportShipments.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-mono font-black text-[#13734b]">
                      {row.tracking_number}
                    </td>
                    <td className="px-4 py-3">
                      {formatDubaiDate(row.booked_at)}
                    </td>
                    <td className="px-4 py-3">
                      {row.shipper?.full_name ||
                        row.shipper?.email ||
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.driver?.full_name ||
                        row.driver?.email ||
                        "—"}
                    </td>
                    <td className="px-4 py-3">{row.consignee_name}</td>
                    <td className="px-4 py-3">{row.consignee_city}</td>
                    <td className="px-4 py-3 capitalize">
                      {row.status.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3">
                      {row.delivery_attempt_count}
                    </td>

                    <td className="px-4 py-3">
                      {row.aging_days === null ? (
                        <span className="text-[#87938d]">—</span>
                      ) : (
                        <span
                          title={
                            row.last_undelivered_at
                              ? `Last undelivered: ${formatDubaiDate(
                                  row.last_undelivered_at,
                                )}`
                              : undefined
                          }
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                            row.aging_days >= 8
                              ? "bg-[#fff0f0] text-[#b74646]"
                              : row.aging_days >= 4
                                ? "bg-[#fff3df] text-[#a66516]"
                                : row.aging_days >= 2
                                  ? "bg-[#fff9e8] text-[#8a6a1c]"
                                  : "bg-[#edf8f2] text-[#176a47]"
                          }`}
                        >
                          {row.aging_days}{" "}
                          {row.aging_days === 1 ? "Day" : "Days"}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 uppercase">
                      {row.payment_type}
                    </td>
                    <td className="px-4 py-3">
                      {formatAed(row.cod_amount)}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {row.service_type.replaceAll("_", " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
