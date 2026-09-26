import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { resolveReportDateRange } from "@/lib/report-date-range";

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

function relation(value: unknown) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
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
      service_type,
      status,
      delivery_attempt_count,
      booked_at,
      delivered_at,
      last_undelivered_reason,
      shipper:profiles!shipments_shipper_id_fkey(
        full_name,
        email
      ),
      driver:profiles!shipments_assigned_driver_id_fkey(
        full_name,
        email
      )
    `)
    .eq("organization_id", profile.organization_id!)
    .is("deleted_at", null)
    .gte("booked_at", start.toISOString())
    .lt("booked_at", endExclusive.toISOString())
    .order("booked_at", {
      ascending: false,
    });

  const shipper =
    url.searchParams.get("shipper");

  const driver =
    url.searchParams.get("driver");

  const status =
    url.searchParams.get("status");

  if (shipper) {
    query = query.eq("shipper_id", shipper);
  }

  if (driver) {
    query = query.eq(
      "assigned_driver_id",
      driver,
    );
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

  const workbook = new ExcelJS.Workbook();
  const sheet =
    workbook.addWorksheet("Delivery Report");

  sheet.addRow(["Delivery Report"]);
  sheet.addRow([
    "Period",
    `${dubaiDate(start.toISOString())} - ${dubaiDate(
      new Date(
        endExclusive.getTime() - 1,
      ).toISOString(),
    )}`,
  ]);
  sheet.addRow([]);

  sheet.addRow([
    "AWB",
    "Reference",
    "Booked",
    "Shipper",
    "Shipper Email",
    "Driver",
    "Driver Email",
    "Consignee",
    "Phone",
    "City",
    "Status",
    "Attempts",
    "Undelivered Reason",
    "Payment",
    "COD",
    "Service",
    "Delivered",
  ]);

  for (const row of rows) {
    const shipperRelation = relation(
      row.shipper,
    );

    const driverRelation = relation(
      row.driver,
    );

    sheet.addRow([
      row.tracking_number,
      row.reference_number ?? "",
      dubaiDate(row.booked_at),
      shipperRelation?.full_name ?? "",
      shipperRelation?.email ?? "",
      driverRelation?.full_name ?? "",
      driverRelation?.email ?? "",
      row.consignee_name,
      row.consignee_phone ?? "",
      row.consignee_city,
      row.status,
      row.delivery_attempt_count,
      row.last_undelivered_reason ?? "",
      row.payment_type,
      Number(row.cod_amount ?? 0),
      row.service_type,
      dubaiDate(row.delivered_at),
    ]);
  }

  sheet.columns.forEach((column) => {
    column.width = 18;
  });

  sheet.getColumn(1).width = 24;
  sheet.getColumn(8).width = 24;
  sheet.getColumn(13).width = 26;

  const buffer =
    await workbook.xlsx.writeBuffer();

  const dateStamp =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
    }).format(new Date());

  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="delivery-report-${dateStamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
