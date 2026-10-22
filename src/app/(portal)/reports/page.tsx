import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportDateFields } from "@/components/report-date-fields";
import { RefreshStatusButton } from "./bloompath-fastdrop/refresh-status-button";
import { resolveReportDateRange } from "@/lib/report-date-range";
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
    error?: string;
  }>;
}) {
  const profile = await requireProfile(
    internalRoles,
  );

  const params = await searchParams;
  const pagination = parseTablePagination(params);

  const { range, start, endExclusive, error: rangeError } = resolveReportDateRange(params);
  if (rangeError) redirect("/reports?range=7d&error=invalid_dates");

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
      customer_tracking_status,
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
    shipmentData ?? [];

  const gtaStatusByShipment = new Map<number, string>();
  if (shipments.length) {
    const { data: partnerLinks } = await supabase
      .from("third_party_shipment_links")
      .select("shipment_id, partner_status, third_party_carriers!inner(code)")
      .eq("organization_id", profile.organization_id!)
      .eq("third_party_carriers.code", "GTA_AIRSKIP")
      .in("shipment_id", shipments.map((row) => Number(row.id)));
    for (const link of partnerLinks ?? []) {
      if (link.partner_status) gtaStatusByShipment.set(Number(link.shipment_id), link.partner_status);
    }
  }

  // Summary cards cover the entire selected period, not just the visible table page.
  let summaryQuery = supabase.from("shipments")
    .select("status, customer_tracking_status, cod_amount")
    .eq("organization_id", profile.organization_id!)
    .is("deleted_at", null)
    .gte("booked_at", startIso)
    .lt("booked_at", endIso)
    .order("id", { ascending: true });
  if (params.shipper) summaryQuery = summaryQuery.eq("shipper_id", params.shipper);
  if (params.driver) summaryQuery = summaryQuery.eq("assigned_driver_id", params.driver);
  if (params.status) summaryQuery = summaryQuery.eq("status", params.status);
  const summaryRows: { status: string; customer_tracking_status: string | null; cod_amount: number | null }[] = [];
  let summaryError = false;
  for (let offset = 0; offset < (count ?? 0); offset += 1000) {
    const { data: batch, error: batchError } = await summaryQuery.range(offset, offset + 999);
    if (batchError) { summaryError = true; break; }
    summaryRows.push(...(batch ?? []));
    if ((batch ?? []).length < 1000) break;
  }

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
        report_status: row.customer_tracking_status ?? row.status,
        three_pl_status: gtaStatusByShipment.get(Number(row.id)) ?? "—",
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

  const booked = summaryRows.length;

  const delivered = summaryRows.filter(
    (row) =>
      (row.customer_tracking_status ?? row.status) === "delivered",
  ).length;

  const outForDelivery =
    summaryRows.filter(
      (row) =>
        (row.customer_tracking_status ?? row.status) ===
        "out_for_delivery",
    ).length;

  const undelivered =
    summaryRows.filter(
      (row) =>
        (row.customer_tracking_status ?? row.status) === "undelivered",
    ).length;

  const returns = summaryRows.filter(
    (row) =>
      (row.customer_tracking_status ?? row.status) ===
        "return_initiated" ||
      (row.customer_tracking_status ?? row.status) ===
        "returned_to_shipper",
  ).length;

  const deliveryRate =
    booked > 0
      ? Math.round(
          (delivered / booked) * 100,
        )
      : 0;

  const totalCod = summaryRows.reduce(
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
          <RefreshStatusButton range={range} from={params.from ?? ""} to={params.to ?? ""} page={pagination.page} pageSize={pagination.pageSize} />
          <Link href="/reports/bloompath-fastdrop" className="bp-button-secondary">
            BloomPath FastDrop
          </Link>

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

      {params.error === "invalid_dates" ? <p role="alert" className="mt-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">Select both calendar dates, with From on or before To.</p> : null}
      {summaryError ? <p role="alert" className="mt-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">Report totals could not be loaded.</p> : null}

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
        <ReportDateFields range={range} from={params.from ?? ""} to={params.to ?? ""} />

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
            {(count ?? 0).toLocaleString()} AWBs
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
                    3PL Status
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
                      {row.shipper?.[0]
                        ?.full_name ||
                        row.shipper?.[0]
                          ?.email ||
                        "—"}
                    </td>

                    <td className="px-4 py-4">
                      {row.driver?.[0]
                        ?.full_name ||
                        row.driver?.[0]
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
                        row.report_status,
                      ).replaceAll(
                        "_",
                        " ",
                      )}
                    </td>

                    <td className="px-4 py-4 capitalize">
                      {row.three_pl_status}
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
