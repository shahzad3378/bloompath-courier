import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

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

function parseDubaiDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day) - 4 * 60 * 60 * 1000,
  );
}

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
  await requireProfile(internalRoles);

  const url = new URL(request.url);

  const requestedRange = url.searchParams.get("range") ?? "7d";

  const range: RangeKey = [
    "today",
    "7d",
    "30d",
    "month",
    "custom",
  ].includes(requestedRange)
    ? (requestedRange as RangeKey)
    : "7d";

  const now = new Date();
  const todayStart = dubaiDayStartUtc(now);

  let start = addDays(todayStart, -6);
  let endExclusive = addDays(todayStart, 1);

  if (range === "today") {
    start = todayStart;
  } else if (range === "30d") {
    start = addDays(todayStart, -29);
  } else if (range === "month") {
    const dubai = new Date(
      now.getTime() + 4 * 60 * 60 * 1000,
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
      url.searchParams.get("from"),
    );

    const customTo = parseDubaiDate(
      url.searchParams.get("to"),
    );

    if (
      customFrom &&
      customTo &&
      customFrom <= customTo
    ) {
      start = customFrom;
      endExclusive = addDays(customTo, 1);
    }
  }

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
      service_type,
      status,
      delivery_attempt_count,
      booked_at,
      delivered_at,
      last_undelivered_reason,
      shipper:profiles!shipments_shipper_id_fkey(full_name,email),
      driver:profiles!shipments_assigned_driver_id_fkey(full_name,email)
    `)
    .is("deleted_at", null)
    .gte("booked_at", start.toISOString())
    .lt("booked_at", endExclusive.toISOString())
    .order("booked_at", { ascending: false });

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

  const { data, error } = await query;

  if (error) {
    return new Response(
      "Report export could not be generated.",
      { status: 500 },
    );
  }

  const rows = (data ?? []) as any[];

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
      row.shipper?.full_name ?? "",
      row.shipper?.email ?? "",
      row.driver?.full_name ?? "",
      row.driver?.email ?? "",
      row.consignee_name,
      row.consignee_phone ?? "",
      row.consignee_city,
      row.status,
      row.delivery_attempt_count,
      row.last_undelivered_reason ?? "",
      row.payment_type,
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
  }).format(now);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        `attachment; filename="bloompath-awb-report-${dateStamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
