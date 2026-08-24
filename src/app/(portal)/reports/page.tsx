import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileText,
  PackageCheck,
  RotateCcw,
  Truck,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { SelectableTable } from "@/components/selectable-table";
import { internalRoles } from "@/lib/roles";
import { formatMoney } from "@/lib/currency";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";
import {
  parseTablePagination,
  type TableSearchParams,
} from "@/lib/table-pagination";

export const metadata = {
  title: "Delivery Reports",
};

type RangeKey =
  | "today"
  | "7d"
  | "30d"
  | "month"
  | "custom";

function dubaiDayStartUtc(date: Date) {
  const dubai = new Date(
    date.getTime() + 4 * 60 * 60 * 1000,
  );

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
  return new Date(
    date.getTime() + days * 86400000,
  );
}

function parseDubaiDate(value?: string) {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return null;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
    ) -
      4 * 60 * 60 * 1000,
  );
}

function agingDaysSince(value: string) {
  const start = new Date(value);
  const now = new Date();

  const startDubai = new Date(
    start.getTime() + 4 * 60 * 60 * 1000,
  );

  const nowDubai = new Date(
    now.getTime() + 4 * 60 * 60 * 1000,
  );

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
    Math.floor(
      (nowDay - startDay) / 86400000,
    ),
  );
}

export default async function DeliveryReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    shipper?: string;
    driver?: string;
    status?: string;
    page?: string;
    page_size?: string;
  }>;
}) {
  const profile = await requireProfile(
    internalRoles,
  );

  const params = await searchParams;
  const pagination = parseTablePagination(params);

  const now = new Date();
  const todayStart = dubaiDayStartUtc(now);

  const requestedRange =
    params.range ?? "7d";

  const range: RangeKey = [
    "today",
    "7d",
    "30d",
    "month",
    "custom",
  ].includes(requestedRange)
    ? (requestedRange as RangeKey)
    : "7d";

  let start = addDays(todayStart, -6);
  let endExclusive = addDays(
    todayStart,
    1,
  );

  if (range === "today") {
    start = todayStart;
  } else if (range === "30d") {
    start = addDays(todayStart, -29);
  } else if (range === "month") {
    const dubai = new Date(
      now.getTime() +
        4 * 60 * 60 * 1000,
    );

    start = new Date(
      Date.UTC(
        dubai.getUTCFullYear(),
        dubai.getUTCMonth(),
        1,
      ) -
        4 * 60 * 60 * 1000,
    );
  } else if (range === "custom") {
    const customFrom = parseDubaiDate(
      params.from,
    );

    const customTo = parseDubaiDate(
      params.to,
    );

    if (
      customFrom &&
      customTo &&
      customFrom <= customTo
    ) {
      start = customFrom;
      endExclusive = addDays(
        customTo,
        1,
      );
    }
  }

  const startIso = start.toISOString();
  const endIso =
    endExclusive.toISOString();

  const supabase = await createClient();

  let shipmentQuery = supabase
    .from("shipments")
    .select(`
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
      shipper:profiles!shipments_shipper_id_fkey(
        full_name,
        email
      ),
      driver:profiles!shipments_assigned_driver_id_fkey(
        full_name,
        email
      )
    `, { count: "exact" })
    .eq("organization_id", profile.organization_id!)
    .is("deleted_at", null)
    .gte("booked_at", startIso)
    .lt("booked_at", endIso)
    .order("booked_at", {
      ascending: false,
    });

  if (params.shipper) {
    shipmentQuery =
      shipmentQuery.eq(
        "shipper_id",
        params.shipper,
      );
  }

  if (params.driver) {
    shipmentQuery =
      shipmentQuery.eq(
        "assigned_driver_id",
        params.driver,
      );
  }

  if (params.status) {
    shipmentQuery =
      shipmentQuery.eq(
        "status",
        params.status,
      );
  }

  const [
    { data: shipmentData, error, count },
    { data: shippers },
    { data: drivers },
    currency,
  ] = await Promise.all([
    shipmentQuery.range(pagination.from, pagination.to),

    supabase
      .from("profiles")
      .select(
        "id, full_name, email",
      )
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq("role", "shipper")
      .eq("status", "active")
      .order("full_name"),

    supabase
      .from("profiles")
      .select(
        "id, full_name, email",
      )
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq("role", "driver")
      .eq("status", "active")
      .order("full_name"),
    resolveOrganizationCurrency(supabase, profile.organization_id!),
  ]);

  const shipments =
    (shipmentData ?? []) as any[];

  const latestUndelivered =
    new Map<number, string>();

  if (shipments.length > 0) {
    const { data: attempts } =
      await supabase
        .from("delivery_attempts")
        .select(
          "shipment_id, created_at",
        )
        .in(
          "shipment_id",
          shipments.map((row) =>
            Number(row.id),
          ),
        )
        .eq(
          "outcome",
          "undelivered",
        )
        .order("created_at", {
          ascending: false,
        });

    for (const attempt of
      attempts ?? []) {
      const shipmentId = Number(
        attempt.shipment_id,
      );

      if (
        !latestUndelivered.has(
          shipmentId,
        ) &&
        attempt.created_at
      ) {
        latestUndelivered.set(
          shipmentId,
          attempt.created_at,
        );
      }
    }
  }

  const rows = shipments.map(
    (row) => {
      const lastUndeliveredAt =
        latestUndelivered.get(
          Number(row.id),
        ) ?? null;

      const closed =
        row.status === "delivered" ||
        row.status ===
          "returned_to_shipper" ||
        row.status === "cancelled";

      return {
        ...row,
        last_undelivered_at:
          lastUndeliveredAt,
        aging_days:
          lastUndeliveredAt &&
          !closed
            ? agingDaysSince(
                lastUndeliveredAt,
              )
            : null,
      };
    },
  );

  const booked = rows.length;

  const delivered = rows.filter(
    (row) =>
      row.status === "delivered",
  ).length;

  const outForDelivery =
    rows.filter(
      (row) =>
        row.status ===
        "out_for_delivery",
    ).length;

  const undelivered =
    rows.filter(
      (row) =>
        row.status === "undelivered",
    ).length;

  const returns = rows.filter(
    (row) =>
      row.status ===
        "return_initiated" ||
      row.status ===
        "returned_to_shipper",
  ).length;

  const deliveryRate =
    booked > 0
      ? Math.round(
          (delivered / booked) * 100,
        )
      : 0;

  const totalCod = rows.reduce(
    (sum, row) =>
      sum +
      Number(row.cod_amount || 0),
    0,
  );

  const exportParams =
    new URLSearchParams();

  exportParams.set("range", range);

  if (params.from) {
    exportParams.set(
      "from",
      params.from,
    );
  }

  if (params.to) {
    exportParams.set(
      "to",
      params.to,
    );
  }

  if (params.shipper) {
    exportParams.set(
      "shipper",
      params.shipper,
    );
  }

  if (params.driver) {
    exportParams.set(
      "driver",
      params.driver,
    );
  }

  if (params.status) {
    exportParams.set(
      "status",
      params.status,
    );
  }

  const exportHref =
    `/reports/export?${exportParams.toString()}`;

  return (
    <div className="bp-page">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="bp-section-label">
            Reports
          </p>

          <h1 className="bp-heading mt-1 text-3xl font-black">
            Delivery Reports
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Delivery performance,
            undelivered aging and
            AWB-level operational detail.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={exportHref}
            className="bp-button-secondary"
          >
            <Download className="size-4" />
            CSV
          </Link>

          <Link
            href={`/reports/export-xlsx?${exportParams.toString()}`}
            className="bp-button-secondary"
          >
            <Download className="size-4" />
            Excel
          </Link>

          <Link
            href={`/reports/export-pdf?${exportParams.toString()}`}
            className="bp-button-secondary"
          >
            <FileText className="size-4" />
            PDF
          </Link>
        </div>
      </div>

      <form
        action="/reports"
        method="get"
        className="bp-panel mt-6 grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-7"
      >
        <input
          type="hidden"
          name="page_size"
          value={pagination.pageSize}
        />
        <select
          name="range"
          defaultValue={range}
          className="bp-input text-xs font-semibold"
        >
          <option value="today">
            Today
          </option>
          <option value="7d">
            Last 7 Days
          </option>
          <option value="30d">
            Last 30 Days
          </option>
          <option value="month">
            This Month
          </option>
          <option value="custom">
            Custom
          </option>
        </select>

        <input
          name="from"
          type="date"
          defaultValue={
            params.from ?? ""
          }
          className="bp-input text-xs"
        />

        <input
          name="to"
          type="date"
          defaultValue={
            params.to ?? ""
          }
          className="bp-input text-xs"
        />

        <select
          name="shipper"
          defaultValue={
            params.shipper ?? ""
          }
          className="bp-input text-xs font-semibold"
        >
          <option value="">
            All shippers
          </option>

          {(shippers ?? []).map(
            (shipper) => (
              <option
                key={shipper.id}
                value={shipper.id}
              >
                {shipper.full_name ||
                  shipper.email}
              </option>
            ),
          )}
        </select>

        <select
          name="driver"
          defaultValue={
            params.driver ?? ""
          }
          className="bp-input text-xs font-semibold"
        >
          <option value="">
            All riders
          </option>

          {(drivers ?? []).map(
            (driver) => (
              <option
                key={driver.id}
                value={driver.id}
              >
                {driver.full_name ||
                  driver.email}
              </option>
            ),
          )}
        </select>

        <select
          name="status"
          defaultValue={
            params.status ?? ""
          }
          className="bp-input text-xs font-semibold"
        >
          <option value="">
            All statuses
          </option>
          <option value="booked">
            Booked
          </option>
          <option value="at_warehouse">
            At Warehouse
          </option>
          <option value="out_for_delivery">
            Out for Delivery
          </option>
          <option value="delivered">
            Delivered
          </option>
          <option value="undelivered">
            Undelivered
          </option>
          <option value="return_initiated">
            Return Initiated
          </option>
          <option value="returned_to_shipper">
            Returned to Shipper
          </option>
        </select>

        <button className="bp-button-primary">
          Apply Filters
        </button>
      </form>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          [
            "Booked",
            booked,
            PackageCheck,
          ],
          [
            "Out for Delivery",
            outForDelivery,
            Truck,
          ],
          [
            "Delivered",
            delivered,
            ArrowUpRight,
          ],
          [
            "Undelivered",
            undelivered,
            ArrowDownRight,
          ],
          [
            "Returns / RTO",
            returns,
            RotateCcw,
          ],
        ].map(
          ([label, value, Icon]) => {
            const CardIcon =
              Icon as typeof Truck;

            return (
              <div
                key={String(label)}
                className="bp-card p-4"
              >
                <CardIcon className="size-4 text-[#15905c]" />

                <p className="mt-3 text-xl font-black text-[#26372f]">
                  {Number(
                    value,
                  ).toLocaleString()}
                </p>

                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                  {String(label)}
                </p>
              </div>
            );
          },
        )}

        <div className="bp-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Delivery Rate
          </p>

          <p className="mt-3 text-2xl font-black text-[#15905c]">
            {deliveryRate}%
          </p>

          <p className="mt-1 text-[10px] text-[#87938d]">
            COD {formatMoney(totalCod, currency)}
          </p>
        </div>
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header flex items-center justify-between">
          <div>
            <h2 className="font-black text-[#26372f]">
              AWB Delivery Detail
            </h2>

            <p className="mt-1 text-xs text-[#87938d]">
              Shipment status, attempts
              and undelivered aging.
            </p>
          </div>

          <p className="text-xs font-bold text-[#15905c]">
            {rows.length} AWBs
          </p>
        </div>

        <DataTableToolbar
          pathname="/reports"
          params={params as TableSearchParams}
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={count ?? 0}
          showDates={false}
        />

        {error ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            Delivery report could not
            be loaded.
          </p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No shipments found for
            these filters.
          </p>
        ) : (
          <SelectableTable visibleCount={rows.length}>
            <table className="w-full min-w-[1250px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-4 py-3">
                    Select
                  </th>
                  <th className="px-4 py-3">
                    AWB
                  </th>
                  <th className="px-4 py-3">
                    Booked
                  </th>
                  <th className="px-4 py-3">
                    Shipper
                  </th>
                  <th className="px-4 py-3">
                    Rider
                  </th>
                  <th className="px-4 py-3">
                    Consignee
                  </th>
                  <th className="px-4 py-3">
                    City
                  </th>
                  <th className="px-4 py-3">
                    Status
                  </th>
                  <th className="px-4 py-3">
                    Attempts
                  </th>
                  <th className="px-4 py-3">
                    Aging
                  </th>
                  <th className="px-4 py-3">
                    COD
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="bp-table-row"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        data-table-row-select
                        aria-label={`Select ${row.tracking_number}`}
                        className="size-4 accent-[#13734b]"
                      />
                    </td>
                    <td className="px-4 py-4 font-mono text-xs font-black text-[#15905c]">
                      {row.tracking_number}
                    </td>

                    <td className="px-4 py-4 text-xs">
                      {formatDubaiDate(
                        row.booked_at,
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {row.shipper
                        ?.full_name ||
                        row.shipper
                          ?.email ||
                        "—"}
                    </td>

                    <td className="px-4 py-4">
                      {row.driver
                        ?.full_name ||
                        row.driver
                          ?.email ||
                        "—"}
                    </td>

                    <td className="px-4 py-4 font-semibold">
                      {
                        row.consignee_name
                      }
                    </td>

                    <td className="px-4 py-4">
                      {
                        row.consignee_city
                      }
                    </td>

                    <td className="px-4 py-4 capitalize">
                      {String(
                        row.status,
                      ).replaceAll(
                        "_",
                        " ",
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {
                        row.delivery_attempt_count
                      }
                    </td>

                    <td className="px-4 py-4">
                      {row.aging_days ===
                      null ? (
                        <span className="text-[#9aa49f]">
                          —
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                            row.aging_days >=
                            8
                              ? "bg-[#fff0f0] text-[#b74646]"
                              : row.aging_days >=
                                  4
                                ? "bg-[#fff3df] text-[#a66516]"
                                : "bg-[#edf8f2] text-[#176a47]"
                          }`}
                        >
                          {
                            row.aging_days
                          }{" "}
                          Days
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4 font-bold">
                      {formatMoney(
                        row.cod_amount,
                        currency,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SelectableTable>
        )}
      </section>
    </div>
  );
}
