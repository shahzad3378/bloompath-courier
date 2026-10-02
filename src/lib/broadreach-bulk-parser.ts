import { broadReachBulkHeaders, broadReachBulkMaxParcels, broadReachBulkMaxRows, type BroadReachBulkParcel } from "@/lib/broadreach-bulk";

export function parseBroadReachBulkRows(input: unknown[][]): BroadReachBulkParcel[] {
  const headers = input[0]?.map(value => String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase()) ?? [];
  if (new Set(headers).size !== headers.length || broadReachBulkHeaders.some(header => !headers.includes(header))) throw new Error("Download a fresh BroadReach template and keep all column names unchanged.");
  const data = input.slice(1).map((cells, index) => ({ cells, row: index + 2 })).filter(({ cells }) => cells.some(value => value !== null && value !== undefined && String(value).trim() !== ""));
  if (!data.length || data.length > broadReachBulkMaxRows) throw new Error(`Include 1–${broadReachBulkMaxRows} item rows in the file.`);
  const parcels = new Map<string, BroadReachBulkParcel>();
  const shape = new Map<string, string>();
  for (const { cells, row } of data) {
    const field = (name: string) => String(cells[headers.indexOf(name)] ?? "").trim();
    const awb = field("awb").toUpperCase();
    if (!awb || [...awb].length > 35) throw new Error(`Row ${row}: enter a FastDrop AWB of 35 characters or fewer.`);
    const currency = field("currency").toUpperCase();
    const dims = ["length", "width", "height"].map(field);
    const signature = JSON.stringify([currency, ...dims]);
    if (shape.has(awb) && shape.get(awb) !== signature) throw new Error(`Row ${row}: currency and dimensions must match the other items for ${awb}.`);
    shape.set(awb, signature);
    if (!parcels.has(awb)) parcels.set(awb, { awb, rows: [], options: { currency, items: [], ...(dims.some(Boolean) ? { dimensions: { length: Number(dims[0]), width: Number(dims[1]), height: Number(dims[2]) } } : {}) } });
    const parcel = parcels.get(awb)!;
    if (parcel.options.items.length >= 100) throw new Error(`Row ${row}: a parcel may contain no more than 100 item rows.`);
    for (const name of ["description", "sku", "origin", "hscode"] as const) if (field(name).length > (name === "description" ? 300 : 100)) throw new Error(`Row ${row}: ${name} is too long.`);
    parcel.rows.push(row);
    parcel.options.items.push({ description: field("description"), qty: field("qty") ? Number(field("qty")) : NaN, value: field("value") ? Number(field("value")) : NaN, unit: "pc", sku: field("sku"), origin: field("origin"), hscode: field("hscode") });
  }
  if (parcels.size > broadReachBulkMaxParcels) throw new Error(`Upload no more than ${broadReachBulkMaxParcels} different AWBs per batch.`);
  return [...parcels.values()];
}
