import { createClient } from "@/lib/supabase/server";

export async function hasCanadaPrimaryMarket(organizationId: string | null): Promise<boolean> {
  if (!organizationId) return false;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_countries")
    .select("country_code")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .eq("is_active", true)
    .maybeSingle();

  return !error && data?.country_code === "CA";
}
