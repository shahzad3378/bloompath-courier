import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { billingContext, allBillingRows } from "@/lib/billing-workspace";
import { zoneRateHeaders } from "@/lib/zone-rate-import";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(["super_admin", "operations_admin", "finance_staff"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Shipper not found", { status: 404 });
  const { db, directory, currency, company } = await billingContext(profile.organization_id!);
  const shipper = directory.get(id);
  if (!shipper) return new Response("Shipper not found", { status: 404 });
  const zones = await allBillingRows((from, to) => db.from("service_zones").select("id,name,country_code,zone_type,postal_prefix,postal_from,postal_to,city,area").eq("organization_id", profile.organization_id!).eq("is_active", true).order("id").range(from, to));
  const book = new ExcelJS.Workbook(); book.creator = company;
  const rates = book.addWorksheet("Zone Rates");
  rates.addRow(zoneRateHeaders); rates.columns.forEach(column => { column.width = 23; });
  // Rates are deliberately blank: the customer supplies their agreed prices.
  for (const zone of zones) rates.addRow([zone.id, zone.name, zone.country_code, "next_day", currency, null, 0, null, 0, 0, "no", 0]);
  rates.views = [{ state: "frozen", ySplit: 1 }]; rates.autoFilter = "A1:L1";
  for (let i = 2; i <= Math.min(zones.length + 50, 5001); i++) {
    rates.getCell(`D${i}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"same_day,next_day,standard"'], showErrorMessage: true, error: "Choose a listed service type." };
    rates.getCell(`K${i}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"yes,no"'] };
  }
  const directorySheet = book.addWorksheet("Zones");
  directorySheet.addRow(["Zone ID", "Zone Name", "Country", "Mapping Type", "Postal Prefix", "Postal From", "Postal To", "City", "Area"]);
  for (const zone of zones) directorySheet.addRow([zone.id, zone.name, zone.country_code, zone.zone_type, zone.postal_prefix, zone.postal_from, zone.postal_to, zone.city, zone.area]);
  directorySheet.columns.forEach(column => { column.width = 24; }); directorySheet.views = [{ state: "frozen", ySplit: 1 }];
  const account = book.addWorksheet("Account"); account.addRows([["Shipper ID", id], ["Shipper", shipper.name], ["Courier company", company], ["Billing currency", currency]]); account.columns = [{ width: 26 }, { width: 75 }];
  const guide = book.addWorksheet("Instructions"); guide.columns = [{ width: 28 }, { width: 100 }];
  guide.addRows([
    ["Zone-rate upload", `${company} / ${shipper.name}`],
    ["Fill Zone Rates", "Enter Delivery Rate for the zones you need. Delete unused rows with blank prices. No prices are guessed or imported from the Zones sheet."],
    ["Zone mapping", "Use the actual Zone ID shown on Zones. Zone Name and Country Code must agree with that ID. Add service zones in the portal before pricing them."],
    ["Services", "same_day, next_day or standard. Add a separate row for each service and weight-from tier."],
    ["Currency", `All amounts are in ${currency}. Currency follows this courier company's configuration; the upload does not convert currencies.`],
    ["Weight bands", "KG only. Weight From defaults to 0. Weight To must exceed Weight From, or stay blank for unlimited. Money: 2 decimals; weight: 3 decimals."],
    ["Additional KG", "For a finite Weight To, each started KG above it uses Additional KG Rate. The highest applicable Weight From tier takes precedence."],
    ["COD fee", "Added to delivery charges for COD shipments under the matched zone rate."],
    ["Returns", "Set Return Charge Enabled to yes when a Return Rate applies; otherwise use no and 0."],
    ["Replacing rates", "Import validates every row, then versions matching zone/service/currency/weight-from rates for this shipper in one transaction. Unlisted tiers stay unchanged."],
    ["Billing", "New delivery/return finance entries use the active rate. The shipment must have the matching service zone. Existing finance snapshots and issued invoices are unchanged."],
    ["Limits", "5,000 rate rows, .xlsx file up to 5 MB. Paste values, not formulas. Do not change the Account sheet."],
  ]);
  guide.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; row.height = 44; });
  for (const sheet of [rates, directorySheet, account, guide]) { sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13734B" } }; }
  const bytes = await book.xlsx.writeBuffer();
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="shipper-zone-rates-template.xlsx"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
