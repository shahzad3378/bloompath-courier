import ExcelJS from "exceljs";
import { customerStatusLabel } from "@/lib/customer-tracking";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { shipmentStatuses, type ShipmentStatus } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

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
  const profile = await requireProfile([...internalRoles, "shipper"]);

  const url = new URL(request.url);

  const statusValue = url.searchParams.get("status") ?? "";
  const status = shipmentStatuses.includes(statusValue as ShipmentStatus)
    ? statusValue as ShipmentStatus
    : profile.role === "shipper" && statusValue === "in_transit" ? "in_transit" : "";

  const q = (url.searchParams.get("q") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 80);

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const shipper = url.searchParams.get("shipper");
  const driver = url.searchParams.get("driver");
  const destinationCandidate = (url.searchParams.get("destination") ?? "").trim().toUpperCase();
  const destination = /^[A-Z]{2}$/.test(destinationCandidate) ? destinationCandidate : "";

  const supabase = await createClient();

  let query = supabase
    .from("shipments")
    .select(`
      *,
      shipper:profiles!shipments_shipper_id_fkey(full_name,email),
      driver:profiles!shipments_assigned_driver_id_fkey(full_name,email)
    `)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false });

  if (profile.role === "shipper") {
    query = query.eq("shipper_id", profile.id);
  } else if (shipper) {
    query = query.eq("shipper_id", shipper);
  }

  if (driver) {
    query = query.eq("assigned_driver_id", driver);
  }

  if (destination) {
    query = query.eq("consignee_country_code", destination);
  }

  if (status) query = profile.role === "shipper"
    ? query.or(`customer_tracking_status.eq.${status}${status === "in_transit" ? "" : `,and(customer_tracking_status.is.null,status.eq.${status})`}`)
    : query.eq("status", status);

  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    query = query.gte(
      "created_at",
      `${from}T00:00:00+04:00`,
    );
  }

  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    query = query.lte(
      "created_at",
      `${to}T23:59:59.999+04:00`,
    );
  }

  const allRows: Awaited<ReturnType<typeof query.range>>["data"] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) return new Response("Excel export could not be generated.", { status: 500 });
    allRows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const rows = allRows.filter((shipment) => {
    if (!q) return true;

    return (
      String(shipment.tracking_number ?? "").toLowerCase().includes(q) ||
      String(shipment.reference_number ?? "").toLowerCase().includes(q) ||
      String(shipment.consignee_name ?? "").toLowerCase().includes(q) ||
      String(shipment.consignee_phone ?? "").toLowerCase().includes(q)
    );
  });

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "BloomPath Courier";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Shipments", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "AWB", key: "tracking_number", width: 22 },
    { header: "Reference", key: "reference_number", width: 20 },
    { header: "Booked At", key: "created_at", width: 20 },
    { header: "Shipper", key: "shipper", width: 24 },
    { header: "Shipper Email", key: "shipper_email", width: 28 },
    { header: "Driver", key: "driver", width: 24 },
    { header: "Driver Email", key: "driver_email", width: 28 },
    { header: "Sender", key: "sender_name", width: 24 },
    { header: "Sender Phone", key: "sender_phone", width: 18 },
    { header: "Sender City", key: "sender_city", width: 16 },
    { header: "Consignee", key: "consignee_name", width: 24 },
    { header: "Consignee Phone", key: "consignee_phone", width: 18 },
    { header: "Alt Phone", key: "consignee_alt_phone", width: 18 },
    { header: "City", key: "consignee_city", width: 16 },
    { header: "Area", key: "consignee_area", width: 22 },
    { header: "Address", key: "consignee_address", width: 40 },
    { header: "Service", key: "service_type", width: 18 },
    { header: "Payment", key: "payment_type", width: 14 },
    { header: "Pieces", key: "pieces", width: 10 },
    { header: "Weight KG", key: "weight_kg", width: 12 },
    { header: "COD Amount", key: "cod_amount", width: 14 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Status", key: "status", width: 22 },
    { header: "Attempts", key: "delivery_attempt_count", width: 10 },
    { header: "Undelivered Reason", key: "last_undelivered_reason", width: 28 },
    { header: "Delivered At", key: "delivered_at", width: 20 },
  ];

  for (const row of rows) {
    sheet.addRow({
      tracking_number: row.tracking_number,
      reference_number: row.reference_number ?? "",
      created_at: dubaiDate(row.created_at),
      shipper:
        row.shipper?.full_name ??
        row.shipper?.email ??
        "",
      shipper_email: row.shipper?.email ?? "",
      driver:
        row.driver?.full_name ??
        row.driver?.email ??
        "",
      driver_email: row.driver?.email ?? "",
      sender_name: row.sender_name ?? "",
      sender_phone: row.sender_phone ?? "",
      sender_city: row.sender_city ?? "",
      consignee_name: row.consignee_name ?? "",
      consignee_phone: row.consignee_phone ?? "",
      consignee_alt_phone: row.consignee_alt_phone ?? "",
      consignee_city: row.consignee_city ?? "",
      consignee_area: row.consignee_area ?? "",
      consignee_address: row.consignee_address ?? "",
      service_type: String(row.service_type ?? "").replaceAll("_", " "),
      payment_type: String(row.payment_type ?? "").toUpperCase(),
      pieces: Number(row.pieces ?? 0),
      weight_kg: Number(row.weight_kg ?? 0),
      cod_amount: Number(row.cod_amount ?? 0),
      currency: row.currency ?? "",
      status: profile.role === "shipper" ? customerStatusLabel(row) : String(row.status ?? "").replaceAll("_", " "),
      delivery_attempt_count: Number(row.delivery_attempt_count ?? 0),
      last_undelivered_reason: String(
        row.last_undelivered_reason ?? "",
      ).replaceAll("_", " "),
      delivered_at: dubaiDate(row.delivered_at),
    });
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  header.height = 24;

  sheet.autoFilter = {
    from: "A1",
    to: "Z1",
  };

  sheet.getColumn("U").numFmt = '#,##0.00';
  sheet.getColumn("T").numFmt = '0.000';

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    row.alignment = {
      vertical: "top",
      wrapText: true,
    };
  });

  const buffer = await workbook.xlsx.writeBuffer();

  const dateStamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
  }).format(new Date());

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="bloompath-all-shipments-${dateStamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

