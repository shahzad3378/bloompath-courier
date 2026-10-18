"use server";

import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { type Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export type ScanPrintBranding = {
  name: string;
  legalName: string | null;
  logoUrl: string | null;
  location: string;
  currency: string;
};

export type ScanPrintLookup =
  | { ok: true; shipment: Shipment; branding: ScanPrintBranding }
  | { ok: false; message: string };

export async function lookupShipmentForLabel(rawAwb: string): Promise<ScanPrintLookup> {
  const profile = await requireProfile(internalRoles);
  const awb = String(rawAwb ?? "").trim().toUpperCase();

  if (!awb || awb.length > 80) {
    return { ok: false, message: "Scan or enter a valid AWB number." };
  }

  if (!profile.organization_id) {
    return { ok: false, message: "Your account is not linked to an organization." };
  }

  const supabase = await createClient();
  const [{ data: matches, error }, { data: settings }, { data: primaryCountry }] = await Promise.all([
    supabase
      .from("shipments")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("tracking_number", awb)
      .is("deleted_at", null)
      .limit(2),
    supabase
      .from("organization_settings")
      .select("display_name, awb_brand_name, legal_name, logo_url, city, currency")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    supabase
      .from("organization_countries")
      .select("country_code")
      .eq("organization_id", profile.organization_id)
      .eq("is_primary", true)
      .maybeSingle(),
  ]);

  if (error) {
    return { ok: false, message: "Shipment lookup failed. Check the connection and scan again." };
  }

  if ((matches ?? []).length > 1) {
    return { ok: false, message: "This AWB appears more than once. Ask an administrator to check the shipment records." };
  }

  const shipment = matches?.[0] as Shipment | undefined;
  if (!shipment) {
    return { ok: false, message: `${awb} was not found in your organization. Check the AWB and scan again.` };
  }

  return {
    ok: true,
    shipment,
    branding: {
      name: settings?.awb_brand_name || settings?.display_name || "BloomPath Courier",
      legalName: settings?.legal_name || null,
      logoUrl: settings?.logo_url || null,
      location: settings?.city || primaryCountry?.country_code || shipment.consignee_country_code || "Operations",
      currency: settings?.currency || shipment.currency || "AED",
    },
  };
}
