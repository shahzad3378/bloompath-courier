import { readSheet, type CellValue } from "read-excel-file/node";
import { paymentTypes, serviceTypes, type PaymentType, type ServiceType } from "@/lib/shipments";

export const bulkShipmentHeaders = [
  "reference_number",
  "service_type",
  "payment_type",
  "sender_name",
  "sender_phone",
  "sender_address",
  "sender_address_2",
  "sender_city",
  "sender_state_province",
  "sender_postal_code",
  "sender_country_code",
  "consignee_name",
  "consignee_phone",
  "consignee_alt_phone",
  "consignee_address",
  "consignee_address_2",
  "consignee_city",
  "consignee_state_province",
  "consignee_postal_code",
  "consignee_country_code",
  "consignee_area",
  "consignee_landmark",
  "pieces",
  "weight_kg",
  "parcel_description",
  "cod_amount",
  "delivery_instructions",
] as const;

export const bulkUploadMaxBytes = 5 * 1024 * 1024;
export const bulkUploadMaxRows = 500;

type BulkHeader = (typeof bulkShipmentHeaders)[number];
type BulkCell = CellValue | null;

export type BulkShipmentInsert = {
  reference_number: string | null;
  service_type: ServiceType;
  payment_type: PaymentType;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  sender_address_2: string | null;
  sender_city: string;
  sender_state_province: string | null;
  sender_postal_code: string | null;
  sender_country_code: string;
  consignee_name: string;
  consignee_phone: string;
  consignee_alt_phone: string | null;
  consignee_address: string;
  consignee_address_2: string | null;
  consignee_city: string;
  consignee_state_province: string | null;
  consignee_postal_code: string | null;
  consignee_country_code: string;
  consignee_area: string | null;
  consignee_landmark: string | null;
  pieces: number;
  weight_kg: number;
  parcel_description: string;
  cod_amount: number;
  delivery_instructions: string | null;
  currency: string;
};

export type BulkRowError = {
  row: number;
  field: string;
  message: string;
};

export type ParsedBulkShipment = {
  row: number;
  shipment: BulkShipmentInsert;
};

export type BulkParseResult =
  | { ok: true; rows: ParsedBulkShipment[] }
  | { ok: false; message: string; errors: BulkRowError[] };

export type BulkImportContext = {
  defaultCountryCode: string;
  currency: string;
};

function normalizeHeader(value: BulkCell | undefined) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s*\*\s*$/, "")
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");
}

const headerAliases: Record<string, BulkHeader> = {
  reference: "reference_number",
  reference_no: "reference_number",
  order_number: "reference_number",
  shipment_number: "reference_number",
  address_1: "consignee_address",
  address1: "consignee_address",
  address_2: "consignee_address_2",
  address2: "consignee_address_2",
  recipient_name: "consignee_name",
  recipient_phone: "consignee_phone",
  phone: "consignee_phone",
  city: "consignee_city",
  province: "consignee_state_province",
  state: "consignee_state_province",
  province_state: "consignee_state_province",
  postal_code: "consignee_postal_code",
  postcode: "consignee_postal_code",
  zip: "consignee_postal_code",
  zip_code: "consignee_postal_code",
  country: "consignee_country_code",
  country_code: "consignee_country_code",
  description: "parcel_description",
  weight: "weight_kg",
  cod: "cod_amount",
};

function canonicalHeader(value: BulkCell | undefined): BulkHeader | null {
  const normalized = normalizeHeader(value);
  if ((bulkShipmentHeaders as readonly string[]).includes(normalized)) {
    return normalized as BulkHeader;
  }
  return headerAliases[normalized] ?? null;
}

function cellText(value: BulkCell | undefined) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function parseCsv(text: string): BulkCell[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("The CSV contains an unfinished quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function addTextError(errors: BulkRowError[], row: number, field: BulkHeader, value: string, min: number, max: number) {
  if (value.length < min || value.length > max) {
    errors.push({ row, field, message: `Must contain ${min}–${max} characters.` });
    return false;
  }
  return true;
}

function addOptionalTextError(errors: BulkRowError[], row: number, field: BulkHeader, value: string, max: number, min = 1) {
  if (value && (value.length < min || value.length > max)) {
    errors.push({ row, field, message: `When provided, must contain ${min}–${max} characters.` });
    return false;
  }
  return true;
}

function numberValue(value: string) {
  if (!value) return Number.NaN;
  return Number(value.replace(/,/g, ""));
}

function countryCode(value: string, fallback: string) {
  const normalized = (value || fallback).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
}

function postalCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

async function readRows(file: File): Promise<BulkCell[][]> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return parseCsv(await file.text());
  if (extension === "xlsx") {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      return await readSheet(buffer, "Bulk Upload");
    } catch {
      return readSheet(buffer, 1);
    }
  }
  throw new Error("Only .xlsx and .csv files are accepted.");
}

export async function parseBulkShipmentFile(file: File, context: BulkImportContext): Promise<BulkParseResult> {
  if (!file.name || file.size === 0) return { ok: false, message: "Choose a non-empty .xlsx or .csv file.", errors: [] };
  if (file.size > bulkUploadMaxBytes) return { ok: false, message: "The upload is larger than the 5 MB limit.", errors: [] };

  let rawRows: BulkCell[][];
  try {
    rawRows = await readRows(file);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The spreadsheet could not be read.", errors: [] };
  }

  const minimumRequired = ["consignee_name", "consignee_phone", "consignee_address", "consignee_city"] as const;
  const headerIndex = rawRows.slice(0, 10).findIndex((row) => {
    const values = new Set(row.map(canonicalHeader).filter(Boolean));
    return minimumRequired.every((header) => values.has(header));
  });

  if (headerIndex === -1) {
    return {
      ok: false,
      message: "A supported header row was not found. Download the universal template and keep its column names unchanged.",
      errors: [],
    };
  }

  const headerMap = new Map<BulkHeader, number>();
  rawRows[headerIndex].forEach((value, index) => {
    const header = canonicalHeader(value);
    if (header && !headerMap.has(header)) headerMap.set(header, index);
  });

  const valueAt = (cells: BulkCell[], field: BulkHeader) => {
    const index = headerMap.get(field);
    return index === undefined ? "" : cellText(cells[index]);
  };

  const dataRows = rawRows
    .slice(headerIndex + 1)
    .map((cells, index) => ({ cells, row: headerIndex + index + 2 }))
    .filter(({ cells }) => Array.from(headerMap.keys()).some((header) => valueAt(cells, header) !== ""));

  if (dataRows.length === 0) return { ok: false, message: "The file has no shipment rows below the header.", errors: [] };
  if (dataRows.length > bulkUploadMaxRows) return { ok: false, message: `This file contains ${dataRows.length} shipments. Upload no more than ${bulkUploadMaxRows} at a time.`, errors: [] };

  const errors: BulkRowError[] = [];
  const parsedRows: ParsedBulkShipment[] = [];
  const referenceRows = new Map<string, number>();

  for (const { cells, row } of dataRows) {
    const value = (field: BulkHeader) => valueAt(cells, field);
    const referenceNumber = value("reference_number");
    const serviceType = value("service_type") || "standard";
    const paymentType = value("payment_type") || (numberValue(value("cod_amount") || "0") > 0 ? "cod" : "prepaid");
    const senderName = value("sender_name") || "Shipper";
    const senderPhone = value("sender_phone") || "0000000";
    const senderAddress = value("sender_address") || "Shipper address";
    const senderAddress2 = value("sender_address_2");
    const senderCity = value("sender_city") || value("consignee_city");
    const senderStateProvince = value("sender_state_province");
    const senderPostalCode = postalCode(value("sender_postal_code"));
    const senderCountryCode = countryCode(value("sender_country_code"), context.defaultCountryCode);
    const consigneeName = value("consignee_name");
    const consigneePhone = value("consignee_phone");
    const consigneeAltPhone = value("consignee_alt_phone");
    const consigneeAddress = value("consignee_address");
    const consigneeAddress2 = value("consignee_address_2");
    const consigneeCity = value("consignee_city");
    const consigneeStateProvince = value("consignee_state_province");
    const consigneePostalCode = postalCode(value("consignee_postal_code"));
    const consigneeCountryCode = countryCode(value("consignee_country_code"), context.defaultCountryCode);
    const consigneeArea = value("consignee_area");
    const consigneeLandmark = value("consignee_landmark");
    const pieces = numberValue(value("pieces") || "1");
    const weightKg = numberValue(value("weight_kg") || "1");
    const parcelDescription = value("parcel_description") || "Parcel";
    const codAmount = numberValue(value("cod_amount") || "0");
    const deliveryInstructions = value("delivery_instructions");
    const rowErrorStart = errors.length;

    addOptionalTextError(errors, row, "reference_number", referenceNumber, 80);
    if (!serviceTypes.includes(serviceType as ServiceType)) errors.push({ row, field: "service_type", message: "Use same_day, next_day or standard." });
    if (!paymentTypes.includes(paymentType as PaymentType)) errors.push({ row, field: "payment_type", message: "Use cod or prepaid." });
    addTextError(errors, row, "sender_name", senderName, 2, 120);
    addTextError(errors, row, "sender_phone", senderPhone, 7, 30);
    addTextError(errors, row, "sender_address", senderAddress, 5, 500);
    addTextError(errors, row, "sender_city", senderCity, 2, 120);
    if (!senderCountryCode) errors.push({ row, field: "sender_country_code", message: "Use a 2-letter ISO country code such as CA, US or AE." });
    addTextError(errors, row, "consignee_name", consigneeName, 2, 120);
    addTextError(errors, row, "consignee_phone", consigneePhone, 7, 30);
    addOptionalTextError(errors, row, "consignee_alt_phone", consigneeAltPhone, 30, 7);
    addTextError(errors, row, "consignee_address", consigneeAddress, 3, 500);
    addTextError(errors, row, "consignee_city", consigneeCity, 2, 120);
    if (!consigneeCountryCode) errors.push({ row, field: "consignee_country_code", message: "Use a 2-letter ISO country code such as CA, US or AE." });
    if (["CA", "US"].includes(consigneeCountryCode) && !consigneePostalCode) {
      errors.push({ row, field: "consignee_postal_code", message: "Postal/ZIP code is required for Canada and the United States." });
    }
    addOptionalTextError(errors, row, "consignee_postal_code", consigneePostalCode, 20);
    addOptionalTextError(errors, row, "consignee_state_province", consigneeStateProvince, 100);
    addOptionalTextError(errors, row, "consignee_area", consigneeArea, 120);
    addOptionalTextError(errors, row, "consignee_landmark", consigneeLandmark, 200);
    if (!Number.isInteger(pieces) || pieces < 1 || pieces > 999) errors.push({ row, field: "pieces", message: "Use a whole number from 1 to 999." });
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 1000) errors.push({ row, field: "weight_kg", message: "Use a number greater than 0 and no more than 1000." });
    if (!Number.isFinite(codAmount) || codAmount < 0 || codAmount > 9999999999) errors.push({ row, field: "cod_amount", message: "Use an amount from 0 to 9,999,999,999." });
    else if (paymentType === "prepaid" && codAmount !== 0) errors.push({ row, field: "cod_amount", message: "Prepaid shipments must have COD amount 0." });
    addOptionalTextError(errors, row, "delivery_instructions", deliveryInstructions, 500);

    if (referenceNumber) {
      const earlierRow = referenceRows.get(referenceNumber);
      if (earlierRow) errors.push({ row, field: "reference_number", message: `Duplicate of row ${earlierRow} in this file.` });
      else referenceRows.set(referenceNumber, row);
    }

    if (errors.length === rowErrorStart) {
      parsedRows.push({
        row,
        shipment: {
          reference_number: referenceNumber || null,
          service_type: serviceType as ServiceType,
          payment_type: paymentType as PaymentType,
          sender_name: senderName,
          sender_phone: senderPhone,
          sender_address: senderAddress,
          sender_address_2: senderAddress2 || null,
          sender_city: senderCity,
          sender_state_province: senderStateProvince || null,
          sender_postal_code: senderPostalCode || null,
          sender_country_code: senderCountryCode,
          consignee_name: consigneeName,
          consignee_phone: consigneePhone,
          consignee_alt_phone: consigneeAltPhone || null,
          consignee_address: consigneeAddress,
          consignee_address_2: consigneeAddress2 || null,
          consignee_city: consigneeCity,
          consignee_state_province: consigneeStateProvince || null,
          consignee_postal_code: consigneePostalCode || null,
          consignee_country_code: consigneeCountryCode,
          consignee_area: consigneeArea || null,
          consignee_landmark: consigneeLandmark || null,
          pieces,
          weight_kg: weightKg,
          parcel_description: parcelDescription,
          cod_amount: paymentType === "cod" ? codAmount : 0,
          delivery_instructions: deliveryInstructions || null,
          currency: context.currency,
        },
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, message: `${errors.length} validation issue${errors.length === 1 ? "" : "s"} found. No shipments were imported.`, errors: errors.slice(0, 200) };
  }
  return { ok: true, rows: parsedRows };
}
