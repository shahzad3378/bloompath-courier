import ExcelJS from "exceljs";

export const runtime = "nodejs";

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BloomPath Courier";
  workbook.created = new Date();

  const guide = workbook.addWorksheet("Read Me");
  guide.columns = [{ width: 30 }, { width: 88 }];
  guide.addRows([
    ["BloomPath 3PL Rate Upload", "Use the two data sheets to upload any carrier’s rate card."],
    ["Rate Grid", "One row for each service + origin + zone + weight combination."],
    ["Zone Map", "One row for each service + origin + destination postal code/prefix."],
    ["Fuel surcharge %", "Enter a percentage number, e.g. 36.5 for 36.5%. Leave blank for none."],
    ["Weight unit", "Use kg or lb. A rate card can contain both units if the carrier supplies them."],
    ["Postal codes", "Enter a full postal code or a prefix; spaces and dashes are removed during import."],
    ["Origin terminal", "Use the carrier’s actual origin/hub code (e.g. YYZ). Leave blank when the rate is not origin-specific."],
    ["Currency", "Select the currency on the upload page. Keep all rates in this workbook in that currency."],
    ["Service", "Keep the service name consistent across Rate Grid and Zone Map."],
  ]);
  guide.getRow(1).font = { bold: true, color: { argb: "FF13734B" } };
  guide.eachRow((row, rowNumber) => { if (rowNumber > 1) row.height = 28; row.alignment = { vertical: "middle", wrapText: true }; });

  const grid = workbook.addWorksheet("Rate Grid");
  grid.columns = [
    { header: "Service", key: "service", width: 28 },
    { header: "Origin Terminal", key: "origin_terminal", width: 20 },
    { header: "Zone", key: "zone", width: 16 },
    { header: "Weight", key: "weight", width: 14 },
    { header: "Weight Unit", key: "weight_unit", width: 15 },
    { header: "Base Rate", key: "base_rate", width: 16 },
    { header: "Fuel Surcharge Percent", key: "fuel_surcharge_percent", width: 25 },
  ];
  grid.addRow({ service: "Regional Canada", origin_terminal: "YYZ", zone: "1", weight: 1, weight_unit: "lb", base_rate: 4.186, fuel_surcharge_percent: 12 });
  grid.addRow({ service: "Regional Canada", origin_terminal: "YYZ", zone: "2", weight: 1, weight_unit: "lb", base_rate: 4.6494, fuel_surcharge_percent: 12 });

  const zoneMap = workbook.addWorksheet("Zone Map");
  zoneMap.columns = [
    { header: "Postal Code", key: "postal_code", width: 18 },
    { header: "Service", key: "service", width: 28 },
    { header: "Origin Terminal", key: "origin_terminal", width: 20 },
    { header: "Zone", key: "zone", width: 16 },
  ];
  zoneMap.addRow({ postal_code: "M5V", service: "Regional Canada", origin_terminal: "YYZ", zone: "1" });
  zoneMap.addRow({ postal_code: "M5V 3A8", service: "Canada Post Expedited", origin_terminal: "YYZ", zone: "A01" });

  for (const sheet of [grid, zoneMap]) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: `${sheet.columnCount > 26 ? "Z" : String.fromCharCode(64 + sheet.columnCount)}1` };
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13734B" } };
  }

  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="bloompath-3pl-rate-upload-template.xlsx"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
