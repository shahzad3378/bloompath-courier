import { getCurrentProfile } from "@/lib/auth";
import { getGtaBookingConfig, requestGtaReprint } from "@/lib/gta-airskip-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active" || !["super_admin", "operations_admin", "dispatcher"].includes(profile.role) || !profile.organization_id) return new Response("Unauthorized", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("gta_airskip_bookings").select("label_base64, label_format, is_test, partner_tracking_number, base_url").eq("id", id).eq("organization_id", profile.organization_id).in("status", ["generated", "ready", "needs_review"]).maybeSingle();
  if (error || !data) return new Response("Label unavailable", { status: 404 });
  const format = new URL(request.url).searchParams.get("format") || "PDF";
  if (!["PDF","PNG","ZPL","stored"].includes(format)) return new Response("Unsupported label format", {status:400});
  let bytes: Buffer, extension: string;
  if(format === "stored") {
    if(!data.label_base64 || !["png","zpl"].includes(data.label_format)) return new Response("Stored label unavailable", {status:404});
    bytes = Buffer.from(data.label_base64,"base64"); extension = data.label_format;
  } else {
    const config = getGtaBookingConfig(profile.organization_id, data.base_url);
    if(!config || !data.partner_tracking_number) return new Response("Reprint is unavailable. Use the saved label or recover this booking.", {status:404});
    try { bytes = await requestGtaReprint(data.partner_tracking_number,format as "PDF" | "PNG" | "ZPL",config); extension = format.toLowerCase(); }
    catch { return new Response("GTA label reprint failed. Use the saved label or ask GTA to recover the label; do not create another shipment.", {status:502}); }
  }
  const type = extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : "text/plain";
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="gta-airskip-${data.is_test ? "test-" : ""}${id}.${extension}"`,
  } });
}
