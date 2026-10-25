"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readBulkFileRows } from "@/lib/bulk-shipments";
import type { CellValue } from "read-excel-file/node";
import ExcelJS from "exceljs";
const roles = ["super_admin", "operations_admin", "warehouse_staff"] as const;
const clean = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);
export async function createFulfillmentProductAction(form: FormData) {
 const profile = await requireProfile(roles); if (!profile.organization_id) return;
 const sku=clean(form,"sku",80).toUpperCase(), name=clean(form,"name",180), location=clean(form,"location",80)||"MAIN"; if(!sku||!name)return;
 const supabase=await createClient(); const {error}=await supabase.from("fulfillment_products").insert({organization_id:profile.organization_id,sku,name,location}); if(error)console.error("FULFILLMENT_PRODUCT_CREATE",error.message); revalidatePath("/fulfillment");
}
export async function receiveFulfillmentStockAction(form: FormData) {
 await requireProfile(roles); const productId=clean(form,"product_id",36), quantity=Number(clean(form,"quantity",8)); if(!/^[0-9a-f-]{36}$/i.test(productId)||!Number.isInteger(quantity)||quantity<1||quantity>100000)return;
 const supabase=await createClient(); const {error}=await supabase.rpc("fulfillment_receive_stock",{p_product_id:productId,p_quantity:quantity,p_note:clean(form,"note",240)||null}); if(error)console.error("FULFILLMENT_RECEIVE",error.message); revalidatePath("/fulfillment");
}
export async function createFulfillmentOrderAction(form: FormData) {
 await requireProfile(roles); const productId=clean(form,"product_id",36), quantity=Number(clean(form,"quantity",8)); if(!/^[0-9a-f-]{36}$/i.test(productId)||!Number.isInteger(quantity))return;
 const supabase=await createClient(); const {error}=await supabase.rpc("fulfillment_create_order",{p_product_id:productId,p_quantity:quantity,p_recipient_name:clean(form,"recipient_name",160),p_recipient_phone:clean(form,"recipient_phone",50),p_delivery_address:clean(form,"delivery_address",500)}); if(error)console.error("FULFILLMENT_ORDER_CREATE",error.message); revalidatePath("/fulfillment");
}
export async function updateFulfillmentOrderAction(form: FormData) {
 await requireProfile(roles); const orderId=clean(form,"order_id",36), nextStatus=clean(form,"next_status",20); if(!/^[0-9a-f-]{36}$/i.test(orderId)||!["picking","packed","dispatched"].includes(nextStatus))return;
 const supabase=await createClient(); const {error}=await supabase.rpc("fulfillment_advance_order",{p_order_id:orderId,p_next_status:nextStatus}); if(error)console.error("FULFILLMENT_ORDER_ADVANCE",error.message); revalidatePath("/fulfillment"); revalidatePath("/fulfillment/orders"); revalidatePath("/shipper/fulfillment/orders");
}

type BulkFulfillmentState = { message: string; status: "idle" | "error" | "success" };
const bulkCellText = (value: CellValue | null | undefined) => value instanceof Date ? value.toISOString() : String(value ?? "").trim();
const normalizeBulkHeader = (value: CellValue | null | undefined) => bulkCellText(value).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");

async function fulfillmentBulkRows(form: FormData) {
 const file=form.get("file");
 if(!(file instanceof File)||!file.size)throw new Error("Choose an Excel (.xlsx) or CSV file.");
 if(file.size>5_500_000)throw new Error("The upload must be under 5 MB.");
 let rows: (CellValue|null)[][];
 try { rows=await readBulkFileRows(file); } catch { throw new Error("This file could not be read. Use the downloadable .xlsx template or a .csv file."); }
 return rows;
}

export async function bulkCreateFulfillmentProductsAction(_previous: BulkFulfillmentState, form: FormData): Promise<BulkFulfillmentState> {
 try {
  const profile=await requireProfile(roles); if(!profile.organization_id)return {status:"error",message:"Your account is not linked to an organization."};
  const rows=await fulfillmentBulkRows(form);
  const headerIndex=rows.slice(0,10).findIndex(row=>{const set=new Set(row.map(normalizeBulkHeader));return set.has("sku")&&set.has("name");});
  if(headerIndex<0)return {status:"error",message:"Required columns: sku, name. Keep the template header row unchanged."};
  const headers=rows[headerIndex].map(normalizeBulkHeader); const index=(name:string)=>headers.indexOf(name);
  const records:Record<string,unknown>[]=[]; const seen=new Set<string>();
  for(let i=headerIndex+1;i<rows.length;i++){
   const row=rows[i]; if(!row.some(value=>bulkCellText(value)))continue;
   const sku=bulkCellText(row[index("sku")]).toUpperCase(); const name=bulkCellText(row[index("name")]); const location=index("location")>=0?bulkCellText(row[index("location")])||"MAIN":"MAIN";
   if(!sku||sku.length>80||!name||name.length>180||location.length>80)return {status:"error",message:`Row ${i+1}: SKU, product name, or location is missing or too long.`};
   if(seen.has(sku))return {status:"error",message:`Duplicate SKU ${sku} in the upload. No products were added.`}; seen.add(sku);
   records.push({organization_id:profile.organization_id,sku,name,location});
   if(records.length>5000)return {status:"error",message:"Upload a maximum of 5,000 products at a time."};
  }
  if(!records.length)return {status:"error",message:"The spreadsheet has no product rows."};
  const supabase=await createClient(); const {error}=await supabase.from("fulfillment_products").insert(records);
  if(error)return {status:"error",message:error.code==="23505"?"A SKU already exists in this inventory. Remove duplicate SKUs and retry; no rows were added.":"Products were not added. Check required columns and try again."};
  revalidatePath("/fulfillment"); return {status:"success",message:`${records.length} product(s) uploaded successfully.`};
 } catch(error) { return {status:"error",message:error instanceof Error?error.message:"Product upload failed."}; }
}

export async function bulkReceiveFulfillmentStockAction(_previous: BulkFulfillmentState, form: FormData): Promise<BulkFulfillmentState> {
 try {
  const profile=await requireProfile(roles); if(!profile.organization_id)return {status:"error",message:"Your account is not linked to an organization."};
  const rows=await fulfillmentBulkRows(form);
  const headerIndex=rows.slice(0,10).findIndex(row=>{const set=new Set(row.map(normalizeBulkHeader));return set.has("sku")&&set.has("quantity");});
  if(headerIndex<0)return {status:"error",message:"Required columns: sku, quantity. Keep the template header row unchanged."};
  const headers=rows[headerIndex].map(normalizeBulkHeader); const index=(name:string)=>headers.indexOf(name);
  const lines:{sku:string;quantity:number;note:string|null;row:number}[]=[];
  for(let i=headerIndex+1;i<rows.length;i++){
   const row=rows[i]; if(!row.some(value=>bulkCellText(value)))continue;
   const sku=bulkCellText(row[index("sku")]).toUpperCase(); const quantity=Number(bulkCellText(row[index("quantity")])); const note=index("note")>=0?bulkCellText(row[index("note")]).slice(0,240):"";
   if(!sku||!Number.isInteger(quantity)||quantity<1||quantity>100000)return {status:"error",message:`Row ${i+1}: enter an existing SKU and a whole quantity from 1 to 100,000.`};
   lines.push({sku,quantity,note:note||null,row:i+1}); if(lines.length>5000)return {status:"error",message:"Upload a maximum of 5,000 stock rows at a time."};
  }
  if(!lines.length)return {status:"error",message:"The spreadsheet has no stock rows."};
  const supabase=await createClient(); const skus=[...new Set(lines.map(line=>line.sku))];
  const {data:products,error}=await supabase.from("fulfillment_products").select("id,sku").eq("organization_id",profile.organization_id).eq("active",true).in("sku",skus);
  if(error)return {status:"error",message:"Could not match SKUs to inventory products."};
  const bySku=new Map((products??[]).map(product=>[product.sku,product.id]));
  const missing=skus.find(sku=>!bySku.has(sku)); if(missing)return {status:"error",message:`SKU ${missing} was not found. No stock was received.`};
  const payload=lines.map(line=>({product_id:bySku.get(line.sku),quantity:line.quantity,note:line.note}));
  const {error:rpcError}=await supabase.rpc("fulfillment_bulk_receive_stock",{p_items:payload});
  if(rpcError)return {status:"error",message:"Stock upload was not applied. Check quantities and retry; no rows were received."};
  revalidatePath("/fulfillment"); revalidatePath("/shipper/fulfillment");
  return {status:"success",message:`Stock received for ${lines.length} row(s). Inventory is updated.`};
 } catch(error) { return {status:"error",message:error instanceof Error?error.message:"Stock upload failed."}; }
}

export async function createShipperFulfillmentOrderAction(_previous: string, form: FormData): Promise<string> {
 await requireProfile(["shipper"]);
 let items:{product_id:string;quantity:number}[];
 try { items=JSON.parse(clean(form,"items_json",20000)); } catch { return "Choose at least one product and quantity."; }
 if(!Array.isArray(items)||!items.length||items.length>50||items.some(item=>!item||!/^[0-9a-f-]{36}$/i.test(item.product_id)||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<1||Number(item.quantity)>1000))return "Choose products and valid quantities.";
 const merged=new Map<string,number>(); for(const item of items)merged.set(item.product_id,(merged.get(item.product_id)??0)+Number(item.quantity));
 if([...merged.values()].some(quantity=>quantity>1000))return "Total quantity for a product cannot exceed 1,000 per order.";
 const payload=[{recipient_name:clean(form,"recipient_name",160),recipient_phone:clean(form,"recipient_phone",50),delivery_address:clean(form,"delivery_address",500),order_reference:clean(form,"order_reference",120),items:[...merged].map(([product_id,quantity])=>({product_id,quantity}))}];
 const supabase=await createClient(); const {error}=await supabase.rpc("fulfillment_create_shipper_orders",{p_orders:payload});
 if(error){console.error("SHIPPER_FULFILLMENT_ORDER",error.message);return error.message.includes("stock")?"Not enough available stock for this order.":"Could not place the order. Check the recipient details and try again.";}
 revalidatePath("/shipper/fulfillment"); revalidatePath("/shipper/fulfillment/orders"); revalidatePath("/fulfillment/orders");
 return "Order submitted. It is now in the fulfillment queue.";
}

export async function bulkCreateShipperFulfillmentOrdersAction(_previous: string, form: FormData): Promise<string> {
 const profile=await requireProfile(["shipper"]);
 const file=form.get("file");
 if(!(file instanceof File)||file.size<1||file.size>900_000)return "Choose an .xlsx file under 900 KB.";
 const workbook=new ExcelJS.Workbook();
 try { await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]); }
 catch { return "This Excel file could not be read. Download the template and fill it in."; }
 const sheet=workbook.worksheets[0];
 if(!sheet||sheet.rowCount<2)return "The Excel file has no order rows.";
 const headerRow=sheet.getRow(1);
 const headers=new Map<string,number>();
 headerRow.eachCell((cell,col)=>headers.set(String(cell.text??"").trim().toLowerCase().replaceAll(" ","_"),col));
 const col=(name:string)=>headers.get(name)??0;
 if(!["recipient_name","recipient_phone","delivery_address","product_name","quantity"].every(name=>col(name)>0))return "Use the template columns: recipient_name, recipient_phone, delivery_address, product_name and quantity.";
 const {data:products,error:productError}=await (await createClient()).from("fulfillment_products").select("id,name,quantity_on_hand,quantity_reserved").eq("organization_id",profile.organization_id!).eq("active",true).order("name").limit(1000);
 if(productError)return "Could not load the available product list.";
 const productIndex=new Map<string,Array<{id:string;name:string;quantity_on_hand:number;quantity_reserved:number}>>();
 for(const product of products??[]){const key=product.name.trim().toLocaleLowerCase();productIndex.set(key,[...(productIndex.get(key)??[]),product]);}
 const groups=new Map<string,{recipient_name:string;recipient_phone:string;delivery_address:string;order_reference:string;items:Map<string,number>}>(); const problems:string[]=[];
 sheet.eachRow((row,rowNumber)=>{
  if(rowNumber===1)return;
  const value=(name:string)=>{const column=col(name);return column?String(row.getCell(column).text??"").trim():"";};
  if(!["recipient_name","recipient_phone","delivery_address","product_name","quantity"].some(name=>value(name)))return;
  const productMatches=productIndex.get(value("product_name").toLocaleLowerCase())??[];
  const quantity=Number(value("quantity"));
  if(productMatches.length!==1){problems.push(`row ${rowNumber}: product name must match one available product`);return;}
  if(!Number.isInteger(quantity)||quantity<1||quantity>1000){problems.push(`row ${rowNumber}: quantity must be 1–1000`);return;}
  const recipient_name=value("recipient_name"),recipient_phone=value("recipient_phone"),delivery_address=value("delivery_address"),order_reference=value("order_reference");
  if(recipient_name.length<2||recipient_name.length>160||recipient_phone.length<3||recipient_phone.length>50||delivery_address.length<5||delivery_address.length>500){problems.push(`row ${rowNumber}: recipient name, phone, or address is missing or too long`);return;}
  const key=order_reference?`ref:${order_reference}`:`row:${rowNumber}`; let group=groups.get(key);
  if(!group){group={recipient_name,recipient_phone,delivery_address,order_reference,items:new Map()};groups.set(key,group);}
  else if(group.recipient_name!==recipient_name||group.recipient_phone!==recipient_phone||group.delivery_address!==delivery_address){problems.push(`row ${rowNumber}: recipient details must match other rows with order reference ${order_reference}`);return;}
  group.items.set(productMatches[0].id,(group.items.get(productMatches[0].id)??0)+quantity);
  if((group.items.get(productMatches[0].id)??0)>1000)problems.push(`row ${rowNumber}: combined quantity for a product in one order exceeds 1,000`);
 });
 if(problems.length)return `Fix Excel ${problems.slice(0,3).join("; ")}${problems.length>3?`; and ${problems.length-3} more row(s)`:""}.`;
 if(!groups.size)return "No order rows found. Fill in the template and upload it again.";
 if(groups.size>200)return "Upload up to 200 customer orders at a time.";
 const payload=[...groups.values()].map(group=>({recipient_name:group.recipient_name,recipient_phone:group.recipient_phone,delivery_address:group.delivery_address,order_reference:group.order_reference,items:[...group.items].map(([product_id,quantity])=>({product_id,quantity}))}));
 const supabase=await createClient(); const {data,error}=await supabase.rpc("fulfillment_create_shipper_orders",{p_orders:payload});
 if(error){console.error("SHIPPER_FULFILLMENT_BULK",error.message);return error.message.includes("stock")?"Upload was not submitted because one or more products do not have enough available stock.":"Upload was not submitted. Check the recipient details and stock, then try again.";}
 revalidatePath("/shipper/fulfillment"); revalidatePath("/shipper/fulfillment/orders"); revalidatePath("/fulfillment/orders");
 return `${Number(data)} customer order(s) submitted successfully.`;
}
