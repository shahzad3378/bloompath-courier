import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active" || !["super_admin", "operations_admin", "dispatcher"].includes(profile.role) || !profile.organization_id) return new Response("Unauthorized", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("gta_airskip_bookings").select("label_base64, label_format, is_test").eq("id", id).eq("organization_id", profile.organization_id).in("status", ["generated", "ready"]).maybeSingle();
  if (error || !data?.label_base64 || !["png", "zpl"].includes(data.label_format)) return new Response("Label unavailable", { status: 404 });
  const type = data.label_format === "png" ? "image/png" : "text/plain";
  return new Response(Buffer.from(data.label_base64, "base64"), { headers: {
    "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="gta-airskip-${data.is_test ? "test-" : ""}${id}.${data.label_format}"`,
  } });
}
