import { normalizeGtaSenderTerminals, type GtaOptions } from "@/lib/gta-airskip";
import type { GtaState } from "@/app/(portal)/courier-integrations/gta-airskip/actions";
import { broadReachResultsCsv, type BroadReachBulkResult } from "@/lib/broadreach-bulk";
export const gtaBulkHeaders = ["awb", "length", "width", "height", "description", "weight", "hscode", "value", "currency", "qty"] as const;
export const gtaBulkMaxBytes = 2 * 1024 * 1024;
export type GtaBulkParcel = { awb: string; rows: number[]; options: GtaOptions };
export type GtaBulkRow = GtaBulkParcel & { status: "ready" | "invalid"; message: string; destination?: string };
export type GtaBulkPreview = { status: "idle" | "success" | "error"; message: string; rows: GtaBulkRow[] };
export type GtaBulkResult = BroadReachBulkResult;
export const gtaResultsCsv = broadReachResultsCsv;
export function parseGtaBulkRows(raw: unknown[][], terminal: string): GtaBulkParcel[] {
  const text = (value: unknown) => String(value ?? "").trim();
  const headers = (raw[0] ?? []).map(v => text(v).replace(/^\uFEFF/, "").toLowerCase());
  if (gtaBulkHeaders.some(h => headers.filter(v => v === h).length !== 1) || headers.some(h => h && !(gtaBulkHeaders as readonly string[]).includes(h))) throw new Error("Keep the GTA template column names unchanged, with no duplicate or extra columns.");
  terminal = normalizeGtaSenderTerminals(terminal);
  const data = raw.slice(1).map((cells, i) => ({ cells, row: i + 2 })).filter(({ cells }) => cells.some(v => text(v)));
  if (!data.length || data.length > 1000) throw new Error("Upload 1–1,000 rows and no more than 100 parcels.");
  const parcels = new Map<string, GtaBulkParcel>();
  for (const { cells, row } of data) {
    const value = (h: string) => text(cells[headers.indexOf(h)]);
    const num = (h: string) => value(h) ? Number(value(h)) : NaN;
    const awb = value("awb").toUpperCase();
    if (!/^[A-Z0-9-]{2,100}$/.test(awb)) throw new Error(`Row ${row}: enter a valid FastDrop AWB.`);
    const length = num("length"), width = num("width"), height = num("height");
    if (![length, width, height].every(v => Number.isFinite(v) && v > 0 && v <= 10000)) throw new Error(`Row ${row}: dimensions must be greater than zero and no more than 10,000 cm.`);
    let parcel = parcels.get(awb);
    if (parcel && !parcel.options.items.length) throw new Error(`Row ${row}: a parcel without customs items must have only one row.`);
    if (!parcel) { parcel = { awb, rows: [], options: { terminal, piecesType: "Box", service: "", destinationTerminal: "", length, width, height, signature: false, insurance: false, insuranceValue: 0, items: [] } }; parcels.set(awb, parcel); }
    if (["length", "width", "height"].some(h => parcel.options[h as "length" | "width" | "height"] !== num(h))) throw new Error(`Row ${row}: repeated AWBs must have matching dimensions.`);
    parcel.rows.push(row);
    const customs = ["description", "weight", "hscode", "value", "currency", "qty"].some(h => value(h));
    if (customs) {
      if (!value("description") || value("description").length > 300 || !/^[0-9]{4,10}$/.test(value("hscode")) || !/^[A-Z]{3}$/.test(value("currency").toUpperCase()) || !Number.isFinite(num("weight")) || num("weight") <= 0 || !Number.isFinite(num("value")) || num("value") < 0 || !Number.isSafeInteger(num("qty")) || num("qty") <= 0) throw new Error(`Row ${row}: complete all customs fields. HS code must contain 4–10 digits; quantity and weight must be positive.`);
      parcel.options.items.push({ description: value("description"), weight: num("weight"), hsCode: value("hscode"), declaredValue: num("value"), currency: value("currency").toUpperCase(), quantity: num("qty") });
      if (parcel.options.items.length > 100) throw new Error(`Row ${row}: one parcel may contain at most 100 customs items.`);
    } else if (parcel.rows.length > 1) throw new Error(`Row ${row}: repeat an AWB only to add another customs item.`);
    if (parcels.size > 100) throw new Error("Upload no more than 100 parcels per batch.");
  }
  return [...parcels.values()];
}
export function gtaParcelForm(parcel: GtaBulkParcel, confirmed: boolean) {
  const form = new FormData(); form.set("awb", parcel.awb); form.set("use_warehouse", "on"); form.set("confirm_induction", "on");
  if (confirmed) form.set("confirm_live", "on");
  for (const key of ["length", "width", "height", "terminal", "service", "piecesType", "destinationTerminal"] as const) form.set(key === "piecesType" ? "pieces_type" : key === "destinationTerminal" ? "destination_terminal" : key, String(parcel.options[key] ?? ""));
  form.set("item_count", String(parcel.options.items.length));
  parcel.options.items.forEach((item, i) => { for (const [field, key] of [["description", "description"], ["weight", "weight"], ["hs", "hsCode"], ["value", "declaredValue"], ["currency", "currency"], ["quantity", "quantity"]] as const) form.set(`${field}_${i}`, String(item[key])); });
  return form;
}
export async function processGtaBatch(parcels: GtaBulkParcel[], confirmed: boolean, book: (form: FormData) => Promise<GtaState>, update: (result: GtaBulkResult) => void, stop: () => boolean) {
  for (const parcel of parcels) {
    if (stop()) return "stopped";
    update({ awb: parcel.awb, rows: parcel.rows, status: "processing", message: "Generating label…" });
    try {
      const result = await book(gtaParcelForm(parcel, confirmed));
      update({ ...result, awb: parcel.awb, rows: parcel.rows, status: result.status === "success" ? "success" : "error" });
      if (result.haltBatch) return "stopped";
    } catch { update({ awb: parcel.awb, rows: parcel.rows, status: "error", message: "Request interrupted. Check saved bookings and GTA before retrying. No automatic retry was sent." }); return "stopped"; }
  }
  return "completed";
}
