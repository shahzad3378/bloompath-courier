"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
 const supabase=await createClient(); const {error}=await supabase.rpc("fulfillment_advance_order",{p_order_id:orderId,p_next_status:nextStatus}); if(error)console.error("FULFILLMENT_ORDER_ADVANCE",error.message); revalidatePath("/fulfillment");
}
