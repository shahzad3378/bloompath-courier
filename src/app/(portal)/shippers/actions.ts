"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const rateRoles = ["super_admin", "operations_admin", "finance_staff"] as const;

function money(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 999999.99
    ? value
    : null;
}

export async function saveShipperRateAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(rateRoles);

  const shipperId = String(formData.get("shipper_id") ?? "");
  const deliveryRate = money(formData, "delivery_rate");
  const returnChargeEnabled =
    String(formData.get("return_charge_enabled") ?? "") === "true";
  const returnRate = returnChargeEnabled
    ? money(formData, "return_rate")
    : 0;

  if (
    !profile.organization_id ||
    !/^[0-9a-f-]{36}$/i.test(shipperId) ||
    deliveryRate === null ||
    returnRate === null
  ) {
    redirect("/shippers?error=invalid");
  }

  const supabase = await createClient();

  const { data: shipper } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", shipperId)
    .eq("organization_id", profile.organization_id)
    .eq("role", "shipper")
    .maybeSingle();

  if (!shipper) {
    redirect("/shippers?error=shipper");
  }

  const now = new Date().toISOString();

  const { error: closeError } = await supabase
    .from("shipper_rates")
    .update({ effective_to: now })
    .eq("organization_id", profile.organization_id)
    .eq("shipper_id", shipperId)
    .is("effective_to", null);

  if (closeError) {
    redirect(`/shippers?error=rate&shipper=${shipperId}`);
  }

  const { error } = await supabase.from("shipper_rates").insert({
    organization_id: profile.organization_id,
    shipper_id: shipperId,
    delivery_rate: deliveryRate,
    return_charge_enabled: returnChargeEnabled,
    return_rate: returnChargeEnabled ? returnRate : 0,
    currency: "AED",
    effective_from: now,
    created_by: profile.id,
  });

  if (error) {
    redirect(`/shippers?error=rate&shipper=${shipperId}`);
  }

  revalidatePath("/shippers");
  revalidatePath("/finance");
  redirect(`/shippers?saved=1&shipper=${shipperId}`);
}
