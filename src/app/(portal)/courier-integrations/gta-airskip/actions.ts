"use server";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { buildGtaShipment, type GtaOptions } from "@/lib/gta-airskip";
import { getGtaConfig, requestGtaLabel, requestGtaRates, requestGtaTracking, safeGtaError, GtaApiError } from "@/lib/gta-airskip-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Shipment } from "@/lib/shipments";
export type GtaState = { status: "idle" | "success" | "error"; message: string; bookingId?: string; tracking?: string; rates?: {service: string; cost: number; tax: number | null}[]; history?: { status: string; standardStatus: number | null; date: string; events: {name: string; location: string; date: string}[] } };
const roles = ["super_admin", "operations_admin", "dispatcher"] as const;
const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const number = (form: FormData, key: string) => field(form,key) ? Number(field(form,key)) : NaN;
const fail = (message: string): GtaState => ({ status: "error", message });
function options(form: FormData): GtaOptions {
  const count = number(form, "item_count");
  if (!Number.isSafeInteger(count) || count < 0 || count > 100) throw new Error("Use zero to 100 customs items.");
  return { terminal: field(form,"terminal"), destinationTerminal: field(form,"destination_terminal"), service: field(form,"service"), piecesType: field(form,"pieces_type"),
    length: number(form,"length"), width: number(form,"width"), height: number(form,"height"), signature: field(form,"signature") === "on", insurance: field(form,"insurance") === "on", insuranceValue: number(form,"insurance_value"),
    items: Array.from({length:count}, (_,i) => ({ description: field(form,`description_${i}`), weight: number(form,`weight_${i}`), hsCode: field(form,`hs_${i}`), declaredValue: number(form,`value_${i}`), currency: field(form,`currency_${i}`), quantity: number(form,`quantity_${i}`) })) };
}
async function context(form: FormData) {
  const profile = await requireProfile(roles);
  const config = getGtaConfig(profile.organization_id);
  if (!config || !profile.organization_id) throw new Error("GTA API keys and environment are not configured for this courier company.");
  const { data, error } = await (await createClient()).from("shipments").select("*").eq("organization_id",profile.organization_id).eq("tracking_number",field(form,"awb").toUpperCase()).is("deleted_at",null).maybeSingle();
  if (error || !data) throw new Error("FastDrop AWB was not found in this courier company.");
  if (field(form,"confirm_induction") !== "on") throw new Error("Confirm that the saved sender address is the GTA induction location.");
  return { profile, config, shipment: data as Shipment };
}
export async function checkGtaRates(_state: GtaState, form: FormData): Promise<GtaState> {
  let ctx: Awaited<ReturnType<typeof context>>, payload;
  try { ctx = await context(form); payload = buildGtaShipment(ctx.shipment,options(form)); } catch (issue) { unstable_rethrow(issue); return fail(issue instanceof Error ? issue.message : "Review shipment details."); }
  try { return {status:"success", message:"GTA rates received. No AWB was created. Amounts use the GTA account currency; tax is shown separately.", rates:await requestGtaRates(payload,ctx.config)}; }
  catch(issue) { return fail(safeGtaError(issue) + " No AWB was created by this rate check."); }
}
export async function generateGtaAwb(_state: GtaState, form: FormData): Promise<GtaState> {
  let ctx: Awaited<ReturnType<typeof context>>;
  try { ctx = await context(form); } catch(issue) { unstable_rethrow(issue); return fail(issue instanceof Error ? issue.message : "Review shipment details."); }
  const {profile,config,shipment} = ctx;
  if (!config.test && (!config.liveEnabled || field(form,"confirm_live") !== "on")) return fail("Production booking must be enabled and shipping charges explicitly confirmed.");
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return fail("Carrier storage is not configured. No booking was sent."); }
  const finish = async (booking: {id:string; partner_tracking_number:string}) => {
    const {error} = await admin.rpc("finalize_gta_airskip_booking",{p_booking_id:booking.id,p_organization_id:profile.organization_id});
    if(error) return fail(`GTA AWB ${booking.partner_tracking_number} is saved, but the local partner link needs attention. Submit again to retry linking without another carrier request.`);
    revalidatePath("/courier-integrations/gta-airskip"); revalidatePath(`/shipments/${shipment.id}`);
    return {status:"success" as const,message:`${config.test ? "QA" : "Production"} label is ready.`,bookingId:booking.id,tracking:booking.partner_tracking_number};
  };
  const {data:existing,error:readError} = await admin.from("gta_airskip_bookings").select("id,status,partner_tracking_number,base_url").eq("organization_id",profile.organization_id!).eq("shipment_id",shipment.id).eq("is_test",config.test).maybeSingle();
  if(readError) return fail("Carrier storage is unavailable. No booking was sent.");
  if(existing) {
    if(existing.base_url !== config.baseUrl) return fail("This booking belongs to a different API environment. Ask the administrator to review it.");
    if(["generated","ready"].includes(existing.status) && existing.partner_tracking_number) return finish(existing);
    return fail("This parcel already has an unconfirmed GTA booking. Check GTA with the FastDrop reference. Duplicate booking is blocked.");
  }
  let payload: ReturnType<typeof buildGtaShipment>;
  try { payload = buildGtaShipment(shipment,options(form)); } catch(issue) { unstable_rethrow(issue); return fail(issue instanceof Error ? issue.message : "Review shipment details."); }
  const {data:bookingId,error:reserveError} = await admin.rpc("reserve_gta_airskip_booking", {p_organization_id:profile.organization_id,p_shipment_id:shipment.id,p_is_test:config.test,p_service:payload.service || "automatic",p_base_url:config.baseUrl,p_actor:profile.id});
  if(reserveError || typeof bookingId !== "string") return fail("Shipment is reserved, linked to a partner, assigned to a driver or no longer eligible. No new booking was sent.");
  let result: Awaited<ReturnType<typeof requestGtaLabel>>;
  try { result = await requestGtaLabel({...payload,idempotencyKey:bookingId},config); }
  catch(issue) {
    await admin.from("gta_airskip_bookings").update({status:"needs_review",...(issue instanceof GtaApiError && issue.tracking ? {partner_tracking_number:issue.tracking} : {})}).eq("id",bookingId).eq("organization_id",profile.organization_id!);
    revalidatePath("/courier-integrations/gta-airskip");
    return fail(safeGtaError(issue) + " Check GTA with the FastDrop reference before retrying. Duplicate booking remains blocked.");
  }
  const {error:saveError} = await admin.from("gta_airskip_bookings").update({status:"generated",partner_tracking_number:result.tracking,label_base64:result.label,label_format:result.format,load_number:result.loadNumber,response_metadata:{cost:result.cost}}).eq("id",bookingId).eq("organization_id",profile.organization_id!);
  if(saveError) return fail(`GTA generated AWB ${result.tracking}, but saving failed. Recover the label from GTA. Do not rebook.`);
  return finish({id:bookingId,partner_tracking_number:result.tracking});
}
export async function checkGtaTracking(_state: GtaState, form: FormData): Promise<GtaState> {
  const profile = await requireProfile(roles), config = getGtaConfig(profile.organization_id);
  if(!config || !profile.organization_id) return fail("GTA is not configured for this courier company.");
  if(!/^[0-9a-f-]{36}$/i.test(field(form,"booking_id"))) return fail("Select a saved GTA booking.");
  try {
    const {data,error} = await createAdminClient().from("gta_airskip_bookings").select("partner_tracking_number,base_url").eq("id",field(form,"booking_id")).eq("organization_id",profile.organization_id).maybeSingle();
    if(error || !data?.partner_tracking_number || data.base_url !== config.baseUrl) return fail("Tracking is unavailable for this booking in the configured API environment.");
    return {status:"success",message:"Latest GTA tracking received. FastDrop shipment custody is unchanged.",history:await requestGtaTracking(data.partner_tracking_number,config)};
  } catch(issue) { return fail(safeGtaError(issue)); }
}
