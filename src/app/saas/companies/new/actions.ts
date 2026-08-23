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
  const primaryCountry = text(
    formData,
    "primary_country",
  ).toUpperCase();

  let operatingCountries = Array.from(
    new Set(
      formData
        .getAll("operating_countries")
        .map((value) => String(value).trim().toUpperCase())
        .filter((value) => /^[A-Z]{2}$/.test(value)),
    ),
  );

  let baseCurrency = text(
    formData,
    "base_currency",
  ).toUpperCase();

  let supportedCurrencies = Array.from(
    new Set(
      formData
        .getAll("supported_currencies")
        .map((value) => String(value).trim().toUpperCase())
        .filter((value) => /^[A-Z]{3}$/.test(value)),
    ),
  );

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
    !primaryCountry ||
    !baseCurrency ||
    operatingCountries.length === 0 ||
    supportedCurrencies.length === 0 ||
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

  const { data: primaryMarket } = await admin
    .from("countries")
    .select("code, default_currency_code")
    .eq("code", primaryCountry)
    .eq("is_active", true)
    .maybeSingle();

  if (!primaryMarket?.default_currency_code) {
    redirect("/saas/companies/new?error=market");
  }

  baseCurrency = primaryMarket.default_currency_code;
  operatingCountries = Array.from(
    new Set([...operatingCountries, primaryCountry]),
  );
  supportedCurrencies = Array.from(
    new Set([...supportedCurrencies, baseCurrency]),
  );

  const [
    { data: plan, error: planError },
    { data: validCountries },
    { data: validCurrencies },
  ] = await Promise.all([
    admin
      .from("saas_plans")
      .select("id, currency")
      .eq("id", planId)
      .eq("is_active", true)
      .maybeSingle(),

    admin
      .from("countries")
      .select("code")
      .in("code", operatingCountries)
      .eq("is_active", true),

    admin
      .from("currencies")
      .select("code")
      .in("code", supportedCurrencies)
      .eq("is_active", true),
  ]);

  if (planError || !plan) {
    redirect("/saas/companies/new?error=plan");
  }

  if (
    (validCountries ?? []).length !== operatingCountries.length ||
    (validCurrencies ?? []).length !== supportedCurrencies.length
  ) {
    redirect("/saas/companies/new?error=market");
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
        currency: baseCurrency,
      });

    if (settingsError) throw settingsError;

    const { error: countriesError } = await admin
      .from("organization_countries")
      .insert(
        operatingCountries.map((countryCode) => ({
          organization_id: organizationId,
          country_code: countryCode,
          is_primary: countryCode === primaryCountry,
          is_active: true,
        })),
      );

    if (countriesError) throw countriesError;

    const { error: currenciesError } = await admin
      .from("organization_currencies")
      .insert(
        supportedCurrencies.map((currencyCode) => ({
          organization_id: organizationId,
          currency_code: currencyCode,
          is_base: currencyCode === baseCurrency,
          is_active: true,
        })),
      );

    if (currenciesError) throw currenciesError;

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
        currency: baseCurrency,
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
