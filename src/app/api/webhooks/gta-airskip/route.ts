import { createAdminClient } from "@/lib/supabase/admin";
import { getGtaConfig, requestGtaTracking, gtaProductionUrl } from "@/lib/gta-airskip-server";
import { gtaWebhookHint } from "@/lib/gta-airskip-webhook";
export const runtime = "nodejs";
export const maxDuration = 60;
const accepted = () => new Response(null,{status:202});
export async function POST(request: Request) {
  // No callback status/location/PII is trusted or stored. Only an exact known live booking can trigger a pull.
  const organization = process.env.GTA_AIRSKIP_ORGANIZATION_ID || null, config = getGtaConfig(organization);
  if (!config || config.baseUrl !== gtaProductionUrl) return accepted();
  if (!request.headers.get("content-type")?.includes("application/json")) return new Response(null,{status:415});
  const reader = request.body?.getReader();
  if (!reader) return new Response(null,{status:400});
  const chunks: Uint8Array[] = []; let size = 0;
  try { while(true) {const {value,done} = await reader.read(); if(done) break; size+=value.length; if(size>65536) {await reader.cancel();return new Response(null,{status:413});} chunks.push(value);} }
  catch {return new Response(null,{status:400});}
  let hint;
  try {hint = gtaWebhookHint(JSON.parse(Buffer.concat(chunks).toString("utf8")));} catch {return new Response(null,{status:400});}
  if(!hint) return new Response(null,{status:400});
  try {
    const admin = createAdminClient();
    const {data:booking,error} = await admin.from("gta_airskip_bookings").select("id,response_metadata").eq("organization_id",organization!).eq("base_url",config.baseUrl).eq("is_test",false).eq("partner_tracking_number",hint.tracking).eq("load_number",hint.load).in("status",["generated","ready"]).maybeSingle();
    if(error || !booking) return accepted();
    const metadata = booking.response_metadata && typeof booking.response_metadata === "object" && !Array.isArray(booking.response_metadata) ? booking.response_metadata as Record<string,unknown> : {};
    const previous = typeof metadata.webhookPullAttempt === "string" ? Date.parse(metadata.webhookPullAttempt) : NaN;
    if(Number.isFinite(previous) && Date.now()-previous<60000) return accepted();
    // Persistent compare-and-swap prevents concurrent callback amplification across instances.
    const now = new Date().toISOString();
    let update = admin.from("gta_airskip_bookings").update({response_metadata:{...metadata,webhookPullAttempt:now}}).eq("id",booking.id).eq("organization_id",organization!);
    update = booking.response_metadata === null ? update.is("response_metadata",null) : update.eq("response_metadata",JSON.stringify(booking.response_metadata));
    const {data:claimed,error:claimError} = await update.select("id").maybeSingle();
    if(claimError || !claimed) return accepted();
    const tracking = await requestGtaTracking(hint.tracking,config);
    await admin.from("gta_airskip_bookings").update({response_metadata:{...metadata,webhookPullAttempt:now,trackingCheckedAt:new Date().toISOString(),tracking}}).eq("id",booking.id).eq("organization_id",organization!).contains("response_metadata",{webhookPullAttempt:now});
    // Label/event checks do not change physical custody or delivery status.
    return accepted();
  } catch {return accepted();} // GTA tries once; operator tracking checks remain the fallback.
}
