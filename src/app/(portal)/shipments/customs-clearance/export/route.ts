import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

const headers = [
  "Consignment Number", "Reference", "Barcodes", "Internal Account Number", "Shipper",
  "Shipper Address 1", "Shipper Address 2", "Shipper Address 3", "Shipper City",
  "Shipper County/State", "Shipper Zip", "Shipper Country Code", "Consignee", "Address1",
  "Address2", "Address3", "City", "Province", "Province Code", "Zip", "Country Code",
  "Email", "Phone", "Pieces", "Total Weight", "Weight UOM", "Total Value", "Currency",
  "Incoterms", "Item Description", "Item HS Code", "Item Quantity", "Item Value", "Country Of Origin",
] as const;

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function uppercase(value: unknown) {
  return value === null || value === undefined ? "" : typeof value === "string" ? value.toUpperCase() : value;
}

function optionalAddress(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return /^(?:N\/?A|N\.?A\.?)$/i.test(normalized) ? "" : normalized;
}

function validDate(value: string | null) {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export async function GET(request: Request) {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const url = new URL(request.url);
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  if (from === null || to === null || (from && to && from > to)) {
    return new Response("Choose a valid date range.", { status: 400 });
  }

  const supabase = await createClient();
  let query = supabase.from("shipments").select("*")
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .eq("consignee_country_code", "CA")
    .neq("sender_country_code", "CA")
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  if (profile.role === "shipper") query = query.eq("shipper_id", profile.id);
  if (from) query = query.gte("created_at", `${from}T00:00:00+04:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999+04:00`);

  const shipments: Awaited<ReturnType<typeof query.range>>["data"] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) return new Response("Canada customs report could not be generated.", { status: 500 });
    shipments.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const rows = shipments.map((shipment) => [
    shipment.tracking_number,
    shipment.reference_number ?? "",
    shipment.tracking_number,
    shipment.tracking_number,
    shipment.sender_name,
    shipment.sender_address,
    optionalAddress(shipment.sender_address_2),
    shipment.sender_address_3 ?? "",
    shipment.sender_city,
    shipment.sender_state_province ?? "",
    shipment.sender_postal_code ?? "",
    shipment.sender_country_code ?? "",
    shipment.consignee_name,
    shipment.consignee_address,
    optionalAddress(shipment.consignee_address_2),
    shipment.consignee_address_3 ?? "",
    shipment.consignee_city,
    shipment.consignee_state_province ?? "",
    shipment.consignee_state_province ?? "",
    shipment.consignee_postal_code ?? "",
    shipment.consignee_country_code ?? "CA",
    shipment.consignee_email ?? "",
    shipment.consignee_phone,
    Number(shipment.pieces ?? 0),
    Number(shipment.weight_kg ?? 0),
    "KGS",
    Number(shipment.declared_value ?? 0),
    shipment.item_value === null || shipment.item_value === undefined ? "CAD" : shipment.currency ?? "",
    shipment.incoterms ?? "",
    shipment.parcel_description ?? "",
    shipment.hs_code ?? "",
    shipment.item_quantity ?? shipment.pieces ?? 1,
    shipment.item_value ?? shipment.weight_kg ?? 0,
    shipment.country_of_origin ?? shipment.sender_country_code ?? "",
  ]);

  const dateStamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  const filename = `CANADA-CUSTOMS-CLEARANCE-${dateStamp}.${format.toUpperCase()}`;
  const exportHeaders = headers.map((header) => header.toUpperCase());
  const exportRows = rows.map((row) => row.map(uppercase));
  if (format === "csv") {
    const body = [exportHeaders, ...exportRows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    return new Response(body, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    } });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("CANADA CUSTOMS", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow([...exportHeaders]);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13734B" } };
  sheet.columns = exportHeaders.map((header) => ({ header, key: header, width: Math.max(16, Math.min(30, header.length + 3)) }));
  for (const row of exportRows) sheet.addRow([...row]);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(bytes, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  } });
}
