import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { PortalShell } from "@/components/portal-shell";
import { DriverLocationTracker } from "@/components/driver-location-tracker";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  let profile = await requireProfile();

  let isCanadaPortal = false;

  let branding = {
    displayName: "BloomPath",
    logoUrl: null as string | null,
  };

  const admin = createAdminClient();
  const portalBrand = (await cookies()).get("bp_portal_brand")?.value;

  if (profile.role === "shipper" && profile.organization_id) {
    const { data: shipperBusiness } = await admin
      .from("shipper_business_profiles")
      .select("company_name")
      .eq("shipper_id", profile.id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    if (shipperBusiness?.company_name) {
      profile = { ...profile, full_name: shipperBusiness.company_name };
    }
  }


  const { data: platformAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .maybeSingle();

  const isPlatformAdmin = Boolean(platformAdmin);

  if (profile.organization_id) {
    const supabase = await createClient();

    const [{ data: settings }, { data: primaryCountry }] = await Promise.all([
      supabase
        .from("organization_settings")
        .select("display_name, awb_brand_name, logo_url")
        .eq("organization_id", profile.organization_id)
        .maybeSingle(),
      supabase
        .from("organization_countries")
        .select("country_code")
        .eq("organization_id", profile.organization_id)
        .eq("is_primary", true)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    isCanadaPortal = primaryCountry?.country_code === "CA";

    branding = {
      displayName:
        settings?.display_name ||
        settings?.awb_brand_name ||
        "BloomPath",
      logoUrl: settings?.logo_url || null,
    };
  }

  if (profile.role === "shipper" && portalBrand === "fastdrop") {
    branding = { displayName: "Fast Drop", logoUrl: null };
  }

  return (
    <PortalShell
      profile={profile}
      branding={branding}
      isPlatformAdmin={isPlatformAdmin}
      isCanadaPortal={isCanadaPortal}
    >
      {profile.role === "driver" && profile.organization_id ? (
        <DriverLocationTracker
          driverId={profile.id}
          organizationId={profile.organization_id}
        />
      ) : null}
      {children}
    </PortalShell>
  );
}
