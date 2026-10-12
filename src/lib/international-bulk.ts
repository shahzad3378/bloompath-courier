import type { BulkRowError, ParsedBulkShipment } from "@/lib/bulk-shipments";

export type InternationalMode = "air" | "sea";
export type InternationalCalculation = {
  row: number;
  referenceNumber: string | null;
  consignee: string;
  destinationCountry: string;
  mode: InternationalMode;
  pieces: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  actualWeightKg: number;
  volumeCbm: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  chargeableWm: number | null;
  hsCode: string | null;
};
export type PreparedInternationalRow = ParsedBulkShipment & {
  calculation: InternationalCalculation;
  shipmentFields: Record<string, string | number | null>;
};
export type InternationalPreparation =
  | { ok: true; rows: PreparedInternationalRow[] }
  | { ok: false; errors: BulkRowError[]; message: string };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedHeader(value: unknown) {
  return text(value).replace(/^\uFEFF/, "").replace(/\s*\*\s*$/, "").toLowerCase();
}

function round(value: number, places: number) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function prepareInternationalRows(
  parsedRows: ParsedBulkShipment[],
  rawRows: unknown[][],
  defaultCountryCode: string,
): InternationalPreparation {
  const errors: BulkRowError[] = [];
  const required = ["reference_number", "service_type", "payment_type", "sender_name", "sender_phone", "sender_address", "sender_city", "sender_country_code", "consignee_name", "consignee_phone", "consignee_address", "consignee_city", "consignee_country_code", "pieces", "weight_kg", "description", "value", "cod_amount"];
  const headerIndex = rawRows.slice(0, 10).findIndex((row) => {
    const values = new Set(row.map(normalizedHeader));
    return required.every((header) => values.has(header) || (header === "description" && values.has("parcel_description")));
  });
  if (headerIndex < 0) return { ok: false, errors: [], message: "The international template header row was not found. Download a fresh template." };

  const headers = rawRows[headerIndex].map(normalizedHeader);
  const index = (name: string) => {
    const alias = name === "description" && !headers.includes(name) ? "parcel_description" : name;
    return headers.indexOf(alias);
  };
  for (const field of ["transport_mode", "length_cm", "width_cm", "height_cm"]) {
    if (index(field) < 0) errors.push({ row: headerIndex + 1, field, message: "This column is required in the International Upload template." });
  }
  if (errors.length) return { ok: false, errors, message: "Download the International Upload template and keep all required columns." };

  const prepared: PreparedInternationalRow[] = [];
  for (const parsed of parsedRows) {
    const cells = rawRows[parsed.row - 1] ?? [];
    const read = (name: string) => text(cells[index(name)]);
    const modeText = read("transport_mode").toLowerCase();
    const mode = modeText === "air" || modeText === "sea" ? modeText : null;
    const lengthCm = Number(read("length_cm"));
    const widthCm = Number(read("width_cm"));
    const heightCm = Number(read("height_cm"));
    const hs = read("hscode");
    const rowErrors = errors.length;
    if (!mode) errors.push({ row: parsed.row, field: "transport_mode", message: "Choose air or sea." });
    for (const [field, value] of [["length_cm", lengthCm], ["width_cm", widthCm], ["height_cm", heightCm]] as const) {
      if (!Number.isFinite(value) || value <= 0 || value > 10000) errors.push({ row: parsed.row, field, message: "Enter a dimension greater than 0 and no more than 10,000 cm." });
    }
    if (hs && !/^[0-9]{4,10}$/.test(hs)) errors.push({ row: parsed.row, field: "hscode", message: "HS code must contain 4–10 digits." });
    if (parsed.shipment.sender_country_code === parsed.shipment.consignee_country_code) errors.push({ row: parsed.row, field: "consignee_country_code", message: "Sender and destination are in the same country. Use Local Bulk Upload." });
    if (errors.length !== rowErrors || !mode) continue;

    const cm3 = lengthCm * widthCm * heightCm * parsed.shipment.pieces;
    const volumeCbm = cm3 / 1_000_000;
    const volumetricWeightKg = mode === "air" ? cm3 / 6000 : cm3 / 1000;
    const chargeableWeightKg = Math.max(parsed.shipment.weight_kg, volumetricWeightKg);
    const chargeableWm = mode === "sea" ? Math.max(volumeCbm, parsed.shipment.weight_kg / 1000) : null;
    prepared.push({
      ...parsed,
      shipmentFields: {
        transport_mode: mode,
        length_cm: lengthCm,
        width_cm: widthCm,
        height_cm: heightCm,
        volume_cbm: round(volumeCbm, 4),
        volumetric_weight_kg: round(volumetricWeightKg, 2),
        chargeable_weight_kg: round(chargeableWeightKg, 2),
        chargeable_wm: chargeableWm === null ? null : round(chargeableWm, 3),
        hs_code: hs || null,
      },
      calculation: {
        row: parsed.row,
        referenceNumber: parsed.shipment.reference_number,
        consignee: parsed.shipment.consignee_name,
        destinationCountry: parsed.shipment.consignee_country_code,
        mode,
        pieces: parsed.shipment.pieces,
        lengthCm,
        widthCm,
        heightCm,
        actualWeightKg: parsed.shipment.weight_kg,
        volumeCbm: round(volumeCbm, 4),
        volumetricWeightKg: round(volumetricWeightKg, 2),
        chargeableWeightKg: round(chargeableWeightKg, 2),
        chargeableWm: chargeableWm === null ? null : round(chargeableWm, 3),
        hsCode: hs || null,
      },
    });
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 500), message: errors.length + " international upload issue" + (errors.length === 1 ? "" : "s") + " found. No shipments were imported." };
  return { ok: true, rows: prepared };
}
