import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { resolveReportDateRange } from "@/lib/report-date-range";
import { createClient } from "@/lib/supabase/server";

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const profile = await requireProfile(internalRoles);
  if (!profile.organization_id) return new Response("Organization is not configured.", { status: 403 });
  const url = new URL(request.url);
  const { start, endExclusive, error: rangeError } = resolveReportDateRange({
    range: url.searchParams.get("range"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (rangeError) return new Response(rangeError, { status: 400 });
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const supabase = await createClient();
  const query = supabase.from("third_party_shipment_links").select(`
    shipment_id,
    partner_tracking_number,
    created_at,
    shipments!inner(organization_id, tracking_number, reference_number, booked_at, deleted_at)
  `)
    .eq("organization_id", profile.organization_id)
    .eq("shipments.organization_id", profile.organization_id)
    .is("shipments.deleted_at", null)
    .gte("shipments.booked_at", start.toISOString())
    .lt("shipments.booked_at", endExclusive.toISOString())
    .order("created_at", { ascending: false });

  const records: Awaited<ReturnType<typeof query.range>>["data"] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) return new Response("BloomPath FastDrop report could not be generated.", { status: 500 });
    records.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const headers = ["Customer Reference Number", "FastDrop AWB", "3PL AWB"];
  const rows = records.flatMap((record) => {
    const shipment = relation(record.shipments);
    return shipment ? [[shipment.reference_number ?? "", shipment.tracking_number ?? "", record.partner_tracking_number ?? ""]] : [];
  });
  const dateStamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  const filename = `bloompath-fastdrop-${dateStamp}.${format === "csv" ? "csv" : "xlsx"}`;

  if (format === "csv") {
    const body = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    return new Response(body, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    } });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("BloomPath FastDrop", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = headers.map((header) => ({ header, width: Math.max(24, header.length + 4) }));
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13734B" } };
  for (const row of rows) sheet.addRow(row);
  sheet.autoFilter = { from: "A1", to: "C1" };
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(bytes, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  } });
}
