import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getShipperDirectory, resolveOrganizationCurrency } from "@/lib/organization-finance";

export async function allBillingRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await query(from, from + 999);
    if (result.error) throw new Error("Billing records could not be loaded. Please retry.");
    rows.push(...result.data ?? []);
    if ((result.data?.length ?? 0) < 1000) return rows;
  }
}

export async function billingContext(organizationId: string) {
  const db = await createClient();
  const [directory, currency, { data: settings }, { data: organization }, { data: market }] = await Promise.all([
    getShipperDirectory(db, organizationId), resolveOrganizationCurrency(db, organizationId),
    db.from("organization_settings").select("display_name, legal_name").eq("organization_id", organizationId).maybeSingle(),
    db.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    db.from("organization_countries").select("country_code").eq("organization_id", organizationId).eq("is_primary", true).eq("is_active", true).maybeSingle(),
  ]);
  const timeZones: Record<string, string> = { CA: "America/Toronto", US: "America/New_York", AE: "Asia/Dubai", SA: "Asia/Riyadh", PK: "Asia/Karachi", NP: "Asia/Kathmandu", IN: "Asia/Kolkata" };
  return { db, directory, currency, company: settings?.display_name || settings?.legal_name || organization?.name || "Courier Company", timeZone: timeZones[market?.country_code || ""] || "UTC" };
}

export function billingDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
