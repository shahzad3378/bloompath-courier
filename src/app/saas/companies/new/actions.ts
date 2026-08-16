"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { createAdminClient } from "@/lib/supabase/admin";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function createCourierCompany(formData: FormData) {
  await requirePlatformAdmin();

  const companyName = text(formData, "company_name");
  const slug = text(formData, "slug").toLowerCase();
  const legalName = text(formData, "legal_name");
  const contactEmail = text(formData, "contact_email").toLowerCase();
  const contactPhone = text(formData, "contact_phone");
  const currency = text(formData, "currency").toUpperCase() || "AED";
  const awbPrefix = text(formData, "awb_prefix").toUpperCase();

  const planId = Number(text(formData, "plan_id"));
  const billingCycle = text(formData, "billing_cycle");
  const trialDays = Math.max(0, Number(text(formData, "trial_days")) || 0);

  const adminName = text(formData, "admin_name");
  const adminEmail = text(formData, "admin_email").toLowerCase();
  const adminPhone = text(formData, "admin_phone");
  const temporaryPassword = text(formData, "temporary_password");

  if (
    !companyName ||
    !slug ||
    !planId ||
    !adminName ||
    !adminEmail ||
    temporaryPassword.length < 8
  ) {
    redirect("/saas/companies/new?error=missing");
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    redirect("/saas/companies/new?error=slug");
  }

  if (!/^[A-Z0-9]{2,6}$/.test(awbPrefix)) {
    redirect("/saas/companies/new?error=awb");
  }

  if (!["monthly", "annual", "custom"].includes(billingCycle)) {
    redirect("/saas/companies/new?error=billing");
  }

  const admin = createAdminClient();

  const { data: plan, error: planError } = await admin
    .from("saas_plans")
    .select("id, currency")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (planError || !plan) {
    redirect("/saas/companies/new?error=plan");
  }

  const { data: existingOrganization } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingOrganization) {
    redirect("/saas/companies/new?error=company_exists");
  }

  const { data: existingUsers } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (
    existingUsers?.users.some(
      (user) => user.email?.toLowerCase() === adminEmail,
    )
  ) {
    redirect("/saas/companies/new?error=admin_exists");
  }

  /*
   * Provisioning sequence:
   * Organization -> Settings -> Subscription -> Auth User -> Profile.
   *
   * If any later step fails, previously-created records are cleaned up.
   */
  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .insert({
      name: companyName,
      slug,
      is_active: true,
    })
    .select("id")
    .single();

  if (organizationError || !organization) {
    redirect("/saas/companies/new?error=organization");
  }

  const organizationId = organization.id;

  try {
    const { error: settingsError } = await admin
      .from("organization_settings")
      .insert({
        organization_id: organizationId,
        legal_name: legalName || companyName,
        display_name: companyName,
        contact_email: contactEmail || adminEmail,
        contact_phone: contactPhone || adminPhone || null,
        awb_brand_name: companyName,
        awb_prefix: awbPrefix,
        currency,
      });

    if (settingsError) throw settingsError;

    const now = new Date();
    const trialEnds = new Date(now);

    if (trialDays > 0) {
      trialEnds.setUTCDate(trialEnds.getUTCDate() + trialDays);
    }

    const periodEnds = new Date(now);

    if (billingCycle === "annual") {
      periodEnds.setUTCFullYear(periodEnds.getUTCFullYear() + 1);
    } else {
      periodEnds.setUTCMonth(periodEnds.getUTCMonth() + 1);
    }

    const subscriptionStatus = trialDays > 0 ? "trial" : "active";

    const { error: subscriptionError } = await admin
      .from("organization_subscriptions")
      .insert({
        organization_id: organizationId,
        plan_id: planId,
        status: subscriptionStatus,
        billing_cycle: billingCycle,
        trial_starts_at: trialDays > 0 ? now.toISOString() : null,
        trial_ends_at: trialDays > 0 ? trialEnds.toISOString() : null,
        current_period_starts_at: now.toISOString(),
        current_period_ends_at:
          billingCycle === "custom" ? null : periodEnds.toISOString(),
        next_billing_at:
          trialDays > 0
            ? trialEnds.toISOString()
            : billingCycle === "custom"
              ? null
              : periodEnds.toISOString(),
        currency,
        auto_renew: billingCycle !== "custom",
      });

    if (subscriptionError) throw subscriptionError;

    const { data: authUser, error: authError } =
      await admin.auth.admin.createUser({
        email: adminEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: adminName,
        },
      });

    if (authError || !authUser.user) {
      throw authError || new Error("Admin user could not be created.");
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        organization_id: organizationId,
        full_name: adminName,
        email: adminEmail,
        phone: adminPhone || null,
        role: "super_admin",
        status: "active",
      })
      .eq("id", authUser.user.id);

    if (profileError) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      throw profileError;
    }
  } catch (error) {
    console.error("Courier SaaS provisioning failed:", error);

    await admin
      .from("organizations")
      .delete()
      .eq("id", organizationId);

    redirect("/saas/companies/new?error=provisioning");
  }

  revalidatePath("/saas");
  redirect("/saas?created=1");
}
