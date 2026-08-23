import "server-only";

import { FALLBACK_CURRENCY } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type ShipperDirectoryEntry = {
  id: string;
  name: string;
  email: string | null;
  accountNumber: string;
};

export async function resolveOrganizationCurrency(
  supabase: ServerClient,
  organizationId: string,
) {
  const [
    { data: baseCurrency },
    { data: settings },
    { data: primaryMarket },
  ] = await Promise.all([
    supabase
      .from("organization_currencies")
      .select("currency_code")
      .eq("organization_id", organizationId)
      .eq("is_base", true)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("organization_settings")
      .select("currency")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("organization_countries")
      .select("countries!organization_countries_country_code_fkey(default_currency_code)")
      .eq("organization_id", organizationId)
      .eq("is_primary", true)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const country = Array.isArray(primaryMarket?.countries)
    ? primaryMarket.countries[0]
    : primaryMarket?.countries;

  return (
    baseCurrency?.currency_code ||
    settings?.currency ||
    country?.default_currency_code ||
    FALLBACK_CURRENCY
  );
}

export async function getShipperDirectory(
  supabase: ServerClient,
  organizationId: string,
) {
  const [
    { data: profiles },
    { data: businesses },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("organization_id", organizationId)
      .eq("role", "shipper"),
    supabase
      .from("shipper_business_profiles")
      .select("shipper_id, company_name, account_number")
      .eq("organization_id", organizationId),
  ]);

  const businessByShipper = new Map(
    (businesses ?? []).map((business) => [
      business.shipper_id,
      business,
    ]),
  );

  return new Map<string, ShipperDirectoryEntry>(
    (profiles ?? []).map((profile) => {
      const business = businessByShipper.get(profile.id);

      return [
        profile.id,
        {
          id: profile.id,
          name:
            business?.company_name ||
            profile.full_name ||
            "Shipper",
          email: profile.email || null,
          accountNumber:
            business?.account_number || "Pending",
        },
      ];
    }),
  );
}
