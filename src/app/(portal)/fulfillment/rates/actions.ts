"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const roles = ["super_admin", "operations_admin", "warehouse_staff", "finance_staff"] as const;
const value = (form: FormData, key: string, max = 120) => String(form.get(key) ?? "").trim().slice(0, max);

export async function saveFulfillmentGroupChargeAction(form: FormData) {
  const profile = await requireProfile(roles);
  if (!profile.organization_id) return;
  const groupName = value(form, "group_name", 80);
  const groupCode = (value(form, "group_code", 60) || groupName)
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const chargeText = value(form, "order_charge", 30);
  const amount = Number(chargeText);
  if (!groupName || !groupCode || groupCode.length > 60 || !chargeText || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return;

  const db = await createClient();
  const { error } = await db.from("fulfillment_group_charges").upsert({
    organization_id: profile.organization_id,
    group_code: groupCode,
    group_name: groupName,
    order_charge: amount,
    currency: "AED",
    created_by: profile.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,group_code" });
  if (error) console.error("FULFILLMENT_GROUP_CHARGE_SAVE", error.message);
  revalidatePath("/fulfillment/rates");
  revalidatePath("/fulfillment/products");
}
