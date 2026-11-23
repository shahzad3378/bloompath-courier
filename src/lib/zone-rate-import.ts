import ExcelJS from "exceljs";

export const zoneRateMaxBytes = 5 * 1024 * 1024;
export const zoneRateHeaders = ["Zone ID", "Zone Name", "Country Code", "Service Type", "Currency", "Delivery Rate", "Weight From KG", "Weight To KG", "Additional KG Rate", "COD Fee", "Return Charge Enabled", "Return Rate"];
export type ImportZone = { id: number; name: string; country_code: string };
export type ImportedZoneRate = { service_zone_id: number; service_type: "same_day" | "next_day" | "standard"; currency: string; delivery_rate: number; weight_from_kg: number; weight_to_kg: number | null; additional_kg_rate: number; cod_fee: number; return_charge_enabled: boolean; return_rate: number };
const text = (value: unknown) => value == null ? "" : String(value).trim();
const key = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function parseZoneRateRows(grid: unknown[][], zones: ImportZone[], currency: string): ImportedZoneRate[] {
  const headers = (grid[0] || []).map(key);
  const get = (row: unknown[], name: string) => row[headers.indexOf(name)];
  for (const name of ["service_type", "delivery_rate"]) if (!headers.includes(name)) throw new Error(`Missing ${name} column. Download the zone-rate template.`);
  if (!headers.includes("zone_id") && !headers.includes("zone_name")) throw new Error("Include Zone ID or Zone Name.");
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error("Duplicate column headers are not allowed.");
  const result: ImportedZoneRate[] = [], seen = new Set<string>();
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i]; if (!row.some(value => text(value))) continue;
    const fail = (message: string): never => { throw new Error(`Row ${i + 1}: ${message}`); };
    if (result.length >= 5000) fail("upload no more than 5,000 rates per file.");
    const id = text(get(row, "zone_id")), name = text(get(row, "zone_name")), country = text(get(row, "country_code")).toUpperCase();
    const matches = zones.filter(zone => id ? String(zone.id) === id : zone.name.trim().toLowerCase() === name.toLowerCase() && (!country || zone.country_code === country));
    if (matches.length !== 1) fail(matches.length ? "zone name is ambiguous; use its Zone ID." : "zone was not found in this courier company. Use the Zones sheet.");
    const zone = matches[0];
    if (name && zone.name.trim().toLowerCase() !== name.toLowerCase()) fail("Zone ID and Zone Name do not match.");
    if (country && zone.country_code !== country) fail("zone country does not match.");
    const service = key(get(row, "service_type"));
    if (!["same_day", "next_day", "standard"].includes(service)) fail("Service Type must be same_day, next_day or standard.");
    const rowCurrency = text(get(row, "currency")).toUpperCase() || currency;
    if (rowCurrency !== currency) fail(`currency must be ${currency}, this courier company's billing currency. No currency conversion is applied.`);
    const number = (column: string, decimals: number, max: number, fallback?: number): number => {
      const raw = text(get(row, column));
      if (!raw && fallback !== undefined) return fallback;
      if (!/^\d+(\.\d+)?$/.test(raw)) return fail(`${column} must be a non-negative number.`);
      const n = Number(raw), scale = 10 ** decimals;
      if (!Number.isFinite(n) || n > max || Math.abs(n * scale - Math.round(n * scale)) > 0.00001) return fail(`${column} allows up to ${decimals} decimal places and a maximum of ${max}.`);
      return n;
    };
    const enabled = text(get(row, "return_charge_enabled")).toLowerCase();
    if (!["", "true", "false", "yes", "no", "1", "0"].includes(enabled)) fail("Return Charge Enabled must be yes/no or true/false.");
    const returnEnabled = ["true", "yes", "1"].includes(enabled);
    const weightFrom = number("weight_from_kg", 3, 99999.999, 0);
    const weightTo = text(get(row, "weight_to_kg")) ? number("weight_to_kg", 3, 99999.999) : null;
    if (weightTo !== null && weightTo <= weightFrom) fail("Weight To KG must exceed Weight From KG; leave it blank for unlimited.");
    const returnRate = number("return_rate", 2, 9999999999.99, 0);
    if (!returnEnabled && returnRate > 0) fail("enable Return Charge before entering a Return Rate.");
    const duplicateKey = `${zone.id}:${service}:${rowCurrency}:${weightFrom}`;
    if (seen.has(duplicateKey)) fail("duplicate zone, service and weight-from tier. Keep one rate per tier.");
    seen.add(duplicateKey);
    result.push({ service_zone_id: zone.id, service_type: service as ImportedZoneRate["service_type"], currency: rowCurrency, delivery_rate: number("delivery_rate", 2, 9999999999.99), weight_from_kg: weightFrom, weight_to_kg: weightTo, additional_kg_rate: number("additional_kg_rate", 2, 9999999999.99, 0), cod_fee: number("cod_fee", 2, 9999999999.99, 0), return_charge_enabled: returnEnabled, return_rate: returnRate });
  }
  if (!result.length) throw new Error("No rate rows were found on the Zone Rates sheet.");
  return result;
}

export async function readZoneRateWorkbook(bytes: Buffer, zones: ImportZone[], currency: string, shipperId?: string) {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]); }
  catch { throw new Error("This file is not a readable Excel workbook. Use the .xlsx template."); }
  const account = workbook.getWorksheet("Account");
  if (account && shipperId && String(account.getCell("B1").value || "").trim() !== shipperId) throw new Error("This template belongs to a different shipper. Download the template from this shipper's Zone Rates page.");
  const sheet = workbook.getWorksheet("Zone Rates");
  if (!sheet) throw new Error('The workbook needs a sheet named "Zone Rates". Use the template.');
  if (sheet.rowCount > 5001 || sheet.columnCount > 30) throw new Error("The file exceeds 5,000 rows or contains too many columns.");
  const rows: unknown[][] = [];
  for (let i = 1; i <= sheet.rowCount; i++) {
    const cells: unknown[] = [];
    for (let j = 1; j <= sheet.columnCount; j++) {
      const cell = sheet.getRow(i).getCell(j);
      if (cell.type === ExcelJS.ValueType.Formula) throw new Error(`Row ${i}: paste values instead of Excel formulas.`);
      if (cell.value !== null && !["string", "number", "boolean"].includes(typeof cell.value)) throw new Error(`Row ${i}: use plain text and numbers only.`);
      cells.push(cell.value);
    }
    rows.push(cells);
  }
  return parseZoneRateRows(rows, zones, currency);
}
