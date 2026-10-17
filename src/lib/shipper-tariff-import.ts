import "server-only";
import { readSheet, type CellValue } from "read-excel-file/node";
type Cell = CellValue | null | undefined;
export type ShipperTariffGridRow = { band_code: string; weight_from_kg: number; weight_to_kg: number; rate: number };
export type ShipperTariffPostalRow = { postal_prefix: string; band_code: string };
export type ParsedShipperTariff = { customerName: string; externalAccountNumber: string; version: string; countryCode: string; currency: string; grid: ShipperTariffGridRow[]; postalMap: ShipperTariffPostalRow[] };
export const shipperTariffMaxBytes = 5 * 1024 * 1024;
const text = (v: Cell) => v == null ? "" : String(v).trim();
const key = (v: Cell) => text(v).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
function num(v: Cell) { if (typeof v === "number" && Number.isFinite(v)) return v; if (typeof v === "string" && v.trim()) { const n = Number(v.replace(/[$,]/g, "")); if (Number.isFinite(n)) return n; } return null; }
async function sheet(buffer: Buffer, name: string) { try { return await readSheet(buffer, name) as Cell[][]; } catch { return null; } }
export async function parseShipperTariffWorkbook(file: File): Promise<ParsedShipperTariff> {
  if (!file.size || file.size > shipperTariffMaxBytes || !/\.xlsx$/i.test(file.name)) throw new Error("Choose an .xlsx customer rate workbook up to 5 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const control = await sheet(buffer,"01 Control Panel"), matrix = await sheet(buffer,"02 Rate Matrix"), postal = await sheet(buffer,"04 Postal Map");
  if (!control || !matrix || !postal) throw new Error("Workbook is missing the Control Panel, Rate Matrix or Postal Map tab.");
  const fields = new Map<string,string>();
  for (const row of control) if (key(row[1])) fields.set(key(row[1]),text(row[2]));
  const customerName=fields.get("client_account_name")||"", externalAccountNumber=fields.get("account_number")||"", version=fields.get("rate_card_version")||"Customer rates", currency=(fields.get("currency")||"").toUpperCase(), origin=fields.get("origin_hub")||"";
  if (!customerName || !externalAccountNumber || !/^[A-Z]{3}$/.test(currency) || !/\bYYZ\b|Toronto|Canada/i.test(origin)) throw new Error("Customer account, currency or Canadian origin could not be read from the Control Panel tab.");
  const headerIndex=matrix.findIndex(row=>key(row[1])==="from"&&key(row[2])==="to");
  if(headerIndex<0)throw new Error("Rate Matrix weight-band headers were not found.");
  const bands=matrix[headerIndex].slice(3).map(text);
  if(!bands.length||bands.some(b=>!/^FD-[A-Z0-9]+$/.test(b)))throw new Error("Rate Matrix has an invalid delivery band.");
  const grid:ShipperTariffGridRow[]=[];
  for(const row of matrix.slice(headerIndex+1)){
    const from=num(row[1]),to=num(row[2]); if(from===null&&to===null)continue;
    if(from===null||to===null||from<0||to<=from||to>60)throw new Error(`Invalid weight band on Rate Matrix row ${matrix.indexOf(row)+1}.`);
    bands.forEach((band,i)=>{const rate=num(row[i+3]);if(rate===null||rate<0||rate>1_000_000)throw new Error(`Invalid ${band} rate for ${from}–${to} kg.`);grid.push({band_code:band,weight_from_kg:from,weight_to_kg:to,rate});});
  }
  const postalHeader=postal.findIndex(row=>key(row[1])==="fsa"&&key(row[3])==="band_code");
  if(postalHeader<0)throw new Error("Postal Map FSA/band headers were not found.");
  const postalMap:ShipperTariffPostalRow[]=[];
  for(const row of postal.slice(postalHeader+1)){const prefix=text(row[1]).toUpperCase().replace(/[^A-Z0-9]/g,"");const band=text(row[3]).toUpperCase();if(!prefix&&!band)continue;if(!/^[A-Z0-9]{3}$/.test(prefix)||!bands.includes(band))throw new Error(`Invalid FSA mapping on Postal Map row ${postal.indexOf(row)+1}.`);postalMap.push({postal_prefix:prefix,band_code:band});}
  if(!grid.length||!postalMap.length||grid.length>10000||postalMap.length>400000)throw new Error("Workbook has no usable rates or exceeds the supported row limit.");
  if(new Set(postalMap.map(r=>r.postal_prefix)).size!==postalMap.length)throw new Error("Postal Map has duplicate FSA prefixes.");
  return {customerName,externalAccountNumber,version,countryCode:"CA",currency,grid,postalMap};
}
export function normalizedCustomerName(value:string){return value.toLowerCase().replace(/\b(inc|incorporated|ltd|limited|corp|corporation|canada)\b/g,"").replace(/[^a-z0-9]/g,"");}
