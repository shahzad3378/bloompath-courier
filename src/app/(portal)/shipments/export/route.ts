import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { shipmentStatuses, type ShipmentStatus } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
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

  let query = supabase.from("shipments").select("*")
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false });

  if (profile.role === "shipper") query = query.eq("shipper_id", profile.id);
  else if (shipper) query = query.eq("shipper_id", shipper);
  if (driver) query = query.eq("assigned_driver_id", driver);
  if (status) query = query.eq("status", status);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("created_at", `${from}T00:00:00+04:00`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("created_at", `${to}T23:59:59.999+04:00`);

  const allRows: Awaited<ReturnType<typeof query.range>>["data"] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) return new Response("Shipment export could not be generated.", { status: 500 });
    allRows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const rows = allRows.filter((shipment) => !q ||
    String(shipment.tracking_number ?? "").toLowerCase().includes(q) ||
    String(shipment.reference_number ?? "").toLowerCase().includes(q) ||
    String(shipment.consignee_name ?? "").toLowerCase().includes(q) ||
    String(shipment.consignee_phone ?? "").toLowerCase().includes(q));

  const header = ["tracking_number","reference_number","created_at","sender_name","sender_phone","sender_city","consignee_name","consignee_phone","consignee_alt_phone","consignee_city","consignee_area","consignee_address","service_type","payment_type","pieces","weight_kg","cod_amount","currency","status","delivery_attempt_count","last_undelivered_reason","delivered_at"];
  const csvRows = [header, ...rows.map((row) => [row.tracking_number,row.reference_number ?? "",dubaiDate(row.created_at),row.sender_name,row.sender_phone,row.sender_city,row.consignee_name,row.consignee_phone,row.consignee_alt_phone ?? "",row.consignee_city,row.consignee_area ?? "",row.consignee_address,row.service_type,row.payment_type,row.pieces,row.weight_kg,Number(row.cod_amount ?? 0).toFixed(2),row.currency ?? "",row.status,row.delivery_attempt_count,row.last_undelivered_reason ?? "",dubaiDate(row.delivered_at)])];
  const csv = "\uFEFF" + csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const dateStamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  const filename = `${exportBaseName(status)}-${dateStamp}.csv`;

  return new Response(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  }});
}
