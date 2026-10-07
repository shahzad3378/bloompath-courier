import "server-only";

import { readSheet, type CellValue } from "read-excel-file/node";

export const threePLUpdateStatuses = [
  "in_transit",
  "out_for_delivery",
  "delivered",
  "undelivered",
  "return_initiated",
  "return_in_transit",
  "returned_to_warehouse",
  "returned_to_shipper",
] as const;

export const threePLUndeliveredReasons = [
  "customer_unavailable",
  "customer_refused",
  "customer_cancelled",
  "wrong_address",
  "phone_unreachable",
  "reschedule_requested",
  "cash_not_ready",
  "restricted_access",
  "out_of_coverage",
  "address_closed",
  "no_response",
  "other",
] as const;

export const threePLReturnReasons = [
  "attempts_exhausted",
  "customer_cancelled",
  "customer_refused",
  "no_response",
  "wrong_address",
  "out_of_coverage",
  "damaged",
  "carrier_issue",
  "other",
] as const;

export type ThreePLUpdateStatus = (typeof threePLUpdateStatuses)[number];
export type ThreePLUndeliveredReason = (typeof threePLUndeliveredReasons)[number];
export type ThreePLReturnReason = (typeof threePLReturnReasons)[number];

export const bulkThreePLStatusHeaders = [
  "tracking_number",
  "status",
  "attempt_number",
  "undelivered_reason",
  "return_reason",
  "internal_notes",
] as const;

export const bulkThreePLStatusMaxBytes = 5 * 1024 * 1024;
export const bulkThreePLStatusMaxRows = 500;

type BulkHeader = (typeof bulkThreePLStatusHeaders)[number];
type BulkCell = CellValue | null;

export type ThreePLStatusInput = {
  trackingNumber: string;
  status: ThreePLUpdateStatus;
  attemptNumber: number | null;
  undeliveredReason: ThreePLUndeliveredReason | null;
  returnReason: ThreePLReturnReason | null;
  internalNotes: string | null;
};

export type BulkThreePLRowError = {
  row: number;
  field: string;
  message: string;
};

export type ParsedBulkThreePLStatus = {
  row: number;
  update: ThreePLStatusInput;
};

export type BulkThreePLParseResult =
  | { ok: true; rows: ParsedBulkThreePLStatus[] }
  | { ok: false; message: string; errors: BulkThreePLRowError[] };

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

function normalizeCode(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
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

async function readRows(file: File): Promise<BulkCell[][]> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return parseCsv(await file.text());
  if (extension === "xlsx") {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      return await readSheet(buffer, "3PL Status Updates");
    } catch {
      return readSheet(buffer, 1);
    }
  }
  throw new Error("Only .xlsx and .csv files are accepted.");
}

export function validateThreePLStatusInput(input: ThreePLStatusInput) {
  if (!/^[A-Z0-9][A-Z0-9-]{1,79}$/i.test(input.trackingNumber) || input.trackingNumber.length > 80) {
    return "Enter a valid courier AWB.";
  }
  if (!(threePLUpdateStatuses as readonly string[]).includes(input.status)) {
    return "Select a valid 3PL status.";
  }
  if (input.attemptNumber !== null && (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1 || input.attemptNumber > 3)) {
    return "Attempt number must be from 1 to 3.";
  }
  if (input.status === "undelivered") {
    if (input.attemptNumber === null) return "Attempt number is required for an undelivered update.";
    if (!input.undeliveredReason || !(threePLUndeliveredReasons as readonly string[]).includes(input.undeliveredReason)) {
      return "Select a valid undelivered reason.";
    }
  }
  if (["return_initiated", "return_in_transit", "returned_to_warehouse"].includes(input.status)) {
    if (!input.returnReason || !(threePLReturnReasons as readonly string[]).includes(input.returnReason)) {
      return "Select a valid return reason.";
    }
  }
  if (input.returnReason && !(threePLReturnReasons as readonly string[]).includes(input.returnReason)) {
    return "Select a valid return reason.";
  }
  if (input.internalNotes && input.internalNotes.length > 1000) {
    return "Internal notes cannot exceed 1,000 characters.";
  }
  return null;
}

export async function parseBulkThreePLStatusFile(file: File): Promise<BulkThreePLParseResult> {
  if (!file.name || file.size === 0) {
    return { ok: false, message: "Choose a non-empty .xlsx or .csv file.", errors: [] };
  }
  if (file.size > bulkThreePLStatusMaxBytes) {
    return { ok: false, message: "The upload is larger than the 5 MB limit.", errors: [] };
  }

  let rawRows: BulkCell[][];
  try {
    rawRows = await readRows(file);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The spreadsheet could not be read.",
      errors: [],
    };
  }

  const headerIndex = rawRows.slice(0, 10).findIndex((row) => {
    const values = new Set(row.map(normalizeHeader));
    return bulkThreePLStatusHeaders.every((header) => values.has(header));
  });
  if (headerIndex === -1) {
    return {
      ok: false,
      message: "The required 3PL status header row was not found. Download a fresh template and keep its columns unchanged.",
      errors: [],
    };
  }

  const headerMap = new Map<BulkHeader, number>();
  rawRows[headerIndex].forEach((cell, index) => {
    const header = normalizeHeader(cell) as BulkHeader;
    if ((bulkThreePLStatusHeaders as readonly string[]).includes(header) && !headerMap.has(header)) {
      headerMap.set(header, index);
    }
  });

  const dataRows = rawRows
    .slice(headerIndex + 1)
    .map((cells, index) => ({ cells, row: headerIndex + index + 2 }))
    .filter(({ cells }) => bulkThreePLStatusHeaders.some((header) => cellText(cells[headerMap.get(header)!]) !== ""));

  if (dataRows.length === 0) {
    return { ok: false, message: "The file has no status rows below the header.", errors: [] };
  }
  if (dataRows.length > bulkThreePLStatusMaxRows) {
    return { ok: false, message: `Upload no more than ${bulkThreePLStatusMaxRows} status rows at a time.`, errors: [] };
  }

  const errors: BulkThreePLRowError[] = [];
  const parsedRows: ParsedBulkThreePLStatus[] = [];
  const trackingRows = new Map<string, number>();

  for (const { cells, row } of dataRows) {
    const value = (field: BulkHeader) => cellText(cells[headerMap.get(field)!]);
    const trackingNumber = value("tracking_number").toUpperCase();
    const status = normalizeCode(value("status")) as ThreePLUpdateStatus;
    const attemptText = value("attempt_number");
    const attemptNumber = attemptText ? Number(attemptText) : null;
    const undeliveredReasonText = normalizeCode(value("undelivered_reason"));
    const returnReasonText = normalizeCode(value("return_reason"));
    const internalNotes = value("internal_notes");
    const update: ThreePLStatusInput = {
      trackingNumber,
      status,
      attemptNumber,
      undeliveredReason: undeliveredReasonText ? undeliveredReasonText as ThreePLUndeliveredReason : null,
      returnReason: returnReasonText ? returnReasonText as ThreePLReturnReason : null,
      internalNotes: internalNotes || null,
    };
    const issue = validateThreePLStatusInput(update);
    if (issue) {
      errors.push({ row, field: "status_update", message: issue });
      continue;
    }
    const earlierRow = trackingRows.get(trackingNumber);
    if (earlierRow) {
      errors.push({ row, field: "tracking_number", message: `Duplicate of row ${earlierRow} in this file.` });
      continue;
    }
    trackingRows.set(trackingNumber, row);
    parsedRows.push({ row, update });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      message: `${errors.length} validation issue${errors.length === 1 ? "" : "s"} found. No statuses were updated.`,
      errors: errors.slice(0, 200),
    };
  }
  return { ok: true, rows: parsedRows };
}

