import { ShipmentForm } from "@/components/shipment-form";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Create Shipment" };

export default async function NewShipmentPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const isInternational = (await searchParams).mode === "international";
  const profile = await requireProfile([
    ...internalRoles,
    "shipper",
  ]);

  if (!profile.organization_id) {
    throw new Error("Organization is not configured.");
  }

  const supabase = await createClient();

  const [
    { data: shipperData },
    { data: organizationCountries },
  ] = await Promise.all([
    profile.role === "shipper"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("organization_id", profile.organization_id)
          .eq("role", "shipper")
          .eq("status", "active")
          .order("full_name", { ascending: true }),
    supabase
      .from("organization_countries")
      .select("country_code, is_primary")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true),
  ]);

  /*
   * Legacy fallback:
   * Existing BloomPath UAE tenant may pre-date organization_countries.
   */
  const countryCodes =
    organizationCountries &&
    organizationCountries.length > 0
      ? organizationCountries.map(
          (row) => row.country_code,
        )
      : ["AE"];

  const { data: countries } = await supabase
    .from("countries")
    .select(`
      code,
      name,
      location_strategy,
      postal_code_label
    `)
    .in("code", countryCodes)
    .eq("is_active", true)
    .order("name");

  const markets = (countries ?? []).map((country) => ({
    code: country.code,
    name: country.name,
    location_strategy: country.location_strategy,
    postal_code_label:
      country.postal_code_label || "Postal Code",
  }));

  // Keep the tenant primary market first; the form uses the first option as its default.
  const primaryCountryCode = organizationCountries?.find((country) => country.is_primary)?.country_code;
  const primaryIndex = markets.findIndex((market) => market.code === primaryCountryCode);
  if (primaryIndex > 0) markets.unshift(...markets.splice(primaryIndex, 1));



  return (
    <ShipmentForm
      shippers={(shipperData ?? []).map((shipper) => ({
        id: shipper.id,
        full_name:
          shipper.full_name || shipper.email,
        email: shipper.email,
      }))}
      requiresShipperSelection={
        profile.role !== "shipper"
      }
      markets={markets}
      isInternational={isInternational}
    />
  );
}
