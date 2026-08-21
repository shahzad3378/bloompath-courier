import ExcelJS from "exceljs";
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

function exportBaseName(status: ShipmentStatus | "") {
  return status ? `${status.replaceAll("_", "-")}-shipments` : "all-shipments";
}

export async function GET(request: Request) {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const url = new URL(request.url);
  const statusValue = url.searchParams.get("status") ?? "";
  const status = shipmentStatuses.includes(statusValue as ShipmentStatus) ? (statusValue as ShipmentStatus) : "";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const shipper = url.searchParams.get("shipper");
  const driver = url.searchParams.get("driver");
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("organization_settings")
    .select("currency, display_name, legal_name")
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  const currency = /^[A-Z]{3}$/.test(String(settings?.currency ?? "").toUpperCase()) ? String(settings?.currency).toUpperCase() : "AED";

  let query = supabase
    .from("shipments")
    .select(`*, shipper:profiles!shipments_shipper_id_fkey(full_name,email), driver:profiles!shipments_assigned_driver_id_fkey(full_name,email)`)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (profile.role === "shipper") query = query.eq("shipper_id", profile.id);
  else if (shipper) query = query.eq("shipper_id", shipper);
  if (driver) query = query.eq("assigned_driver_id", driver);
  if (status) query = query.eq("status", status);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("created_at", `${from}T00:00:00+04:00`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("created_at", `${to}T23:59:59.999+04:00`);

  const { data, error } = await query;
  if (error) return new Response("Excel export could not be generated.", { status: 500 });
  const rows = (data ?? []).filter((shipment) => !q ||
    String(shipment.tracking_number ?? "").toLowerCase().includes(q) ||
    String(shipment.reference_number ?? "").toLowerCase().includes(q) ||
    String(shipment.consignee_name ?? "").toLowerCase().includes(q) ||
    String(shipment.consignee_phone ?? "").toLowerCase().includes(q));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = settings?.display_name || settings?.legal_name || "Courier Operations";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(status ? status.replaceAll("_", " ") : "All Shipments", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "AWB", key: "tracking_number", width: 22 }, { header: "Reference", key: "reference_number", width: 20 },
    { header: "Booked At", key: "created_at", width: 20 }, { header: "Shipper", key: "shipper", width: 24 },
    { header: "Driver", key: "driver", width: 24 }, { header: "Consignee", key: "consignee_name", width: 24 },
    { header: "Phone", key: "consignee_phone", width: 18 }, { header: "City", key: "consignee_city", width: 18 },
    { header: "Postal Code", key: "consignee_postal_code", width: 16 }, { header: "Service", key: "service_type", width: 16 },
    { header: "Pieces", key: "pieces", width: 10 }, { header: "Weight KG", key: "weight_kg", width: 12 },
    { header: `COD (${currency})`, key: "cod_amount", width: 16 }, { header: "Currency", key: "currency", width: 10 },
    { header: "Status", key: "status", width: 22 }, { header: "Attempts", key: "delivery_attempt_count", width: 10 },
    { header: "Undelivered Reason", key: "last_undelivered_reason", width: 28 }, { header: "Delivered At", key: "delivered_at", width: 20 },
  ];
  for (const row of rows) sheet.addRow({
    tracking_number: row.tracking_number, reference_number: row.reference_number ?? "", created_at: dubaiDate(row.created_at),
    shipper: row.shipper?.full_name ?? row.shipper?.email ?? "", driver: row.driver?.full_name ?? row.driver?.email ?? "",
    consignee_name: row.consignee_name ?? "", consignee_phone: row.consignee_phone ?? "", consignee_city: row.consignee_city ?? "",
    consignee_postal_code: row.consignee_postal_code ?? "", service_type: String(row.service_type ?? "").replaceAll("_", " "),
    pieces: Number(row.pieces ?? 0), weight_kg: Number(row.weight_kg ?? 0), cod_amount: Number(row.cod_amount ?? 0),
    currency: row.currency || currency, status: String(row.status ?? "").replaceAll("_", " "), delivery_attempt_count: Number(row.delivery_attempt_count ?? 0),
    last_undelivered_reason: String(row.last_undelivered_reason ?? "").replaceAll("_", " "), delivered_at: dubaiDate(row.delivered_at),
  });
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).height = 24;
  sheet.autoFilter = { from: "A1", to: "R1" };
  sheet.getColumn("M").numFmt = `\"${currency}\" #,##0.00`;
  sheet.getColumn("L").numFmt = "0.000";
  sheet.eachRow((row, rowNumber) => { if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true }; });

  const buffer = await workbook.xlsx.writeBuffer();
  const dateStamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  const filename = `${exportBaseName(status)}-${dateStamp}.xlsx`;
  return new Response(buffer, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  }});
}
