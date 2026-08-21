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

export const bulkUploadMaxBytes = 20 * 1024 * 1024;
export const bulkUploadMaxRows = 5000;

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

export type BulkRowError = { row: number; field: string; message: string };
export type ParsedBulkShipment = { row: number; shipment: BulkShipmentInsert };
export type BulkParseResult =
  | { ok: true; rows: ParsedBulkShipment[] }
  | { ok: false; message: string; errors: BulkRowError[] };

type ParseOptions = { defaultCountryCode?: string; currency?: string };

function normalizeHeader(value: BulkCell | undefined) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s*\*\s*$/, "")
    .toLowerCase();
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
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.length === 0) quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("The CSV contains an unfinished quoted field.");
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
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

function numberValue(value: string) {
  if (!value) return Number.NaN;
  return Number(value.replace(/,/g, ""));
}

function requiredText(errors: BulkRowError[], row: number, field: BulkHeader, value: string, min: number, max: number) {
  if (value.length < min || value.length > max) {
    errors.push({ row, field, message: `Must contain ${min}–${max} characters.` });
    return false;
  }
  return true;
}

function optionalText(errors: BulkRowError[], row: number, field: BulkHeader, value: string, max: number, min = 1) {
  if (value && (value.length < min || value.length > max)) {
    errors.push({ row, field, message: `When provided, must contain ${min}–${max} characters.` });
    return false;
  }
  return true;
}

function country(value: string, fallback: string) {
  const code = (value || fallback).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

export async function parseBulkShipmentFile(file: File, options: ParseOptions = {}): Promise<BulkParseResult> {
  if (!file.name || file.size === 0) return { ok: false, message: "Choose a non-empty .xlsx or .csv file.", errors: [] };
  if (file.size > bulkUploadMaxBytes) return { ok: false, message: "The upload is larger than the 20 MB limit.", errors: [] };

  let rawRows: BulkCell[][];
  try {
    rawRows = await readRows(file);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The spreadsheet could not be read.", errors: [] };
  }

  const headerIndex = rawRows.slice(0, 10).findIndex((row) => {
    const values = new Set(row.map(normalizeHeader));
    return bulkShipmentHeaders.every((header) => values.has(header));
  });
  if (headerIndex === -1) return { ok: false, message: "The required universal header row was not found. Download a fresh template and keep the column names unchanged.", errors: [] };

  const headerMap = new Map<BulkHeader, number>();
  rawRows[headerIndex].forEach((value, index) => {
    const header = normalizeHeader(value) as BulkHeader;
    if ((bulkShipmentHeaders as readonly string[]).includes(header) && !headerMap.has(header)) headerMap.set(header, index);
  });

  const dataRows = rawRows
    .slice(headerIndex + 1)
    .map((cells, index) => ({ cells, row: headerIndex + index + 2 }))
    .filter(({ cells }) => bulkShipmentHeaders.some((header) => cellText(cells[headerMap.get(header)!]) !== ""));

  if (!dataRows.length) return { ok: false, message: "The file has no shipment rows below the header.", errors: [] };
  if (dataRows.length > bulkUploadMaxRows) return { ok: false, message: `This file contains ${dataRows.length} shipments. Upload no more than ${bulkUploadMaxRows} at a time.`, errors: [] };

  const defaultCountryCode = country(options.defaultCountryCode ?? "AE", "AE") || "AE";
  const currency = /^[A-Z]{3}$/.test(String(options.currency ?? "AED").toUpperCase()) ? String(options.currency).toUpperCase() : "AED";
  const errors: BulkRowError[] = [];
  const parsedRows: ParsedBulkShipment[] = [];
  const referenceRows = new Map<string, number>();

  for (const { cells, row } of dataRows) {
    const value = (field: BulkHeader) => cellText(cells[headerMap.get(field)!]);
    const referenceNumber = value("reference_number");
    const serviceType = value("service_type");
    const paymentType = value("payment_type");
    const senderCountry = country(value("sender_country_code"), defaultCountryCode);
    const consigneeCountry = country(value("consignee_country_code"), defaultCountryCode);
    const pieces = numberValue(value("pieces"));
    const weightKg = numberValue(value("weight_kg"));
    const codAmount = numberValue(value("cod_amount"));
    const rowErrorStart = errors.length;

    optionalText(errors, row, "reference_number", referenceNumber, 80);
    if (!serviceTypes.includes(serviceType as ServiceType)) errors.push({ row, field: "service_type", message: "Use same_day, next_day or standard." });
    if (!paymentTypes.includes(paymentType as PaymentType)) errors.push({ row, field: "payment_type", message: "Use cod or prepaid." });

    requiredText(errors, row, "sender_name", value("sender_name"), 2, 120);
    requiredText(errors, row, "sender_phone", value("sender_phone"), 7, 30);
    requiredText(errors, row, "sender_address", value("sender_address"), 3, 500);
    optionalText(errors, row, "sender_address_2", value("sender_address_2"), 200);
    requiredText(errors, row, "sender_city", value("sender_city"), 2, 120);
    optionalText(errors, row, "sender_state_province", value("sender_state_province"), 120);
    optionalText(errors, row, "sender_postal_code", value("sender_postal_code"), 30);
    if (!senderCountry) errors.push({ row, field: "sender_country_code", message: "Use a 2-letter country code such as CA, US or AE." });

    requiredText(errors, row, "consignee_name", value("consignee_name"), 2, 120);
    requiredText(errors, row, "consignee_phone", value("consignee_phone"), 7, 30);
    optionalText(errors, row, "consignee_alt_phone", value("consignee_alt_phone"), 30, 7);
    requiredText(errors, row, "consignee_address", value("consignee_address"), 3, 500);
    optionalText(errors, row, "consignee_address_2", value("consignee_address_2"), 200);
    requiredText(errors, row, "consignee_city", value("consignee_city"), 2, 120);
    optionalText(errors, row, "consignee_state_province", value("consignee_state_province"), 120);
    optionalText(errors, row, "consignee_postal_code", value("consignee_postal_code"), 30);
    if (!consigneeCountry) errors.push({ row, field: "consignee_country_code", message: "Use a 2-letter country code such as CA, US or AE." });
    if (["CA", "US"].includes(consigneeCountry) && !value("consignee_postal_code")) errors.push({ row, field: "consignee_postal_code", message: "Postal / ZIP code is required for CA and US shipments." });
    optionalText(errors, row, "consignee_area", value("consignee_area"), 120);
    optionalText(errors, row, "consignee_landmark", value("consignee_landmark"), 200);

    if (!Number.isInteger(pieces) || pieces < 1 || pieces > 999) errors.push({ row, field: "pieces", message: "Use a whole number from 1 to 999." });
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 1000) errors.push({ row, field: "weight_kg", message: "Use a number greater than 0 and no more than 1000." });
    requiredText(errors, row, "parcel_description", value("parcel_description"), 2, 500);
    if (!Number.isFinite(codAmount) || codAmount < 0 || codAmount > 9999999999) errors.push({ row, field: "cod_amount", message: "Use an amount from 0 to 9,999,999,999." });
    else if (paymentType === "prepaid" && codAmount !== 0) errors.push({ row, field: "cod_amount", message: "Prepaid shipments must have COD amount 0." });
    optionalText(errors, row, "delivery_instructions", value("delivery_instructions"), 500);

    if (referenceNumber) {
      const earlier = referenceRows.get(referenceNumber);
      if (earlier) errors.push({ row, field: "reference_number", message: `Duplicate of row ${earlier} in this file.` });
      else referenceRows.set(referenceNumber, row);
    }

    if (errors.length === rowErrorStart) {
      parsedRows.push({
        row,
        shipment: {
          reference_number: referenceNumber || null,
          service_type: serviceType as ServiceType,
          payment_type: paymentType as PaymentType,
          sender_name: value("sender_name"),
          sender_phone: value("sender_phone"),
          sender_address: value("sender_address"),
          sender_address_2: value("sender_address_2") || null,
          sender_city: value("sender_city"),
          sender_state_province: value("sender_state_province") || null,
          sender_postal_code: value("sender_postal_code") || null,
          sender_country_code: senderCountry,
          consignee_name: value("consignee_name"),
          consignee_phone: value("consignee_phone"),
          consignee_alt_phone: value("consignee_alt_phone") || null,
          consignee_address: value("consignee_address"),
          consignee_address_2: value("consignee_address_2") || null,
          consignee_city: value("consignee_city"),
          consignee_state_province: value("consignee_state_province") || null,
          consignee_postal_code: value("consignee_postal_code") || null,
          consignee_country_code: consigneeCountry,
          consignee_area: value("consignee_area") || null,
          consignee_landmark: value("consignee_landmark") || null,
          pieces,
          weight_kg: weightKg,
          parcel_description: value("parcel_description"),
          cod_amount: paymentType === "cod" ? codAmount : 0,
          delivery_instructions: value("delivery_instructions") || null,
          currency,
        },
      });
    }
  }

  if (errors.length) return { ok: false, message: `${errors.length} validation issue${errors.length === 1 ? "" : "s"} found. No shipments were imported.`, errors: errors.slice(0, 500) };
  return { ok: true, rows: parsedRows };
}
