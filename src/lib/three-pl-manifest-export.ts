import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
export type ManifestExportRow = { tracking_number: string; partner_name: string; load_number: string | null; partner_tracking_number: string | null; consignee_name: string; consignee_city: string; pieces: number };
export type ManifestExportData = { company: string; number: string; status: string; rows: ManifestExportRow[] };
const headers = ["#", "Courier AWB", "Partner", "Load number", "Partner AWB", "Consignee", "City", "Pieces"];
export function manifestExportValues(row: ManifestExportRow, index: number) {
  return [index + 1, row.tracking_number, row.partner_name, row.load_number || "Not provided", row.partner_tracking_number || "Not booked", row.consignee_name, row.consignee_city, row.pieces];
}
export async function exportThreePLManifest(data: ManifestExportData, format: "pdf" | "excel") {
  let bytes: Uint8Array;
  if (format === "excel") {
    const workbook = new ExcelJS.Workbook(); workbook.creator = data.company;
    const sheet = workbook.addWorksheet("3PL Manifest");
    sheet.addRow([data.company]); sheet.mergeCells("A1:H1"); sheet.getRow(1).font = { size: 16, bold: true };
    sheet.addRow(["3PL Shipment Manifest", data.number]);
    sheet.addRow(["Status", data.status]);
    sheet.addRow(["Shipments", data.rows.length, "Pieces", data.rows.reduce((sum, row) => sum + row.pieces, 0)]);
    sheet.addRow([]); sheet.addRow(headers);
    data.rows.forEach((row, index) => sheet.addRow(manifestExportValues(row, index)));
    [6, 25, 24, 23, 31, 32, 23, 9].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.getRow(6).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13734B" } };
    sheet.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
    sheet.autoFilter = { from: "A6", to: `H${6 + data.rows.length}` };
    sheet.views = [{ state: "frozen", ySplit: 6 }];
    sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:6" };
    bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  } else {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const safe = (value: string) => [...value.replace(/[\r\n\t]+/g, " ")].map((char) => { try { font.encodeText(char); return char; } catch { return "?"; } }).join("");
    const widths = [23, 106, 93, 107, 141, 119, 107, 36];
    let page = doc.addPage([842, 595]), y = 0, pageNumber = 0;
    const pages: typeof page[] = [];
    const startPage = () => {
      pageNumber += 1; if (pageNumber > 1) page = doc.addPage([842, 595]); pages.push(page);
      page.drawText(safe(data.company), { x: 30, y: 559, size: 15, font: bold });
      page.drawText("3PL Shipment Manifest", { x: 30, y: 538, size: 12, font: bold });
      page.drawText(safe(`Reference: ${data.number}`), { x: 30, y: 519, size: 9, font });
      page.drawText(safe(`Status: ${data.status} | Shipments: ${data.rows.length} | Pieces: ${data.rows.reduce((sum, row) => sum + row.pieces, 0)}`), { x: 30, y: 503, size: 9, font });
      y = 480; let x = 30;
      page.drawRectangle({ x, y: y - 18, width: 782, height: 22, color: rgb(0.075, 0.45, 0.29) });
      headers.forEach((title, index) => { page.drawText(title, { x: x + 3, y: y - 10, size: 8, font: bold, color: rgb(1, 1, 1) }); x += widths[index]; }); y -= 24;
    };
    const wrap = (value: string, width: number) => {
      const lines: string[] = []; let line = "";
      for (const char of safe(value)) { if (line && font.widthOfTextAtSize(line + char, 8) > width - 6) { lines.push(line); line = ""; } line += char; }
      lines.push(line || ""); return lines;
    };
    startPage();
    data.rows.forEach((row, index) => {
      const cells = manifestExportValues(row, index).map((value, column) => wrap(String(value), widths[column]));
      const height = Math.max(24, Math.max(...cells.map((lines) => lines.length)) * 11 + 10);
      if (y - height < 45) startPage();
      let x = 30;
      cells.forEach((lines, column) => { lines.forEach((line, n) => page.drawText(line, { x: x + 3, y: y - 12 - n * 11, size: 8, font })); x += widths[column]; });
      y -= height; page.drawLine({ start: { x: 30, y }, end: { x: 812, y }, thickness: 0.4, color: rgb(0.8, 0.85, 0.82) });
    });
    pages.forEach((p, index) => p.drawText(`Internal operations copy | Page ${index + 1} of ${pages.length}`, { x: 30, y: 23, size: 8, font }));
    bytes = new Uint8Array(await doc.save());
  }
  const filename = data.number.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 90) || "3pl-manifest";
  return new Response(bytes as BodyInit, { headers: { "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}.${format === "pdf" ? "pdf" : "xlsx"}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
