import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileText,
} from "lucide-react";
import { notFound } from "next/navigation";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { SelectableTable } from "@/components/selectable-table";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { formatMoney, rowCurrency } from "@/lib/currency";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";
import {
  parseTablePagination,
  type TableSearchParams,
} from "@/lib/table-pagination";

export const metadata = {
  title: "Run Custom Report",
};

const columnLabels: Record<string, string> = {
  tracking_number: "AWB / Tracking No.",
  reference_number: "Reference No.",
  booked_at: "Booked Date",
  shipper: "Shipper",
  driver: "Driver",
  consignee_name: "Consignee",
  consignee_phone: "Consignee Phone",
  consignee_city: "City",
  status: "Status",
  delivery_attempt_count: "Attempt Count",
  last_undelivered_reason: "Undelivered Reason",
  payment_type: "Payment Type",
  cod_amount: "COD Amount",
  delivery_charge: "Delivery Charge",
  return_charge: "Return Charge",
  total_charges: "Total Charges",
  net_payable: "Net Payable",
  service_type: "Service Type",
  delivered_at: "Delivered Date",
};

function parseDateStart(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day) - 4 * 60 * 60 * 1000,
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

function renderValue(column: string, row: any, organizationCurrency: string) {
  if (column === "shipper") {
    return (
      row.shipper?.full_name ||
      row.shipper?.email ||
      "—"
    );
  }

  if (column === "driver") {
    return (
      row.driver?.full_name ||
      row.driver?.email ||
      "—"
    );
  }

  if (column === "currency") {
    return rowCurrency(row.currency, organizationCurrency);
  }

  if (["booked_at", "delivered_at"].includes(column)) {
    return row[column]
      ? formatDubaiDate(row[column])
      : "—";
  }

  if (
    [
      "cod_amount",
      "delivery_charge",
      "return_charge",
      "total_charges",
      "net_payable",
    ].includes(column)
  ) {
    return formatMoney(
      Number(row[column] || 0),
      rowCurrency(row.currency, organizationCurrency),
    );
  }

  if (
    column === "status" ||
    column === "payment_type" ||
    column === "service_type"
  ) {
    return String(row[column] ?? "—").replaceAll("_", " ");
  }

  return row[column] ?? "—";
}

export default async function RunCustomReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
    shipper?: string;
    driver?: string;
    status?: string;
    city?: string;
    payment_type?: string;
    page?: string;
    page_size?: string;
  }>;
}) {
  const profile = await requireProfile(internalRoles);
  const { id } = await params;
  const filters = await searchParams;
  const pagination = parseTablePagination(filters);

  if (!/^\d+$/.test(id)) notFound();

  const supabase = await createClient();
  const db = supabase as any;

  const [{ data: report }, { data: shippers }, { data: drivers }, currency] =
    await Promise.all([
      db
        .from("report_definitions")
        .select(`
          id,
          name,
          description,
          data_source,
          selected_columns,
          filters,
          sort_config,
          is_shared,
          created_at
        `)
        .eq("id", Number(id))
        .eq("organization_id", profile.organization_id)
        .maybeSingle(),

      db
        .from("profiles")
        .select("id, full_name, email")
        .eq("organization_id", profile.organization_id)
        .eq("role", "shipper")
        .eq("status", "active")
        .order("full_name"),

      db
        .from("profiles")
        .select("id, full_name, email")
        .eq("organization_id", profile.organization_id)
        .eq("role", "driver")
        .eq("status", "active")
        .order("full_name"),
      resolveOrganizationCurrency(supabase, profile.organization_id!),
    ]);

  if (!report) notFound();

  const columns = Array.isArray(report.selected_columns)
    ? report.selected_columns
    : ["tracking_number", "status"];

  let rows: any[] = [];
  let totalCount = 0;

  if (report.data_source === "shipments") {
    let query = db
      .from("shipments")
      .select(`
        id,
        tracking_number,
        reference_number,
        booked_at,
        consignee_name,
        consignee_phone,
        consignee_city,
        status,
        delivery_attempt_count,
        last_undelivered_reason,
        payment_type,
        cod_amount,
        currency,
        service_type,
        delivered_at,
        shipper_id,
        assigned_driver_id,
        shipper:profiles!shipments_shipper_id_fkey(
          full_name,
          email
        ),
        driver:profiles!shipments_assigned_driver_id_fkey(
          full_name,
          email
        )
      `, { count: "exact" })
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .order("booked_at", { ascending: false });

    const from = parseDateStart(filters.from);
    const to = parseDateStart(filters.to);

    if (from) {
      query = query.gte("booked_at", from.toISOString());
    }

    if (to) {
      query = query.lt(
        "booked_at",
        addDays(to, 1).toISOString(),
      );
    }

    if (filters.shipper) {
      query = query.eq("shipper_id", filters.shipper);
    }

    if (filters.driver) {
      query = query.eq(
        "assigned_driver_id",
        filters.driver,
      );
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.city) {
      query = query.ilike(
        "consignee_city",
        `%${filters.city.trim()}%`,
      );
    }

    if (filters.payment_type) {
      query = query.eq(
        "payment_type",
        filters.payment_type,
      );
    }

    const { data, count } = await query.range(
      pagination.from,
      pagination.to,
    );
    rows = data ?? [];
    totalCount = count ?? 0;
  } else if (report.data_source === "finance") {
    let query = db
      .from("finance_ledger")
      .select(`
        id,
        tracking_number,
        currency,
        cod_amount,
        delivery_charge,
        return_charge,
        total_charges,
        net_payable,
        transaction_at
      `, { count: "exact" })
      .eq("organization_id", profile.organization_id)
      .order("transaction_at", { ascending: false });

    const from = parseDateStart(filters.from);
    const to = parseDateStart(filters.to);

    if (from) {
      query = query.gte(
        "transaction_at",
        from.toISOString(),
      );
    }

    if (to) {
      query = query.lt(
        "transaction_at",
        addDays(to, 1).toISOString(),
      );
    }

    const { data, count } = await query.range(
      pagination.from,
      pagination.to,
    );
    rows = data ?? [];
    totalCount = count ?? 0;
  } else if (report.data_source === "settlements") {
    let query = db
      .from("settlements")
      .select("*", { count: "exact" })
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false });

    const from = parseDateStart(filters.from);
    const to = parseDateStart(filters.to);

    if (from) {
      query = query.gte(
        "created_at",
        from.toISOString(),
      );
    }

    if (to) {
      query = query.lt(
        "created_at",
        addDays(to, 1).toISOString(),
      );
    }

    const { data, count } = await query.range(
      pagination.from,
      pagination.to,
    );
    rows = data ?? [];
    totalCount = count ?? 0;
  }

  const exportParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) exportParams.set(key, value);
  }

  const exportHref =
    `/reports/custom/${report.id}/export?${exportParams.toString()}`;

  return (
    <div className="bp-page">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Link
            href="/reports/custom"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#13734b]"
          >
            <ArrowLeft className="size-4" />
            Back to Custom Reports
          </Link>

          <p className="mt-5 bp-section-label">
            Custom report
          </p>

          <h1 className="bp-heading mt-1 text-3xl font-black">
            {report.name}
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            {report.description ||
              "Saved custom report definition."}
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
            href={`/reports/custom/${report.id}/export-xlsx?${exportParams.toString()}`}
            className="bp-button-secondary"
          >
            <Download className="size-4" />
            Excel
          </Link>

          <Link
            href={`/reports/custom/${report.id}/export-pdf?${exportParams.toString()}`}
            className="bp-button-secondary"
          >
            <FileText className="size-4" />
            PDF
          </Link>
        </div>
      </div>

      <form
        method="get"
        className="bp-panel mt-6 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-7"
      >
        <input
          type="hidden"
          name="page_size"
          value={pagination.pageSize}
        />
        <input
          name="from"
          type="date"
          defaultValue={filters.from ?? ""}
          className="bp-input text-xs"
        />

        <input
          name="to"
          type="date"
          defaultValue={filters.to ?? ""}
          className="bp-input text-xs"
        />

        <select
          name="shipper"
          defaultValue={filters.shipper ?? ""}
          className="bp-input text-xs font-semibold"
          disabled={report.data_source !== "shipments"}
        >
          <option value="">All shippers</option>
          {(shippers ?? []).map((shipper: any) => (
            <option key={shipper.id} value={shipper.id}>
              {shipper.full_name || shipper.email}
            </option>
          ))}
        </select>

        <select
          name="driver"
          defaultValue={filters.driver ?? ""}
          className="bp-input text-xs font-semibold"
          disabled={report.data_source !== "shipments"}
        >
          <option value="">All riders</option>
          {(drivers ?? []).map((driver: any) => (
            <option key={driver.id} value={driver.id}>
              {driver.full_name || driver.email}
            </option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="bp-input text-xs font-semibold"
          disabled={report.data_source !== "shipments"}
        >
          <option value="">All statuses</option>
          <option value="booked">Booked</option>
          <option value="at_warehouse">At Warehouse</option>
          <option value="out_for_delivery">Out for Delivery</option>
          <option value="delivered">Delivered</option>
          <option value="undelivered">Undelivered</option>
          <option value="return_initiated">Return Initiated</option>
          <option value="returned_to_shipper">Returned to Shipper</option>
        </select>

        <input
          name="city"
          placeholder="City"
          defaultValue={filters.city ?? ""}
          className="bp-input text-xs"
          disabled={report.data_source !== "shipments"}
        />

        <select
          name="payment_type"
          defaultValue={filters.payment_type ?? ""}
          className="bp-input text-xs font-semibold"
          disabled={report.data_source !== "shipments"}
        >
          <option value="">All payment types</option>
          <option value="cod">COD</option>
          <option value="prepaid">Prepaid</option>
        </select>

        <button className="bp-button-primary md:col-span-2 xl:col-span-7 xl:w-fit">
          Apply Filters
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
        <DataTableToolbar
          pathname={`/reports/custom/${report.id}`}
          params={filters as TableSearchParams}
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={totalCount}
          showDates={false}
        />
      </div>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header flex items-center justify-between">
          <div>
            <h2 className="font-black text-[#26372f]">
              Report Results
            </h2>

            <p className="mt-1 text-xs text-[#87938d]">
              {totalCount.toLocaleString()} rows · {columns.length} columns
            </p>
          </div>

          <FileText className="size-5 text-[#13734b]" />
        </div>

        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No records found for these filters.
          </p>
        ) : (
          <SelectableTable visibleCount={rows.length}>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-4 py-3">Select</th>
                  {columns.map((column: string) => (
                    <th
                      key={column}
                      className="px-4 py-3"
                    >
                      {columnLabels[column] ||
                        column.replaceAll("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row, index) => (
                  <tr
                    key={row.id ?? `${index}`}
                    className="bp-table-row"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        data-table-row-select
                        aria-label={`Select row ${index + 1}`}
                        className="size-4 accent-[#13734b]"
                      />
                    </td>
                    {columns.map((column: string) => (
                      <td
                        key={column}
                        className="px-4 py-4 capitalize"
                      >
                        {String(renderValue(column, row, currency))}
                      </td>
                    ))}
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
