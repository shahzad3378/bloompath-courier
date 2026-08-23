import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  ArrowLeft,
  BarChart3,
  FilePlus2,
  FileText,
  LockKeyhole,
  Share2,
  Trash2,
} from "lucide-react";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { SelectableTable } from "@/components/selectable-table";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import {
  parseDateBoundary,
  parseTablePagination,
  type TableSearchParams,
} from "@/lib/table-pagination";

export const metadata = {
  title: "Custom Reports",
};

const dataSources = [
  {
    value: "shipments",
    label: "Shipments / AWB",
  },
  {
    value: "delivery_attempts",
    label: "Delivery Attempts",
  },
  {
    value: "dispatch",
    label: "Dispatch",
  },
  {
    value: "returns",
    label: "Returns / RTO",
  },
  {
    value: "finance",
    label: "Finance / COD",
  },
  {
    value: "settlements",
    label: "Settlements",
  },
] as const;

const availableColumns = [
  ["tracking_number", "AWB / Tracking No."],
  ["reference_number", "Reference No."],
  ["booked_at", "Booked Date"],
  ["shipper", "Shipper"],
  ["driver", "Driver"],
  ["consignee_name", "Consignee"],
  ["consignee_phone", "Consignee Phone"],
  ["consignee_city", "City"],
  ["status", "Status"],
  ["delivery_attempt_count", "Attempt Count"],
  ["last_undelivered_reason", "Undelivered Reason"],
  ["payment_type", "Payment Type"],
  ["cod_amount", "COD Amount"],
  ["delivery_charge", "Delivery Charge"],
  ["return_charge", "Return Charge"],
  ["total_charges", "Total Charges"],
  ["net_payable", "Net Payable"],
  ["service_type", "Service Type"],
  ["delivered_at", "Delivered Date"],
] as const;

const validSources = new Set(
  dataSources.map((source) => source.value),
);

async function createReport(formData: FormData) {
  "use server";

  const profile = await requireProfile(internalRoles);
  const supabase = await createClient();
  const db = supabase as any;

  const name = String(formData.get("name") || "").trim();
  const description = String(
    formData.get("description") || "",
  ).trim();

  const requestedSource = String(
    formData.get("data_source") || "shipments",
  );

  const dataSource = validSources.has(
    requestedSource as (typeof dataSources)[number]["value"],
  )
    ? requestedSource
    : "shipments";

  const selectedColumns = formData
    .getAll("columns")
    .map((value) => String(value))
    .filter(Boolean);

  const isShared = formData.get("is_shared") === "on";

  if (!name) {
    return;
  }

  const columns =
    selectedColumns.length > 0
      ? selectedColumns
      : ["tracking_number", "status"];

  const { error } = await db
    .from("report_definitions")
    .insert({
      organization_id: profile.organization_id,
      name,
      description: description || null,
      data_source: dataSource,
      selected_columns: columns,
      filters: [],
      sort_config: [],
      is_shared: isShared,
      created_by: profile.id,
    });

  if (error) {
    throw new Error(
      `Custom report could not be saved: ${error.message}`,
    );
  }

  revalidatePath("/reports/custom");
}

async function deleteReport(formData: FormData) {
  "use server";

  await requireProfile(internalRoles);

  const reportId = Number(formData.get("report_id"));

  if (!Number.isFinite(reportId)) {
    return;
  }

  const supabase = await createClient();
  const db = supabase as any;

  const { error } = await db
    .from("report_definitions")
    .delete()
    .eq("id", reportId);

  if (error) {
    throw new Error(
      `Custom report could not be deleted: ${error.message}`,
    );
  }

  revalidatePath("/reports/custom");
}

export default async function CustomReportsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const profile = await requireProfile(internalRoles);
  const filters = await searchParams;
  const pagination = parseTablePagination(filters);
  const supabase = await createClient();
  const db = supabase as any;

  let query = db
    .from("report_definitions")
    .select(
      `
      id,
      name,
      description,
      data_source,
      selected_columns,
      filters,
      sort_config,
      is_shared,
      created_by,
      created_at
      `,
      { count: "exact" },
    )
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false });

  const from = parseDateBoundary(filters.from);
  const to = parseDateBoundary(filters.to, true);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error, count } = await query.range(
    pagination.from,
    pagination.to,
  );

  const reports = (data ?? []) as any[];

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#13734b] hover:underline"
          >
            <ArrowLeft className="size-4" />
            Back to Report Center
          </Link>

          <p className="mt-5 text-sm font-semibold text-[#188459]">
            Reporting workspace
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            Custom Reports
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-[#74827b]">
            Build reusable reports by choosing the operational
            data source and the columns your team needs.
          </p>
        </div>

        <div className="rounded-2xl border border-[#dce8e2] bg-[#f3faf6] px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#5f796c]">
            Saved reports
          </p>
          <p className="mt-1 text-2xl font-black text-[#13734b]">
            {(count ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      <section className="mt-7 grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#edf8f2] text-[#13734b]">
              <FilePlus2 className="size-5" />
            </div>

            <div>
              <h2 className="font-bold text-[#26372f]">
                Create custom report
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#87938d]">
                Save the report layout now. Filters and exports
                will use this saved definition.
              </p>
            </div>
          </div>

          <form action={createReport} className="mt-6 space-y-5">
            <div>
              <label className="text-xs font-bold text-[#53645c]">
                Report name
              </label>
              <input
                name="name"
                required
                placeholder="e.g. Daily Undelivered Report"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm outline-none focus:border-[#76b798]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#53645c]">
                Description
              </label>
              <textarea
                name="description"
                rows={3}
                placeholder="Optional report description"
                className="mt-2 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 py-3 text-sm outline-none focus:border-[#76b798]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#53645c]">
                Data source
              </label>
              <select
                name="data_source"
                defaultValue="shipments"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-semibold outline-none"
              >
                {dataSources.map((source) => (
                  <option
                    key={source.value}
                    value={source.value}
                  >
                    {source.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs font-bold text-[#53645c]">
                Report columns
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {availableColumns.map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-2 rounded-xl border border-[#e5ebe8] p-3 text-xs text-[#53645c] transition hover:bg-[#f8fbf9]"
                  >
                    <input
                      type="checkbox"
                      name="columns"
                      value={value}
                      defaultChecked={[
                        "tracking_number",
                        "booked_at",
                        "shipper",
                        "driver",
                        "status",
                        "cod_amount",
                      ].includes(value)}
                      className="mt-0.5"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#dce8e2] bg-[#f7fbf9] p-4">
              <input type="checkbox" name="is_shared" />

              <div>
                <p className="text-xs font-bold text-[#30443a]">
                  Share with internal team
                </p>
                <p className="mt-1 text-[11px] text-[#84928b]">
                  Other authorized BloomPath staff can view this
                  report definition.
                </p>
              </div>
            </label>

            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white transition hover:bg-[#0f6240]"
            >
              <FilePlus2 className="size-4" />
              Save custom report
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
          <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
            <div>
              <h2 className="font-bold text-[#26372f]">
                Saved reports
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Personal and shared reusable report definitions.
              </p>
            </div>

            <BarChart3 className="size-5 text-[#13734b]" />
          </div>

          <DataTableToolbar
            pathname="/reports/custom"
            params={filters}
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={count ?? 0}
            dateLabel="Created date"
          />

          {error ? (
            <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
              Saved reports could not be loaded.
            </p>
          ) : reports.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto size-8 text-[#a2aea8]" />
              <p className="mt-4 text-sm font-bold text-[#53645c]">
                No custom reports yet
              </p>
              <p className="mt-1 text-xs text-[#87938d]">
                Create your first reusable report from the builder.
              </p>
            </div>
          ) : (
            <SelectableTable visibleCount={reports.length}>
            <div className="divide-y divide-[#edf1ef]">
              {reports.map((report) => {
                const columns = Array.isArray(
                  report.selected_columns,
                )
                  ? report.selected_columns
                  : [];

                return (
                  <div
                    key={report.id}
                    className="flex flex-col gap-4 p-5 transition hover:bg-[#fbfcfb] md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        data-table-row-select
                        aria-label={`Select ${report.name}`}
                        className="mt-1 size-4 shrink-0 accent-[#13734b]"
                      />
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-[#26372f]">
                          {report.name}
                        </h3>

                        <span className="rounded-full bg-[#edf8f2] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#176a47]">
                          {String(report.data_source).replaceAll(
                            "_",
                            " ",
                          )}
                        </span>

                        {report.is_shared ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#46639b]">
                            <Share2 className="size-3" />
                            Shared
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#7b817e]">
                            <LockKeyhole className="size-3" />
                            Private
                          </span>
                        )}
                      </div>

                      {report.description ? (
                        <p className="mt-2 text-xs text-[#7c8983]">
                          {report.description}
                        </p>
                      ) : null}

                      <p className="mt-3 text-[11px] text-[#98a29d]">
                        {columns.length} columns selected
                      </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <form action={deleteReport}>
                        <input
                          type="hidden"
                          name="report_id"
                          value={report.id}
                        />

                        <button
                          type="submit"
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#efd6d6] bg-white px-3 text-xs font-bold text-[#b74646] transition hover:bg-[#fff6f6]"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
            </SelectableTable>
          )}
        </div>
      </section>
    </div>
  );
}
