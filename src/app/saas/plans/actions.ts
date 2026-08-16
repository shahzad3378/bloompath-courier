"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { createAdminClient } from "@/lib/supabase/admin";

function numberValue(
  formData: FormData,
  key: string,
) {
  const raw = String(formData.get(key) ?? "").trim();

  if (!raw) return null;

  const value = Number(raw);

  return Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function integerLimit(
  formData: FormData,
  key: string,
) {
  const raw = String(formData.get(key) ?? "").trim();

  if (!raw) return null;

  const value = Number(raw);

  return Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function checked(
  formData: FormData,
  key: string,
) {
  return formData.get(key) === "on";
}

export async function updateSaasPlanAction(
  formData: FormData,
) {
  await requirePlatformAdmin();

  const planId = Number(
    String(formData.get("plan_id") ?? ""),
  );

  const monthlyPrice = numberValue(
    formData,
    "monthly_price",
  );

  const annualPrice = numberValue(
    formData,
    "annual_price",
  );

  const maxInternalUsers = integerLimit(
    formData,
    "max_internal_users",
  );

  const maxDrivers = integerLimit(
    formData,
    "max_drivers",
  );

  const maxShippers = integerLimit(
    formData,
    "max_shippers",
  );

  const maxAwbsPerMonth = integerLimit(
    formData,
    "max_awbs_per_month",
  );

  if (
    !Number.isInteger(planId) ||
    planId <= 0 ||
    monthlyPrice === null ||
    annualPrice === null
  ) {
    redirect("/saas/plans?error=invalid");
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("saas_plans")
    .update({
      monthly_price: monthlyPrice,
      annual_price: annualPrice,

      max_internal_users: maxInternalUsers,
      max_drivers: maxDrivers,
      max_shippers: maxShippers,
      max_awbs_per_month: maxAwbsPerMonth,

      custom_reports_enabled: checked(
        formData,
        "custom_reports_enabled",
      ),

      live_map_enabled: checked(
        formData,
        "live_map_enabled",
      ),

      api_enabled: checked(
        formData,
        "api_enabled",
      ),

      white_label_enabled: checked(
        formData,
        "white_label_enabled",
      ),

      custom_domain_enabled: checked(
        formData,
        "custom_domain_enabled",
      ),

      is_active: checked(
        formData,
        "is_active",
      ),
    })
    .eq("id", planId);

  if (error) {
    console.error("SaaS plan update failed:", error);
    redirect(`/saas/plans?error=save&plan=${planId}`);
  }

  revalidatePath("/saas");
  revalidatePath("/saas/plans");
  revalidatePath("/saas/companies/new");

  redirect(`/saas/plans?saved=${planId}`);
}
