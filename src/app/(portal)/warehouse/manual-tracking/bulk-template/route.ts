import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { customerTrackingLabels, manualTrackingStatuses } from "@/lib/customer-tracking";
import { trackingTimeZones } from "@/lib/tracking-timezones";

const roles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

export async function GET() {
  await requireProfile(roles);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BloomPath Courier";
  const sheet = workbook.addWorksheet("Bulk Upload");
  sheet.columns = [
    { header: "tracking_number", key: "tracking_number", width: 24 },
    { header: "status", key: "status", width: 48 },
    { header: "occurred_at", key: "occurred_at", width: 24 },
    { header: "time_zone", key: "time_zone", width: 30 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "D2" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174EA6" } };
  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ header: "Field", key: "field", width: 24 }, { header: "Instructions", key: "instructions", width: 110 }];
  instructions.addRows([
    { field: "tracking_number", instructions: "Required. Enter the AWB exactly as stored in this courier account. Use one AWB per row." },
    { field: "status", instructions: `Required. Use a status code: ${manualTrackingStatuses.map((status) => `${status} (${customerTrackingLabels[status]})`).join("; ")}` },
    { field: "occurred_at", instructions: "Required. Local time when the status happened, in YYYY-MM-DDTHH:mm format, for example 2026-10-28T14:30." },
    { field: "time_zone", instructions: `Optional. Leave blank for automatic shipment-location detection. Supported values: ${trackingTimeZones.map((zone) => zone.value).join(", ")}.` },
    { field: "POD", instructions: "No POD photo is needed for bulk uploads, including Delivered status." },
    { field: "Upload", instructions: "Maximum 500 rows and 5 MB. Each AWB may appear only once per file. Valid rows are saved; invalid rows are skipped and reported after upload." },
  ]);
  instructions.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  instructions.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174EA6" } };
  instructions.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=manual-tracking-bulk-template.xlsx",
      "Cache-Control": "no-store",
    },
  });
}
