"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { normalizedCustomerName, parseShipperTariffWorkbook, shipperTariffMaxBytes } from "@/lib/shipper-tariff-import";
import { createAdminClient } from "@/lib/supabase/admin";
const roles=["super_admin","operations_admin","finance_staff"] as const;
export type ShipperTariffState={status:"idle"|"success"|"error";message:string};
const val=(form:FormData,key:string)=>String(form.get(key)??"").trim();
export async function importShipperTariffAction(_state:ShipperTariffState,form:FormData):Promise<ShipperTariffState>{
  const actor=await requireProfile(roles);if(!actor.organization_id)return{status:"error",message:"This account is not linked to a courier company."};
  const shipperId=val(form,"shipper_id"),file=form.get("file"),effectiveFrom=val(form,"effective_from");
  if(!/^[0-9a-f-]{36}$/i.test(shipperId))return{status:"error",message:"Open the upload from a valid customer account."};
  if(!(file instanceof File)||!file.size||file.size>shipperTariffMaxBytes||!/\.xlsx$/i.test(file.name))return{status:"error",message:"Choose an .xlsx customer rate workbook up to 5 MB."};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)||Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`)))return{status:"error",message:"Choose a valid effective date."};
  let parsed:Awaited<ReturnType<typeof parseShipperTariffWorkbook>>;try{parsed=await parseShipperTariffWorkbook(file);}catch(e){return{status:"error",message:e instanceof Error?e.message:"Customer rate workbook could not be read."};}
  const admin=createAdminClient();
  const [{data:shipper,error:shipperError},{data:business}]=await Promise.all([
    admin.from("profiles").select("id,full_name").eq("id",shipperId).eq("organization_id",actor.organization_id).eq("role","shipper").maybeSingle(),
    admin.from("shipper_business_profiles").select("company_name").eq("shipper_id",shipperId).eq("organization_id",actor.organization_id).maybeSingle(),
  ]);
  if(shipperError||!shipper)return{status:"error",message:"This customer account is not available in your courier company."};
  const book=normalizedCustomerName(parsed.customerName),account=normalizedCustomerName(business?.company_name||shipper.full_name||"");
  if(book.length<8||account.length<8||!(book.includes(account)||account.includes(book)))return{status:"error",message:`This workbook is for ${parsed.customerName}, but the selected account is ${business?.company_name||shipper.full_name||"unnamed"}. Open the matching customer's account before importing.`};
  const {data:card,error:cardError}=await admin.from("shipper_tariff_cards").insert({organization_id:actor.organization_id,shipper_id:shipperId,card_name:`${parsed.customerName} — ${parsed.version}`.slice(0,160),client_account_name:parsed.customerName,external_account_number:parsed.externalAccountNumber,country_code:parsed.countryCode,currency:parsed.currency,source_filename:file.name.slice(0,240),effective_from:effectiveFrom,is_active:false,imported_by:actor.id}).select("id").single();
  if(cardError||!card)return{status:"error",message:"Customer rate card could not be created. Confirm its country and currency are enabled."};
  const grid=parsed.grid.map(r=>({...r,organization_id:actor.organization_id,rate_card_id:card.id}));const maps=parsed.postalMap.map(r=>({...r,organization_id:actor.organization_id,rate_card_id:card.id}));
  let previousIds:string[]=[];
  try{
    for(let i=0;i<grid.length;i+=1500){const{error}=await admin.from("shipper_tariff_grid").insert(grid.slice(i,i+1500));if(error)throw error;}
    for(let i=0;i<maps.length;i+=1500){const{error}=await admin.from("shipper_tariff_postal_map").insert(maps.slice(i,i+1500));if(error)throw error;}
    const{data:previous,error}=await admin.from("shipper_tariff_cards").select("id").eq("organization_id",actor.organization_id).eq("shipper_id",shipperId).eq("country_code",parsed.countryCode).eq("is_active",true);if(error)throw error;
    previousIds=(previous||[]).map(r=>r.id);if(previousIds.length){const{error:deactivateError}=await admin.from("shipper_tariff_cards").update({is_active:false}).in("id",previousIds);if(deactivateError)throw deactivateError;}
    const{error:activateError}=await admin.from("shipper_tariff_cards").update({is_active:true,grid_row_count:grid.length,postal_mapping_count:maps.length,activated_at:new Date().toISOString()}).eq("id",card.id).eq("organization_id",actor.organization_id);if(activateError)throw activateError;
  }catch(error){console.error("SHIPPER_TARIFF_IMPORT_ERROR",{cardId:card.id,error});if(previousIds.length)await admin.from("shipper_tariff_cards").update({is_active:true}).in("id",previousIds);await admin.from("shipper_tariff_cards").delete().eq("id",card.id).eq("organization_id",actor.organization_id);return{status:"error",message:"Import failed. The incomplete card was removed and previous customer rates were restored."};}
  revalidatePath(`/shippers/${shipperId}`);revalidatePath("/dispatch/3pl");revalidatePath("/dispatch/3pl/manifests");
  return{status:"success",message:`Uploaded ${parsed.customerName}'s ${parsed.currency} customer rates: ${grid.length.toLocaleString()} weight prices and ${maps.length.toLocaleString()} postal mappings. These will be used for the customer revenue side of profit/loss.`};
}
