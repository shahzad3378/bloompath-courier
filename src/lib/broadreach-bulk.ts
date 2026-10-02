import type { BroadReachOptions } from "@/lib/broadreach";
import type { BroadReachState } from "@/app/(portal)/courier-integrations/broadreach/actions";

export const broadReachBulkHeaders = ["awb", "currency", "description", "qty", "value", "sku", "origin", "hscode", "length", "width", "height"] as const;
export const broadReachBulkMaxParcels = 100;
export const broadReachBulkMaxRows = 1000;
export const broadReachBulkMaxBytes = 2 * 1024 * 1024;
export type BroadReachBulkParcel = { awb: string; rows: number[]; options: Omit<BroadReachOptions, "test"> };
export type BroadReachBulkRow = BroadReachBulkParcel & { service?: string; message: string; status: "ready" | "invalid" };
export type BroadReachBulkResult = { awb: string; rows: number[]; status: "waiting" | "processing" | "success" | "error" | "invalid"; message: string; bookingId?: string; tracking?: string; test?: boolean };
export type BroadReachBulkPreview = { status: "idle" | "success" | "error"; message: string; rows: BroadReachBulkRow[] };

export function broadReachParcelForm(parcel: BroadReachBulkParcel, mode: "test" | "live", confirmed: boolean) {
  const form = new FormData();
  form.set("awb", parcel.awb); form.set("mode", mode); form.set("currency", parcel.options.currency);
  if (confirmed) form.set("confirm_live", "on");
  form.set("item_count", String(parcel.options.items.length));
  parcel.options.items.forEach((item, index) => {
    for (const key of ["description", "qty", "value", "sku", "origin", "hscode"] as const) form.set(`${key}_${index}`, String(item[key] ?? ""));
  });
  if (parcel.options.dimensions) for (const [key, value] of Object.entries(parcel.options.dimensions)) form.set(key, String(value));
  return form;
}

export async function processBroadReachBatch(parcels: BroadReachBulkParcel[], mode: "test" | "live", confirmed: boolean, book: (form: FormData) => Promise<BroadReachState>, update: (index: number, result: BroadReachBulkResult) => void, stop: () => boolean) {
  for (let index = 0; index < parcels.length; index++) {
    if (stop()) return "stopped";
    const parcel = parcels[index];
    update(index, { awb: parcel.awb, rows: parcel.rows, status: "processing", message: "Generating label…" });
    try {
      const result = await book(broadReachParcelForm(parcel, mode, confirmed));
      update(index, { ...result, awb: parcel.awb, rows: parcel.rows, status: result.status === "success" ? "success" : "error" });
      if (result.haltBatch) return "stopped";
    } catch {
      update(index, { awb: parcel.awb, rows: parcel.rows, status: "error", message: "Request interrupted. Check recent bookings and the BroadReach portal before retrying; the carrier outcome may be unconfirmed." });
      return "stopped";
    }
  }
  return "completed";
}

export function broadReachResultsCsv(results: BroadReachBulkResult[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  };
  return [ ["awb", "source_rows", "status", "partner_awb", "mode", "message", "booking_id"],
    ...results.map(row => [row.awb, row.rows.join(" / "), row.status, row.tracking ?? "", row.test === undefined ? "" : row.test ? "test" : "live", row.message, row.bookingId ?? ""]),
  ].map(row => row.map(cell).join(",")).join("\r\n");
}
