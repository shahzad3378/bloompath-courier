"use server";

import { revalidatePath } from "next/cache";
import { recordManualTrackingAction, type ManualTrackingState } from "@/app/(portal)/warehouse/manual-tracking/actions";
import { readBulkFileRows } from "@/lib/bulk-shipments";
import { customerTrackingLabels, manualTrackingStatuses, type CustomerTrackingStatus } from "@/lib/customer-tracking";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inferTrackingTimeZone, isTrackingTimeZone, type TrackingTimeZone } from "@/lib/tracking-timezones";

const roles = ["super_admin", "operations_admin", "warehouse_staff"] as const;
const maxBytes = 5 * 1024 * 1024;
const maxRows = 500;
const headers = ["tracking_number", "status", "occurred_at", "time_zone"] as const;

export type ManualTrackingBulkRow = {
  row: number;
  trackingNumber: string;
  status: string;
  ok: boolean;
  message: string;
};
export type ManualTrackingBulkState = {
  status: "idle" | "success" | "error";
  message: string;
  rows: ManualTrackingBulkRow[];
};

const cell = (value: unknown) => value instanceof Date
  ? value.toISOString()
  : String(value ?? "").replace(/^\uFEFF/, "").trim();

export async function bulkRecordManualTrackingAction(
  _previous: ManualTrackingBulkState,
  form: FormData,
): Promise<ManualTrackingBulkState> {
  await requireProfile(roles);
  const fail = (message: string): ManualTrackingBulkState => ({ status: "error", message, rows: [] });
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return fail("Choose a non-empty Excel or CSV file.");
  if (file.size > maxBytes) return fail("The file must be 5 MB or smaller.");
  let raw: unknown[][];
  try {
    raw = await readBulkFileRows(file);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The spreadsheet could not be read.");
  }
  const headerIndex = raw.slice(0, 10).findIndex((row) => {
    const names = new Set(row.map((value) => cell(value).toLowerCase()));
    return headers.slice(0, 3).every((header) => names.has(header));
  });
  if (headerIndex < 0) return fail("Required headers are tracking_number, status and occurred_at. Download the template and keep its header names.");
  const columns = new Map<string, number>();
  raw[headerIndex].forEach((value, index) => columns.set(cell(value).toLowerCase(), index));
  const records = raw.slice(headerIndex + 1).map((values, index) => ({
    values,
    row: headerIndex + index + 2,
  })).filter(({ values }) => headers.some((header) => cell(values[columns.get(header) ?? -1]) !== ""));
  if (!records.length) return fail("The file has no tracking rows below the headers.");
  if (records.length > maxRows) return fail(`Upload no more than ${maxRows} tracking rows at a time.`);

  const parsed = records.map(({ values, row }) => ({
    row,
    trackingNumber: cell(values[columns.get("tracking_number") ?? -1]).toUpperCase(),
    status: cell(values[columns.get("status") ?? -1]).toLowerCase(),
    occurredAt: cell(values[columns.get("occurred_at") ?? -1]),
    timeZone: cell(values[columns.get("time_zone") ?? -1]),
  }));
  const counts = new Map<string, number>();
  for (const record of parsed) if (record.trackingNumber) counts.set(record.trackingNumber, (counts.get(record.trackingNumber) ?? 0) + 1);

  const profile = await requireProfile(roles);
  if (!profile.organization_id) return fail("This account is not linked to a courier company.");
  const awbs = [...new Set(parsed.map((record) => record.trackingNumber).filter(Boolean))];
  const supabase = await createClient();
  const { data: shipments, error: shipmentError } = awbs.length
    ? await supabase.from("shipments")
      .select("tracking_number,sender_country_code,sender_city,sender_postal_code,consignee_country_code,consignee_city,consignee_postal_code")
      .eq("organization_id", profile.organization_id)
      .in("tracking_number", awbs)
      .is("deleted_at", null)
    : { data: [], error: null };
  if (shipmentError) return fail("Shipments could not be checked. Try the upload again.");
  const shipmentByAwb = new Map((shipments ?? []).map((shipment) => [shipment.tracking_number, shipment]));
  const rows: ManualTrackingBulkRow[] = [];

  for (const record of parsed) {
    const { row, trackingNumber, status, occurredAt } = record;
    const result = (ok: boolean, message: string) => rows.push({ row, trackingNumber, status, ok, message });
    if (!trackingNumber || trackingNumber.length < 3 || trackingNumber.length > 40) { result(false, "Enter a valid AWB."); continue; }
    if ((counts.get(trackingNumber) ?? 0) > 1) { result(false, "This AWB appears more than once in the file; keep one row per AWB."); continue; }
    if (!manualTrackingStatuses.includes(status as CustomerTrackingStatus)) { result(false, "Use a status code from the template instructions."); continue; }
    if (!occurredAt) { result(false, "Enter the status date/time as YYYY-MM-DDTHH:mm."); continue; }
    const shipment = shipmentByAwb.get(trackingNumber);
    if (!shipment) { result(false, "AWB was not found in this courier account."); continue; }
    const zone = record.timeZone && isTrackingTimeZone(record.timeZone)
      ? record.timeZone as TrackingTimeZone
      : record.timeZone
        ? null
        : inferTrackingTimeZone(shipment, status);
    if (!zone) { result(false, "Use a supported time_zone value from the template instructions."); continue; }
    let localDateTime = occurredAt;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(occurredAt)) {
      const date = new Date(occurredAt);
      if (!Number.isNaN(date.getTime())) {
        const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
        const v = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        localDateTime = `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
      }
    } else {
      localDateTime = occurredAt.replace(" ", "T").slice(0, 16);
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime)) { result(false, "Use YYYY-MM-DDTHH:mm for occurred_at."); continue; }

    const rowForm = new FormData();
    rowForm.set("tracking_number", trackingNumber);
    rowForm.set("status", status);
    rowForm.set("occurred_at", localDateTime);
    rowForm.set("time_zone", zone);
    // Intentionally omit POD: delivered rows can be recorded without a photo.
    const saved = await recordManualTrackingAction({ status: "idle", message: "" } satisfies ManualTrackingState, rowForm);
    result(saved.status === "success", saved.message || (saved.status === "success" ? customerTrackingLabels[status as CustomerTrackingStatus] : "Update failed."));
  }

  const succeeded = rows.filter((item) => item.ok).length;
  revalidatePath("/", "layout");
  return {
    status: succeeded ? "success" : "error",
    message: `${succeeded} of ${rows.length} rows updated. Review each row below; invalid rows were skipped.`,
    rows,
  };
}
