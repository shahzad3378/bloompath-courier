import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal-shell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await requireProfile();

  let branding = {
    displayName: "BloomPath",
    logoUrl: null as string | null,
  };

  if (profile.organization_id) {
    const supabase = await createClient();

    const { data: settings } = await supabase
      .from("organization_settings")
      .select("display_name, awb_brand_name, logo_url")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    branding = {
      displayName:
        settings?.display_name ||
        settings?.awb_brand_name ||
        "BloomPath",
      logoUrl: settings?.logo_url || null,
    };
  }

  return (
    <PortalShell profile={profile} branding={branding}>
      {children}
    </PortalShell>
  );
}
