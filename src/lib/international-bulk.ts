import type { BulkRowError, ParsedBulkShipment } from "@/lib/bulk-shipments";

export type InternationalMode = "air" | "sea";
const internationalUploadMaxAwbs = 5000;
export type InternationalCalculation = {
  row: number;
  referenceNumber: string | null;
  consignee: string;
  destinationCountry: string;
  mode: InternationalMode;
  pieces: number;
  pieceNumber: number;
  pieceCount: number;
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


export function splitInternationalWeight(totalKg: number, count: number) {
  const totalMilliKg = Math.round((totalKg + Number.EPSILON) * 1000);
  if (!Number.isInteger(count) || count < 1 || totalMilliKg < count) return null;
  const base = Math.floor(totalMilliKg / count);
  const remainder = totalMilliKg % count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 1000);
}

export function splitInternationalAmount(total: number, count: number) {
  const totalCents = Math.round((total + Number.EPSILON) * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

export function internationalPieceReference(reference: string | null, index: number, count: number) {
  if (!reference || count === 1) return reference;
  const suffix = `-P${index + 1}`;
  return reference.slice(0, 80 - suffix.length) + suffix;
}

export function calculateInternationalWeights(
  mode: InternationalMode,
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  pieces: number,
  actualWeightKg: number,
) {
  const cubicCentimetres = lengthCm * widthCm * heightCm * pieces;
  const volumeCbm = cubicCentimetres / 1_000_000;
  const volumetricWeightKg = mode === "air" ? cubicCentimetres / 6_000 : cubicCentimetres / 1_000;
  const chargeableWm = mode === "sea" ? Math.max(volumeCbm, actualWeightKg / 1_000) : null;

  return {
    volumeCbm: round(volumeCbm, 4),
    volumetricWeightKg: round(volumetricWeightKg, 2),
    chargeableWeightKg: round(Math.max(actualWeightKg, volumetricWeightKg), 2),
    chargeableWm: chargeableWm === null ? null : round(chargeableWm, 3),
  };
}

export function prepareInternationalRows(
  parsedRows: ParsedBulkShipment[],
  rawRows: unknown[][],
): InternationalPreparation {
  const errors: BulkRowError[] = [];
  const required = ["reference_number", "service_type", "payment_type", "sender_name", "sender_phone", "sender_address", "sender_city", "sender_country_code", "consignee_name", "consignee_phone", "consignee_address", "consignee_city", "consignee_country_code", "pieces", "weight_kg", "description", "value", "cod_amount"];
  const headerIndex = rawRows.slice(0, 10).findIndex((row) => {
    const values = new Set(row.map(normalizedHeader));
    return required.every((header) => values.has(header) || (header === "description" && values.has("parcel_description")));
  });
  if (headerIndex < 0) return { ok: false, errors: [], message: "The international template header row was not found. Download a fresh template." };

  const headers = rawRows[headerIndex].map(normalizedHeader);
  const customHeaderAliases: Record<string, string> = {
    "shipper address 3": "sender_address_3",
    address3: "consignee_address_3",
    "consignee email": "consignee_email",
    incoterm: "incoterms",
    "item quantity": "item_quantity",
    "item value": "item_value",
    "country of origin": "country_of_origin",
  };
  const normalizedHeaders = headers.map((header) => customHeaderAliases[header] ?? header);
  const index = (name: string) => {
    const alias = name === "description" && !normalizedHeaders.includes(name) ? "parcel_description" : name;
    return normalizedHeaders.indexOf(alias);
  };
  for (const field of ["transport_mode", "length_cm", "width_cm", "height_cm"]) {
    if (index(field) < 0) errors.push({ row: headerIndex + 1, field, message: "This column is required in the International Upload template." });
  }
  if (errors.length) return { ok: false, errors, message: "Download the International Upload template and keep all required columns." };

  const prepared: PreparedInternationalRow[] = [];
  const generatedReferences = new Map<string, number>();
  let generatedCount = 0;
  for (const parsed of parsedRows) {
    const cells = rawRows[parsed.row - 1] ?? [];
    const read = (name: string) => text(cells[index(name)]);
    const modeText = read("transport_mode").toLowerCase();
    const mode = modeText === "air" || modeText === "sea" ? modeText : null;
    const lengthCm = Number(read("length_cm"));
    const widthCm = Number(read("width_cm"));
    const heightCm = Number(read("height_cm"));
    const hs = read("hscode");
    const consigneeEmail = read("consignee_email");
    const incoterms = read("incoterms");
    const itemQuantityText = read("item_quantity");
    const itemQuantity = itemQuantityText ? Number(itemQuantityText.replace(/,/g, "")) : null;
    const itemValueText = read("item_value");
    const itemValue = itemValueText ? Number(itemValueText.replace(/,/g, "")) : null;
    const countryOfOrigin = read("country_of_origin").toUpperCase();
    const customsCurrency = read("currency").toUpperCase();
    const senderAddress3 = read("sender_address_3");
    const consigneeAddress3 = read("consignee_address_3");
    const pieces = parsed.shipment.pieces;
    const rowErrors = errors.length;
    if (!mode) errors.push({ row: parsed.row, field: "transport_mode", message: "Choose air or sea." });
    for (const [field, value] of [["length_cm", lengthCm], ["width_cm", widthCm], ["height_cm", heightCm]] as const) {
      if (!Number.isFinite(value) || value <= 0 || value > 10000) errors.push({ row: parsed.row, field, message: "Enter a dimension greater than 0 and no more than 10,000 cm." });
    }
    if (hs && !/^[0-9]{4,10}$/.test(hs)) errors.push({ row: parsed.row, field: "hscode", message: "HS code must contain 4–10 digits." });
    if (consigneeEmail.length > 254 || (consigneeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(consigneeEmail))) errors.push({ row: parsed.row, field: "consignee_email", message: "Enter a valid consignee email address." });
    if (incoterms.length > 20) errors.push({ row: parsed.row, field: "incoterms", message: "Incoterms must contain no more than 20 characters." });
    if (senderAddress3.length > 200) errors.push({ row: parsed.row, field: "sender_address_3", message: "Shipper Address 3 must contain no more than 200 characters." });
    if (consigneeAddress3.length > 200) errors.push({ row: parsed.row, field: "consignee_address_3", message: "Address3 must contain no more than 200 characters." });
    if (itemQuantityText && (!Number.isSafeInteger(itemQuantity) || itemQuantity! < pieces)) errors.push({ row: parsed.row, field: "item_quantity", message: "Enter a whole item quantity at least equal to the number of pieces." });
    if (itemValueText && (!Number.isFinite(itemValue) || itemValue! < 0)) errors.push({ row: parsed.row, field: "item_value", message: "Enter a non-negative item value." });
    if (countryOfOrigin && !/^[A-Z]{2}$/.test(countryOfOrigin)) errors.push({ row: parsed.row, field: "country_of_origin", message: "Use a two-letter country code such as NP or AE." });
    if (customsCurrency && !/^[A-Z]{3}$/.test(customsCurrency)) errors.push({ row: parsed.row, field: "currency", message: "Use a three-letter currency code such as CAD or USD." });
    if (parsed.shipment.sender_country_code === parsed.shipment.consignee_country_code) errors.push({ row: parsed.row, field: "consignee_country_code", message: "Sender and destination are in the same country. Use Local Bulk Upload." });
    if (errors.length !== rowErrors || !mode) continue;

    const pieceWeights = splitInternationalWeight(parsed.shipment.weight_kg, pieces);
    if (!pieceWeights) {
      errors.push({ row: parsed.row, field: "weight_kg", message: "Total weight must be at least 0.001 kg per bag so each AWB has a positive weight." });
      continue;
    }
    generatedCount += pieces;
    if (generatedCount > internationalUploadMaxAwbs) {
      errors.push({ row: parsed.row, field: "pieces", message: "This upload creates more than " + internationalUploadMaxAwbs + " AWBs. Reduce the piece count or split the file." });
      break;
    }
    const pieceValues = splitInternationalAmount(parsed.shipment.declared_value, pieces);
    const pieceItemValues = splitInternationalAmount(itemValue ?? parsed.shipment.weight_kg, pieces);
    const pieceCod = splitInternationalAmount(parsed.shipment.cod_amount, pieces);
    for (let pieceIndex = 0; pieceIndex < pieces; pieceIndex += 1) {
      const referenceNumber = internationalPieceReference(parsed.shipment.reference_number, pieceIndex, pieces);
      if (referenceNumber) {
        const earlier = generatedReferences.get(referenceNumber);
        if (earlier) {
          errors.push({ row: parsed.row, field: "reference_number", message: "Generated piece reference " + referenceNumber + " conflicts with row " + earlier + " in this file." });
          continue;
        }
        generatedReferences.set(referenceNumber, parsed.row);
      }
      const weights = calculateInternationalWeights(mode, lengthCm, widthCm, heightCm, 1, pieceWeights[pieceIndex]);
      prepared.push({
        ...parsed,
        shipment: {
          ...parsed.shipment,
          reference_number: referenceNumber,
          pieces: 1,
          weight_kg: pieceWeights[pieceIndex],
          declared_value: pieceValues[pieceIndex],
          cod_amount: pieceCod[pieceIndex],
        },
        shipmentFields: {
          transport_mode: mode,
          length_cm: lengthCm,
          width_cm: widthCm,
          height_cm: heightCm,
          volume_cbm: weights.volumeCbm,
          volumetric_weight_kg: weights.volumetricWeightKg,
          chargeable_weight_kg: weights.chargeableWeightKg,
          chargeable_wm: weights.chargeableWm,
          hs_code: hs || null,
          sender_address_3: senderAddress3 || null,
          consignee_address_3: consigneeAddress3 || null,
          consignee_email: consigneeEmail || null,
          incoterms: incoterms || null,
          item_quantity: itemQuantity === null ? 1 : Math.floor(itemQuantity / pieces) + (pieceIndex < itemQuantity % pieces ? 1 : 0),
          item_value: itemValue === null && parsed.shipment.consignee_country_code !== "CA" ? null : pieceItemValues[pieceIndex],
          country_of_origin: countryOfOrigin || parsed.shipment.sender_country_code,
          currency: customsCurrency || (parsed.shipment.consignee_country_code === "CA" ? "CAD" : parsed.shipment.currency),
        },
        calculation: {
          row: parsed.row,
          referenceNumber,
          consignee: parsed.shipment.consignee_name,
          destinationCountry: parsed.shipment.consignee_country_code,
          mode,
          pieces: 1,
          pieceNumber: pieceIndex + 1,
          pieceCount: pieces,
          lengthCm,
          widthCm,
          heightCm,
          actualWeightKg: pieceWeights[pieceIndex],
          volumeCbm: weights.volumeCbm,
          volumetricWeightKg: weights.volumetricWeightKg,
          chargeableWeightKg: weights.chargeableWeightKg,
          chargeableWm: weights.chargeableWm,
          hsCode: hs || null,
        },
      });
    }
  }
    if (errors.length) return { ok: false, errors: errors.slice(0, 500), message: errors.length + " international upload issue" + (errors.length === 1 ? "" : "s") + " found. No shipments were imported." };
  return { ok: true, rows: prepared };
}
