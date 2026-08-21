"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const rateRoles = ["super_admin", "operations_admin", "finance_staff"] as const;
function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function amount(formData: FormData, key: string) { const raw = text(formData, key); if (!/^\d+(\.\d{1,3})?$/.test(raw)) return null; const value = Number(raw); return Number.isFinite(value) && value >= 0 ? value : null; }

export async function saveZoneRateAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(rateRoles);
  if (!profile.organization_id) redirect("/shippers?error=organization");
  const shipperId = text(formData, "shipper_id"); const serviceZoneId = Number(text(formData, "service_zone_id")); const serviceType = text(formData, "service_type");
  const deliveryRate = amount(formData, "delivery_rate"); const returnChargeEnabled = text(formData, "return_charge_enabled") === "true"; const returnRate = returnChargeEnabled ? amount(formData, "return_rate") : 0;
  const weightFrom = amount(formData, "weight_from_kg"); const weightToRaw = text(formData, "weight_to_kg"); const weightTo = weightToRaw ? amount(formData, "weight_to_kg") : null; const additionalKgRate = amount(formData, "additional_kg_rate"); const codFee = amount(formData, "cod_fee");
  if (!/^[0-9a-f-]{36}$/i.test(shipperId) || !Number.isInteger(serviceZoneId) || serviceZoneId <= 0 || !["same_day", "next_day", "standard"].includes(serviceType) || deliveryRate === null || returnRate === null || weightFrom === null || additionalKgRate === null || codFee === null || (weightTo !== null && weightTo <= weightFrom)) redirect(`/shippers/${shipperId}/zone-rates?error=invalid`);
  const supabase = await createClient();
  const [{ data: shipper }, { data: zone }, { data: settings }, { data: baseCurrencyRow }] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", shipperId).eq("organization_id", profile.organization_id).eq("role", "shipper").maybeSingle(),
    supabase.from("service_zones").select("id").eq("id", serviceZoneId).eq("organization_id", profile.organization_id).eq("is_active", true).maybeSingle(),
    supabase.from("organization_settings").select("currency").eq("organization_id", profile.organization_id).maybeSingle(),
    supabase.from("organization_currencies").select("currency_code").eq("organization_id", profile.organization_id).eq("is_base", true).eq("is_active", true).maybeSingle(),
  ]);
  if (!shipper || !zone) redirect(`/shippers/${shipperId}/zone-rates?error=reference`);
  const configuredCurrency = String(settings?.currency || baseCurrencyRow?.currency_code || "AED").trim().toUpperCase(); const currency = /^[A-Z]{3}$/.test(configuredCurrency) ? configuredCurrency : "AED";
  const { error } = await supabase.from("shipper_zone_rates").insert({ organization_id: profile.organization_id, shipper_id: shipperId, service_zone_id: serviceZoneId, service_type: serviceType, delivery_rate: deliveryRate, return_charge_enabled: returnChargeEnabled, return_rate: returnChargeEnabled ? returnRate : 0, currency, weight_from_kg: weightFrom, weight_to_kg: weightTo, additional_kg_rate: additionalKgRate, cod_fee: codFee, effective_from: new Date().toISOString(), created_by: profile.id });
  if (error) { console.error("SAVE_ZONE_RATE_ERROR", error); redirect(`/shippers/${shipperId}/zone-rates?error=save`); }
  revalidatePath(`/shippers/${shipperId}/zone-rates`); revalidatePath("/shippers"); redirect(`/shippers/${shipperId}/zone-rates?saved=1`);
}

export async function disableZoneRateAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(rateRoles); if (!profile.organization_id) redirect("/shippers?error=organization"); const shipperId = text(formData, "shipper_id"); const rateId = Number(text(formData, "rate_id"));
  if (!/^[0-9a-f-]{36}$/i.test(shipperId) || !Number.isInteger(rateId) || rateId <= 0) redirect(`/shippers/${shipperId}/zone-rates?error=invalid`);
  const { error } = await (await createClient()).from("shipper_zone_rates").update({ is_active: false, effective_to: new Date().toISOString() }).eq("id", rateId).eq("shipper_id", shipperId).eq("organization_id", profile.organization_id);
  if (error) redirect(`/shippers/${shipperId}/zone-rates?error=save`); revalidatePath(`/shippers/${shipperId}/zone-rates`); redirect(`/shippers/${shipperId}/zone-rates?disabled=1`);
}
