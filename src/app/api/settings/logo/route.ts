import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, organization_id, role, status")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (!profile || profile.status !== "active" || profile.role !== "super_admin" || !profile.organization_id) {
      return NextResponse.json({ error: "Super Admin access is required to upload company branding." }, { status: 403 });
    }

    const formData = await request.formData();
    const logo = formData.get("logo");
    if (!(logo instanceof File) || logo.size === 0) return NextResponse.json({ error: "Choose a logo image first." }, { status: 400 });
    if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type)) return NextResponse.json({ error: "Upload a PNG, JPG or WebP logo." }, { status: 400 });
    if (logo.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Logo must be smaller than 2 MB." }, { status: 400 });

    const admin = createAdminClient();
    const extension = logo.type === "image/jpeg" ? "jpg" : logo.type === "image/webp" ? "webp" : "png";
    const objectPath = `${profile.organization_id}/logo.${extension}`;
    const bytes = Buffer.from(await logo.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("tenant-branding")
      .upload(objectPath, bytes, { contentType: logo.type, upsert: true });

    if (uploadError) {
      console.error("TENANT_LOGO_UPLOAD_ERROR", uploadError);
      return NextResponse.json({ error: uploadError.message || "Logo storage upload failed." }, { status: 500 });
    }

    const logoUrl = admin.storage.from("tenant-branding").getPublicUrl(objectPath).data.publicUrl;
    const { error: updateError } = await admin
      .from("organization_settings")
      .update({ logo_url: logoUrl })
      .eq("organization_id", profile.organization_id);

    if (updateError) {
      console.error("TENANT_LOGO_SETTINGS_ERROR", updateError);
      return NextResponse.json({ error: updateError.message || "Logo was uploaded but could not be attached to organization settings." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, logoUrl });
  } catch (error) {
    console.error("TENANT_LOGO_ROUTE_ERROR", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Company logo could not be uploaded." }, { status: 500 });
  }
}
