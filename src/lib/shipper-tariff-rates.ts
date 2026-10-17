import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export type CustomerTariffResult={configured:boolean;amount:number|null;currency:string|null;cardName:string|null;reason:string|null};
export async function quoteShipperTariff(admin:SupabaseClient,organizationId:string,shipperId:string,countryCode:string,postalCode:string,weightKg:number):Promise<CustomerTariffResult>{
 const empty=(configured:boolean,reason:string|null=null):CustomerTariffResult=>({configured,amount:null,currency:null,cardName:null,reason});
 const{data:card,error:cardError}=await admin.from("shipper_tariff_cards").select("id,card_name,currency").eq("organization_id",organizationId).eq("shipper_id",shipperId).eq("country_code",countryCode.toUpperCase()).eq("is_active",true).lte("effective_from",new Date().toISOString().slice(0,10)).order("effective_from",{ascending:false}).limit(1).maybeSingle();
 if(cardError)throw new Error("Customer tariff could not be loaded.");if(!card)return empty(false);
 const prefix=postalCode.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,3);if(prefix.length!==3)return empty(true,`${card.card_name}: destination postal area is missing.`);
 const{data:mapping,error:mappingError}=await admin.from("shipper_tariff_postal_map").select("band_code").eq("organization_id",organizationId).eq("rate_card_id",card.id).eq("postal_prefix",prefix).maybeSingle();
 if(mappingError)throw new Error("Customer postal rate could not be loaded.");if(!mapping)return empty(true,`${card.card_name}: no price for postal area ${prefix}.`);
 const billable=Math.max(1,weightKg);const{data:rate,error:rateError}=await admin.from("shipper_tariff_grid").select("rate,weight_to_kg").eq("organization_id",organizationId).eq("rate_card_id",card.id).eq("band_code",mapping.band_code).gte("weight_to_kg",billable).order("weight_to_kg",{ascending:true}).limit(1).maybeSingle();
 if(rateError)throw new Error("Customer weight rate could not be loaded.");if(!rate)return empty(true,`${card.card_name}: no price for ${billable.toFixed(2)} kg.`);
 return{configured:true,amount:Number(rate.rate),currency:card.currency,cardName:card.card_name,reason:null};
}
