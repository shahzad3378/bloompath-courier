"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

export async function createShipperFulfillmentOrderAction(_previous: string, form: FormData): Promise<string> {
 const profile = await requireProfile(["shipper"]);
 const productId=clean(form,"product_id",36), quantity=Number(clean(form,"quantity",8));
 if(!/^[0-9a-f-]{36}$/i.test(productId)||!Number.isInteger(quantity)||quantity<1||quantity>1000)return "Choose a product and valid quantity.";
 const payload=[{product_id:productId,quantity,recipient_name:clean(form,"recipient_name",160),recipient_phone:clean(form,"recipient_phone",50),delivery_address:clean(form,"delivery_address",500),order_reference:clean(form,"order_reference",120)}];
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
 const payload:Array<Record<string,unknown>>=[]; const problems:string[]=[];
 sheet.eachRow((row,rowNumber)=>{
  if(rowNumber===1)return;
  const value=(name:string)=>String(row.getCell(col(name)).text??"").trim();
  if(!["recipient_name","recipient_phone","delivery_address","product_name","quantity"].some(name=>value(name)))return;
  const productMatches=productIndex.get(value("product_name").toLocaleLowerCase())??[];
  const quantity=Number(value("quantity"));
  if(productMatches.length!==1){problems.push(`row ${rowNumber}: product name must match one available product`);return;}
  if(!Number.isInteger(quantity)||quantity<1||quantity>1000){problems.push(`row ${rowNumber}: quantity must be 1–1000`);return;}
  payload.push({product_id:productMatches[0].id,quantity,recipient_name:value("recipient_name"),recipient_phone:value("recipient_phone"),delivery_address:value("delivery_address"),order_reference:value("order_reference")});
 });
 if(problems.length)return `Fix Excel ${problems.slice(0,3).join("; ")}${problems.length>3?`; and ${problems.length-3} more row(s)`:""}.`;
 if(!payload.length)return "No order rows found. Fill in the template and upload it again.";
 if(payload.length>200)return "Upload up to 200 orders at a time.";
 const supabase=await createClient(); const {data,error}=await supabase.rpc("fulfillment_create_shipper_orders",{p_orders:payload});
 if(error){console.error("SHIPPER_FULFILLMENT_BULK",error.message);return error.message.includes("stock")?"Upload was not submitted because one or more products do not have enough available stock.":"Upload was not submitted. Check the recipient details and stock, then try again.";}
 revalidatePath("/shipper/fulfillment"); revalidatePath("/shipper/fulfillment/orders"); revalidatePath("/fulfillment/orders");
 return `${Number(data)} fulfillment order(s) submitted successfully.`;
}
