import { requireProfile } from "@/lib/auth";
import { rowCurrency } from "@/lib/currency";
import { internalRoles } from "@/lib/roles";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";
import { resolveReportDateRange } from "@/lib/report-date-range";

function csvCell(value: unknown) {
  let text =
    value === null || value === undefined
      ? ""
      : String(value);

  // Prevent spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function dubaiDate(value: string | null | undefined) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export async function GET(request: Request) {
  const profile = await requireProfile(internalRoles);

  const url = new URL(request.url);

  const { start, endExclusive, error: rangeError } = resolveReportDateRange({
    range: url.searchParams.get("range"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (rangeError) return new Response(rangeError, { status: 400 });

  const supabase = await createClient();

  let query = supabase
    .from("shipments")
    .select(`
      id,
      tracking_number,
      reference_number,
      shipper_id,
      assigned_driver_id,
      consignee_name,
      consignee_phone,
      consignee_city,
      payment_type,
      cod_amount,
      currency,
      service_type,
      status,
      delivery_attempt_count,
      booked_at,
      delivered_at,
      last_undelivered_reason,
      shipper:profiles!shipments_shipper_id_fkey(full_name,email),
      driver:profiles!shipments_assigned_driver_id_fkey(full_name,email)
    `)
    .eq("organization_id", profile.organization_id!)
    .is("deleted_at", null)
    .gte("booked_at", start.toISOString())
    .lt("booked_at", endExclusive.toISOString())
    .order("booked_at", { ascending: false }).order("id", { ascending: false });

  const shipper = url.searchParams.get("shipper");
  const driver = url.searchParams.get("driver");
  const status = url.searchParams.get("status");

  if (shipper) {
    query = query.eq("shipper_id", shipper);
  }

  if (driver) {
    query = query.eq("assigned_driver_id", driver);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const allRows: Awaited<ReturnType<typeof query.range>>["data"] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) return new Response("Report export could not be generated.", { status: 500 });
    allRows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const rows = allRows;
  const organizationCurrency = await resolveOrganizationCurrency(
    supabase,
    profile.organization_id!,
  );

  const header = [
    "tracking_number",
    "reference_number",
    "booked_at",
    "shipper",
    "shipper_email",
    "driver",
    "driver_email",
    "consignee",
    "consignee_phone",
    "city",
    "status",
    "attempt_count",
    "undelivered_reason",
    "payment_type",
    "currency",
    "cod_amount",
    "service_type",
    "delivered_at",
  ];

  const csvRows = [
    header,
    ...rows.map((row) => [
      row.tracking_number,
      row.reference_number ?? "",
      dubaiDate(row.booked_at),
      row.shipper?.[0]?.full_name ?? "",
      row.shipper?.[0]?.email ?? "",
      row.driver?.[0]?.full_name ?? "",
      row.driver?.[0]?.email ?? "",
      row.consignee_name,
      row.consignee_phone ?? "",
      row.consignee_city,
      row.status,
      row.delivery_attempt_count,
      row.last_undelivered_reason ?? "",
      row.payment_type,
      rowCurrency(row.currency, organizationCurrency),
      Number(row.cod_amount ?? 0).toFixed(2),
      row.service_type,
      dubaiDate(row.delivered_at),
    ]),
  ];

  const csv =
    "\uFEFF" +
    csvRows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

  const dateStamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
  }).format(new Date());

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        `attachment; filename="bloompath-awb-report-${dateStamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
