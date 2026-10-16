import "server-only";

import { readSheet, type CellValue } from "read-excel-file/node";

type Cell = CellValue | null | undefined;
export type CarrierRateGridInput = {
  service_code: string;
  origin_terminal: string;
  zone_code: string;
  weight_value: number;
  weight_unit: "kg" | "lb";
  base_rate: number;
  fuel_surcharge_pct: number;
};
export type CarrierPostalZoneInput = {
  service_code: string;
  origin_terminal: string;
  postal_code: string;
  zone_code: string;
};
export type ParsedCarrierRateWorkbook = {
  grid: CarrierRateGridInput[];
  postalZones: CarrierPostalZoneInput[];
  countryCode: string;
  currency: string;
  cardName: string;
  effectiveFrom: string;
};

export const carrierRateMaxBytes = 5 * 1024 * 1024;
const maxPostalMappings = 400_000;
const maxGridRows = 100_000;

function cellText(value: Cell) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberValue(value: Cell) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value.replace(/[$,]/g, "").trim());
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function headerKey(value: Cell) {
  return cellText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function requiredText(value: Cell, name: string, max = 120) {
  const text = cellText(value);
  if (!text || text.length > max) throw new Error(`${name} is missing or too long.`);
  return text;
}

function normalizePostal(value: Cell) {
  const postal = cellText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{3,10}$/.test(postal)) return "";
  return postal;
}

async function readNamedSheet(buffer: Buffer, name: string) {
  try {
    return await readSheet(buffer, name);
  } catch {
    return null;
  }
}

function addMatrixRows(
  target: CarrierRateGridInput[],
  rows: Cell[][],
  serviceCode: string,
  expectedUnit: "kg" | "lb",
  fuelPct: number,
  originTerminals: string[],
) {
  const headerIndex = rows.findIndex((row) => headerKey(row[0]).startsWith("weight"));
  if (headerIndex < 0) throw new Error(`${serviceCode}: the weight/rate header row was not found.`);
  const header = rows[headerIndex];
  const zones = header.slice(1).map((value) => cellText(value));
  if (!zones.length || zones.some((zone) => !zone || zone.length > 30)) throw new Error(`${serviceCode}: one or more zone columns are invalid.`);
  let weightRows = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const weight = numberValue(row[0]);
    if (weight === null) {
      if (cellText(row[0])) throw new Error(`${serviceCode}: invalid weight value "${cellText(row[0])}".`);
      continue;
    }
    if (weight <= 0 || weight > 1000) throw new Error(`${serviceCode}: weight must be between 0 and 1,000.`);
    weightRows += 1;
    zones.forEach((zone, zoneIndex) => {
      const rate = numberValue(row[zoneIndex + 1]);
      if (rate === null) return;
      if (rate < 0 || rate > 1_000_000) throw new Error(`${serviceCode}: invalid rate for zone ${zone}.`);
      for (const origin of originTerminals) {
        target.push({ service_code: serviceCode, origin_terminal: origin, zone_code: zone, weight_value: weight, weight_unit: expectedUnit, base_rate: rate, fuel_surcharge_pct: fuelPct });
      }
    });
  }
  if (!weightRows) throw new Error(`${serviceCode}: no rate rows were found.`);
}

function parseGenericGrid(rows: Cell[][]): CarrierRateGridInput[] {
  if (rows.length < 2) throw new Error("Rate Grid sheet must include a header and at least one rate row.");
  const headers = rows[0].map(headerKey);
  const col = (name: string, aliases: string[] = []) => {
    const index = headers.findIndex((item) => [name, ...aliases].includes(item));
    if (index < 0) throw new Error(`Rate Grid is missing the "${name}" column.`);
    return index;
  };
  const service = col("service", ["service_code", "service_name"]);
  const origin = headers.findIndex((item) => ["origin", "origin_terminal", "terminal"].includes(item));
  const zone = col("zone", ["zone_code"]);
  const weight = col("weight", ["billable_weight", "weight_value"]);
  const unit = col("weight_unit", ["unit"]);
  const rate = col("base_rate", ["rate", "price"]);
  const fuel = headers.findIndex((item) => ["fuel_surcharge_percent", "fuel_surcharge_pct", "fuel_percent"].includes(item));
  const result: CarrierRateGridInput[] = [];
  for (const row of rows.slice(1)) {
    if (!row.some((value) => cellText(value))) continue;
    const unitValue = cellText(row[unit]).toLowerCase();
    if (unitValue !== "kg" && unitValue !== "lb" && unitValue !== "lbs") throw new Error(`Invalid weight unit on Rate Grid row ${rows.indexOf(row) + 1}. Use kg or lb.`);
    const weightValue = numberValue(row[weight]);
    const baseRate = numberValue(row[rate]);
    const fuelValue = fuel >= 0 ? numberValue(row[fuel]) ?? 0 : 0;
    if (weightValue === null || weightValue <= 0 || baseRate === null || baseRate < 0 || fuelValue < 0 || fuelValue > 1000) throw new Error(`Invalid weight, base rate or fuel surcharge on Rate Grid row ${rows.indexOf(row) + 1}.`);
    result.push({
      service_code: requiredText(row[service], `Service on row ${rows.indexOf(row) + 1}`),
      origin_terminal: origin >= 0 && cellText(row[origin]) ? requiredText(row[origin], "Origin terminal", 20).toUpperCase() : "ANY",
      zone_code: requiredText(row[zone], `Zone on row ${rows.indexOf(row) + 1}`, 30),
      weight_value: weightValue,
      weight_unit: unitValue === "lbs" ? "lb" : unitValue,
      base_rate: baseRate,
      fuel_surcharge_pct: fuelValue,
    });
  }
  return result;
}

function parseGenericZoneMap(rows: Cell[][]): CarrierPostalZoneInput[] {
  if (rows.length < 2) throw new Error("Zone Map sheet must include a header and at least one postal mapping.");
  const headers = rows[0].map(headerKey);
  const col = (names: string[]) => {
    const index = headers.findIndex((item) => names.includes(item));
    if (index < 0) throw new Error(`Zone Map is missing the "${names[0]}" column.`);
    return index;
  };
  const postal = col(["postal_code", "postal", "postcode", "zip", "zip_code"]);
  const service = col(["service", "service_code", "service_name"]);
  const origin = headers.findIndex((item) => ["origin", "origin_terminal", "terminal"].includes(item));
  const zone = col(["zone", "zone_code"]);
  const result: CarrierPostalZoneInput[] = [];
  for (const row of rows.slice(1)) {
    if (!row.some((value) => cellText(value))) continue;
    const postalCode = normalizePostal(row[postal]);
    if (!postalCode) throw new Error(`Invalid postal code on Zone Map row ${rows.indexOf(row) + 1}.`);
    result.push({
      service_code: requiredText(row[service], `Service on row ${rows.indexOf(row) + 1}`),
      origin_terminal: origin >= 0 && cellText(row[origin]) ? requiredText(row[origin], "Origin terminal", 20).toUpperCase() : "ANY",
      postal_code: postalCode,
      zone_code: requiredText(row[zone], `Zone on row ${rows.indexOf(row) + 1}`, 30),
    });
  }
  return result;
}

export async function parseCarrierRateWorkbook(file: File, metadata: { countryCode: string; currency: string; cardName: string; effectiveFrom: string }): Promise<ParsedCarrierRateWorkbook> {
  if (!file.size || file.size > carrierRateMaxBytes || !/\.xlsx$/i.test(file.name)) throw new Error("Choose an .xlsx carrier rate workbook up to 5 MB.");
  const countryCode = metadata.countryCode.trim().toUpperCase();
  const currency = metadata.currency.trim().toUpperCase();
  const cardName = metadata.cardName.trim();
  if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z]{3}$/.test(currency) || cardName.length < 2 || cardName.length > 160 || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.effectiveFrom)) throw new Error("Review the country, currency, rate card name and effective date.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const grid: CarrierRateGridInput[] = [];
  const postalZones: CarrierPostalZoneInput[] = [];

  const canadaPost = await readNamedSheet(buffer, "Canada Post");
  const regionalCanada = await readNamedSheet(buffer, "Regional Canada");
  const zones = await readNamedSheet(buffer, "Zones");
  if (canadaPost && regionalCanada && zones) {
    // The supplied Broad Reach workbook has three induction origins. The same
    // zone tariff grid applies at each origin; its separate Zones tab maps postal codes.
    const origins = ["YYZ", "YVR", "YYC"];
    addMatrixRows(grid, canadaPost as Cell[][], "Canada Post Expedited", "kg", 36.5, origins);
    addMatrixRows(grid, regionalCanada as Cell[][], "Regional Canada", "lb", 12, origins);
    const originHeader = zones[1] ?? [];
    const serviceHeader = zones[2] ?? [];
    const mappingColumns = [2, 3, 4, 5, 6, 7];
    for (const row of zones.slice(3)) {
      const postalCode = normalizePostal(row[1]);
      if (!postalCode) continue;
      for (const column of mappingColumns) {
        const zoneCode = cellText(row[column]);
        if (!zoneCode) continue;
        const origin = requiredText(originHeader[column], "Origin terminal", 20).toUpperCase();
        const service = cellText(serviceHeader[column]).toLowerCase();
        const serviceCode = service === "regional" ? "Regional Canada" : service === "canada post" ? "Canada Post Expedited" : "";
        if (!serviceCode) throw new Error(`Zones sheet has an unsupported service in column ${column + 1}.`);
        postalZones.push({ service_code: serviceCode, origin_terminal: origin, postal_code: postalCode, zone_code: zoneCode });
      }
    }
  } else {
    const genericGrid = await readNamedSheet(buffer, "Rate Grid");
    const genericZones = await readNamedSheet(buffer, "Zone Map");
    if (!genericGrid || !genericZones) throw new Error("Use the Broad Reach workbook tabs (Canada Post, Regional Canada, Zones) or the BloomPath template tabs (Rate Grid, Zone Map).");
    grid.push(...parseGenericGrid(genericGrid as Cell[][]));
    postalZones.push(...parseGenericZoneMap(genericZones as Cell[][]));
  }

  if (!grid.length) throw new Error("No carrier rates were found in the workbook.");
  if (grid.length > maxGridRows) throw new Error(`Workbook contains more than ${maxGridRows.toLocaleString()} rate rows.`);
  if (postalZones.length > maxPostalMappings) throw new Error(`Workbook contains more than ${maxPostalMappings.toLocaleString()} postal zone mappings.`);
  const uniqueGrid = new Set(grid.map((row) => [row.service_code, row.origin_terminal, row.zone_code, row.weight_value, row.weight_unit].join("\u0000")));
  const uniqueZones = new Set(postalZones.map((row) => [row.service_code, row.origin_terminal, row.postal_code].join("\u0000")));
  if (uniqueGrid.size !== grid.length) throw new Error("Rate Grid contains duplicate service/origin/zone/weight combinations.");
  if (uniqueZones.size !== postalZones.length) throw new Error("Zone Map contains duplicate service/origin/postal code mappings.");
  return { grid, postalZones, countryCode, currency, cardName, effectiveFrom: metadata.effectiveFrom };
}
