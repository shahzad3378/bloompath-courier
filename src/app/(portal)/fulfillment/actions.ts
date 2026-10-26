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
 const shipperId=clean(form,"shipper_id",36), unitCostText=clean(form,"unit_cost",30), unitCost=Number(unitCostText), currency=clean(form,"currency",3).toUpperCase(), fulfillmentGroup=clean(form,"fulfillment_group",60).toUpperCase();
 if(!/^[0-9a-f-]{36}$/i.test(shipperId)||!unitCostText||!Number.isFinite(unitCost)||unitCost<0||!/^[A-Z]{3}$/.test(currency)||!fulfillmentGroup)return;
 const supabase=await createClient(); const {error}=await supabase.rpc("fulfillment_import_products",{p_shipper_id:shipperId,p_products:[{sku,name,location,unit_cost:unitCost,currency,fulfillment_group:fulfillmentGroup}]}); if(error)console.error("FULFILLMENT_PRODUCT_CREATE",error.message); revalidatePath("/fulfillment"); revalidatePath("/fulfillment/products");
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


export type FulfillmentAwbState = {
 status: "idle" | "success" | "error";
 message: string;
 shipmentId?: number;
 trackingNumber?: string;
};

export async function createFulfillmentAwbAction(_previous: FulfillmentAwbState, form: FormData): Promise<FulfillmentAwbState> {
 try {
  const profile = await requireProfile(roles);
  if (!profile.organization_id) return {status:"error",message:"This account is not linked to a courier organization."};
  const orderNumber = clean(form,"order_number",40);
  const consigneeCity = clean(form,"consignee_city",80);
  const consigneeCountryCode = clean(form,"consignee_country_code",2).toUpperCase();
  const postalCode = clean(form,"consignee_postal_code",30);
  const weight = Number(clean(form,"weight_kg",20));
  const pieces = Number(clean(form,"pieces",8));
  const paymentTypeValue = clean(form,"payment_type",12);
  const codAmount = Number(clean(form,"cod_amount",20));
  if (!orderNumber || !consigneeCity || !/^[A-Z]{2}$/.test(consigneeCountryCode) ||
    !Number.isFinite(weight) || weight <= 0 || weight > 1000 ||
    !Number.isInteger(pieces) || pieces < 1 || pieces > 999 ||
    !["cod","prepaid"].includes(paymentTypeValue) || !Number.isFinite(codAmount) || codAmount < 0 ||
    (paymentTypeValue === "prepaid" && codAmount !== 0)) {
   return {status:"error",message:"Check destination city, weight, pieces and COD amount, then try again."};
  }
  const paymentType = paymentTypeValue as "cod" | "prepaid";
  const supabase = await createClient();
  const {data: lines, error: orderError} = await supabase.from("fulfillment_orders")
   .select("id,organization_id,order_number,shipper_reference,shipper_id,recipient_name,recipient_phone,delivery_address,product_name,quantity,status")
   .eq("organization_id",profile.organization_id).eq("order_number",orderNumber).order("id",{ascending:true});
  if (orderError || !lines?.length) return {status:"error",message:"Fulfillment order could not be found in this courier account."};
  const order = lines[0];
  if (lines.some(line=>line.status!=="dispatched")) return {status:"error",message:"Mark this fulfillment order Dispatched before creating its AWB."};
  if (!order.shipper_id || lines.some(line=>line.shipper_id!==order.shipper_id)) return {status:"error",message:"This order has no single shipper account. Assign a shipper before creating its AWB."};
  const {data: existing, error: existingError} = await supabase.from("shipments")
   .select("id,tracking_number").eq("organization_id",profile.organization_id).eq("fulfillment_order_id",order.id).maybeSingle();
  if (existingError) return {status:"error",message:"Could not check whether this order already has an AWB."};
  if (existing) return {status:"success",shipmentId:existing.id,trackingNumber:existing.tracking_number,message:"AWB already exists for this fulfillment order."};

  const [{data: settings},{data: marketRows},{data: shipper},{data: business}] = await Promise.all([
   supabase.from("organization_settings").select("awb_brand_name,display_name,legal_name,contact_phone,address,city,default_service_type,currency").eq("organization_id",profile.organization_id).maybeSingle(),
   supabase.from("organization_countries").select("country_code,is_primary").eq("organization_id",profile.organization_id).eq("is_active",true),
   supabase.from("profiles").select("id,full_name,phone").eq("id",order.shipper_id).eq("organization_id",profile.organization_id).eq("role","shipper").eq("status","active").maybeSingle(),
   supabase.from("shipper_business_profiles").select("company_name,address,city").eq("shipper_id",order.shipper_id).eq("organization_id",profile.organization_id).maybeSingle()
  ]);
  if (!shipper) return {status:"error",message:"The shipper account is inactive or unavailable."};
  const senderCountryCode = marketRows?.find(row=>row.is_primary)?.country_code || marketRows?.[0]?.country_code || "AE";
  if (senderCountryCode !== consigneeCountryCode) return {status:"error",message:"International fulfillment AWBs need transport mode and parcel dimensions. This one-click action currently supports deliveries within the shipper's origin country."};
  const countryCodes = [...new Set([senderCountryCode,consigneeCountryCode])];
  const [{data: countries},{data: zones}] = await Promise.all([
   supabase.from("countries").select("code,name,default_currency_code,location_strategy,postal_code_label").in("code",countryCodes).eq("is_active",true),
   supabase.from("service_zones").select("id,name,zone_type,postal_prefix,postal_from,postal_to,city,district,area").eq("organization_id",profile.organization_id).eq("country_code",consigneeCountryCode).eq("is_active",true)
  ]);
  const country = countries?.find(row=>row.code===consigneeCountryCode);
  if (!country) return {status:"error",message:"The destination country is not enabled for this courier."};
  if (["postal_code","zip_code","postcode"].includes(country.location_strategy) && !postalCode) {
   return {status:"error",message:(country.postal_code_label||"Postal code")+" is required for "+country.name+"."};
  }
  let city = consigneeCity;
  if (city.toLowerCase().replaceAll(" ","")==="rasalkhaima" || city.toLowerCase().replaceAll(" ","")==="rasalkhaimah") city="Ras Al Khaimah";
  const serviceZones = (zones??[]) as ServiceZone[];
  const matchedZone = resolveServiceZone(serviceZones,postalCode,city,null);
  if (serviceZones.length && !matchedZone) return {status:"error",message:"This delivery city does not match an active Service Zone. Check the address/city or configure its zone first."};
  const senderName = String(settings?.awb_brand_name||settings?.display_name||settings?.legal_name||business?.company_name||shipper.full_name||"").trim();
  const senderPhone = String(settings?.contact_phone||shipper.phone||"").trim();
  const senderAddress = String(settings?.address||business?.address||"").trim();
  const senderCity = String(settings?.city||business?.city||"").trim();
  if (senderName.length<2 || senderPhone.length<7 || senderPhone.length>20 || senderAddress.length<5 || senderAddress.length>500 || senderCity.length<2) {
   return {status:"error",message:"Add the warehouse sender name, phone, address and city in Organization Settings (or the shipper business profile) before creating an AWB."};
  }
  const parcelDescription = lines.map(line=>line.product_name+" × "+line.quantity).join(", ").slice(0,500);
  if (parcelDescription.length<2) return {status:"error",message:"This order has no product description for the AWB."};
  const reference = order.shipper_reference && order.shipper_reference.length<=80 ? order.shipper_reference : order.order_number;
  const {data: referenceUse} = await supabase.from("shipments").select("id").eq("organization_id",profile.organization_id).eq("reference_number",reference).maybeSingle();
  const referenceNumber = referenceUse ? order.order_number : reference;
  const defaultService = (["same_day","next_day","standard"].includes(settings?.default_service_type??"") ? settings!.default_service_type! : "next_day") as "same_day" | "next_day" | "standard";
  const insert = {
   organization_id:profile.organization_id, fulfillment_order_id:order.id,
   reference_number:referenceNumber, shipper_id:order.shipper_id, created_by:profile.id,
   status:"booked" as const, service_type:defaultService, payment_type:paymentType,
   sender_name:senderName,sender_phone:senderPhone,sender_address:senderAddress,sender_city:senderCity,sender_country_code:senderCountryCode,
   consignee_name:order.recipient_name,consignee_phone:order.recipient_phone,consignee_address:order.delivery_address,
   consignee_city:city,consignee_country_code:consigneeCountryCode,consignee_postal_code:postalCode||null,
   service_zone_id:matchedZone?.id??null,service_zone_name:matchedZone?.name??null,
   pieces,weight_kg:weight,item_quantity:lines.reduce((total,line)=>total+line.quantity,0),parcel_description:parcelDescription,cod_amount:paymentType==="cod"?codAmount:0,
   declared_value:0,currency:country.default_currency_code||settings?.currency||"AED",
   delivery_instructions:("Fulfillment order "+order.order_number+(order.shipper_reference?"; customer reference "+order.shipper_reference:"")).slice(0,500)
  };
  const {data: shipment,error: insertError} = await supabase.from("shipments").insert(insert).select("id,tracking_number").maybeSingle();
  if (insertError || !shipment) {
   if (insertError?.code==="23505") {
    const {data: duplicate} = await supabase.from("shipments").select("id,tracking_number").eq("organization_id",profile.organization_id).eq("fulfillment_order_id",order.id).maybeSingle();
    if (duplicate) return {status:"success",shipmentId:duplicate.id,trackingNumber:duplicate.tracking_number,message:"AWB already exists for this fulfillment order."};
   }
   console.error("FULFILLMENT_AWB_CREATE",insertError);
   return {status:"error",message:insertError?.code==="23505"?"This customer reference is already used by another shipment.":"AWB could not be created. Check the shipment details and organization sender settings."};
  }
  revalidatePath("/fulfillment/orders"); revalidatePath("/shipper/fulfillment/orders"); revalidatePath("/shipments"); revalidatePath("/dashboard");
  return {status:"success",shipmentId:shipment.id,trackingNumber:shipment.tracking_number,message:"AWB created and added to All Shipments."};
 } catch (error) {
  console.error("FULFILLMENT_AWB_ACTION",error);
  return {status:"error",message:"AWB could not be created. Check the order and shipment details, then try again."};
 }
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
  const shipperId=clean(form,"shipper_id",36), currency=clean(form,"currency",3).toUpperCase();
  if(!/^[0-9a-f-]{36}$/i.test(shipperId)||!/^[A-Z]{3}$/.test(currency))return {status:"error",message:"Select a shipper and enter a 3-letter rate currency."};
  const rows=await fulfillmentBulkRows(form);
  const headerIndex=rows.slice(0,10).findIndex(row=>{const set=new Set(row.map(normalizeBulkHeader));return set.has("sku")&&set.has("name")&&set.has("unit_cost")&&set.has("fulfillment_group");});
  if(headerIndex<0)return {status:"error",message:"Required columns: sku, name, unit_cost, fulfillment_group. Keep the template header row unchanged."};
  const headers=rows[headerIndex].map(normalizeBulkHeader); const index=(name:string)=>headers.indexOf(name);
  const records:Record<string,unknown>[]=[]; const seen=new Set<string>();
  for(let i=headerIndex+1;i<rows.length;i++){
   const row=rows[i]; if(!row.some(value=>bulkCellText(value)))continue;
   const sku=bulkCellText(row[index("sku")]).toUpperCase(); const name=bulkCellText(row[index("name")]); const location=index("location")>=0?bulkCellText(row[index("location")])||"MAIN":"MAIN"; const costText=bulkCellText(row[index("unit_cost")]); const unitCost=Number(costText); const fulfillmentGroup=bulkCellText(row[index("fulfillment_group")]).toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"");
   if(!sku||sku.length>80||!name||name.length>180||location.length>80||!costText||!Number.isFinite(unitCost)||unitCost<0||!fulfillmentGroup)return {status:"error",message:`Row ${i+1}: SKU, name, location, unit cost, or fulfillment group is invalid.`};
   if(seen.has(sku))return {status:"error",message:`Duplicate SKU ${sku} in the upload. No products were added.`}; seen.add(sku);
   records.push({sku,name,location,unit_cost:unitCost,currency,fulfillment_group:fulfillmentGroup});
   if(records.length>5000)return {status:"error",message:"Upload a maximum of 5,000 products at a time."};
  }
  if(!records.length)return {status:"error",message:"The spreadsheet has no product rows."};
  const supabase=await createClient(); const {data,error}=await supabase.rpc("fulfillment_import_products",{p_shipper_id:shipperId,p_products:records});
  if(error)return {status:"error",message:"Products and rates were not saved. Check the selected shipper, currency, and product values, then try again."};
  revalidatePath("/fulfillment"); revalidatePath("/fulfillment/products"); revalidatePath("/shipper/fulfillment");
  return {status:"success",message:`${Number(data)} product rate(s) saved for the selected shipper. Matching SKUs were linked to existing inventory products.`};
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
 const profile=await requireProfile(["shipper","super_admin","operations_admin","warehouse_staff"]);
 let items:{product_id:string;quantity:number}[];
 try { items=JSON.parse(clean(form,"items_json",20000)); } catch { return "Choose at least one product and quantity."; }
 if(!Array.isArray(items)||!items.length||items.length>50||items.some(item=>!item||!/^[0-9a-f-]{36}$/i.test(item.product_id)||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<1||Number(item.quantity)>1000))return "Choose products and valid quantities.";
 const merged=new Map<string,number>(); for(const item of items)merged.set(item.product_id,(merged.get(item.product_id)??0)+Number(item.quantity));
 if([...merged.values()].some(quantity=>quantity>1000))return "Total quantity for a product cannot exceed 1,000 per order.";
 const shipperId=profile.role==="shipper"?profile.id:clean(form,"shipper_id",36);
 if(profile.role!=="shipper"&&!/^[0-9a-f-]{36}$/i.test(shipperId))return "Select a shipper for this order.";
 const payload=[{shipper_id:shipperId,recipient_name:clean(form,"recipient_name",160),recipient_phone:clean(form,"recipient_phone",50),delivery_address:clean(form,"delivery_address",500),order_reference:clean(form,"order_reference",120),items:[...merged].map(([product_id,quantity])=>({product_id,quantity}))}];
 const supabase=await createClient(); const {error}=await supabase.rpc("fulfillment_create_shipper_orders",{p_orders:payload});
 if(error){console.error("SHIPPER_FULFILLMENT_ORDER",error.message);return error.message.includes("stock")?"Not enough available stock for this order.":"Could not place the order. Check the recipient details and try again.";}
 revalidatePath("/shipper/fulfillment"); revalidatePath("/shipper/fulfillment/orders"); revalidatePath("/fulfillment/orders");
 return "Order submitted. It is now in the fulfillment queue.";
}

export async function bulkCreateShipperFulfillmentOrdersAction(_previous: string, form: FormData): Promise<string> {
 const profile=await requireProfile(["shipper","super_admin","operations_admin","warehouse_staff"]);
 const shipperId=profile.role==="shipper"?profile.id:clean(form,"shipper_id",36);
 if(profile.role!=="shipper"&&!/^[0-9a-f-]{36}$/i.test(shipperId))return "Select a shipper for this upload.";
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
 const payload=[...groups.values()].map(group=>({shipper_id:shipperId,recipient_name:group.recipient_name,recipient_phone:group.recipient_phone,delivery_address:group.delivery_address,order_reference:group.order_reference,items:[...group.items].map(([product_id,quantity])=>({product_id,quantity}))}));
 const supabase=await createClient(); const {data,error}=await supabase.rpc("fulfillment_create_shipper_orders",{p_orders:payload});
 if(error){console.error("SHIPPER_FULFILLMENT_BULK",error.message);return error.message.includes("stock")?"Upload was not submitted because one or more products do not have enough available stock.":"Upload was not submitted. Check the recipient details and stock, then try again.";}
 revalidatePath("/shipper/fulfillment"); revalidatePath("/shipper/fulfillment/orders"); revalidatePath("/fulfillment/orders");
 return `${Number(data)} customer order(s) submitted successfully.`;
}
