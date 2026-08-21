"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const rateRoles = ["super_admin", "operations_admin", "finance_staff"] as const;

function money(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 999999.99 ? value : null;
}

function percentage(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function vatSettings(formData: FormData) {
  const vatApplicable = String(formData.get("vat_applicable") ?? "") === "true";
  const vatRate = vatApplicable ? percentage(formData, "vat_rate") : 0;
  const vatInclusive = vatApplicable && String(formData.get("vat_inclusive") ?? "") === "true";
  const taxRegistrationNumber = vatApplicable
    ? String(formData.get("tax_registration_number") ?? "").trim().slice(0, 100)
    : "";

  return {
    valid: vatRate !== null,
    vatApplicable,
    vatRate,
    vatInclusive,
    taxRegistrationNumber: taxRegistrationNumber || null,
  };
}

async function getOrganizationCurrency(
  client: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
) {
  const { data: settings } = await client
    .from("organization_settings")
    .select("currency")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const configured = String(settings?.currency ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(configured) ? configured : "AED";
}

function parseZoneRows(formData: FormData) {
  const zoneIds = formData.getAll("zone_service_zone_id").map((value) => String(value).trim());
  const deliveryRates = formData.getAll("zone_delivery_rate").map((value) => String(value).trim());
  const returnRates = formData.getAll("zone_return_rate").map((value) => String(value).trim());
  const rows: Array<{ serviceZoneId: number; deliveryRate: number; returnRate: number }> = [];

  for (let index = 0; index < zoneIds.length; index += 1) {
    const zoneIdRaw = zoneIds[index] ?? "";
    const deliveryRaw = deliveryRates[index] ?? "";
    const returnRaw = returnRates[index] ?? "";
    if (!zoneIdRaw && !deliveryRaw) continue;

    const serviceZoneId = Number(zoneIdRaw);
    const deliveryRate = Number(deliveryRaw);
    const returnRate = returnRaw === "" ? 0 : Number(returnRaw);

    if (
      !Number.isInteger(serviceZoneId) ||
      serviceZoneId <= 0 ||
      !/^\d+(\.\d{1,2})?$/.test(deliveryRaw) ||
      !Number.isFinite(deliveryRate) ||
      deliveryRate < 0 ||
      (returnRaw !== "" && !/^\d+(\.\d{1,2})?$/.test(returnRaw)) ||
      !Number.isFinite(returnRate) ||
      returnRate < 0
    ) {
      return { valid: false as const, rows: [] };
    }

    rows.push({ serviceZoneId, deliveryRate, returnRate });
  }

  if (new Set(rows.map((row) => row.serviceZoneId)).size !== rows.length) {
    return { valid: false as const, rows: [] };
  }

  return { valid: true as const, rows };
}

export async function saveShipperRateAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(rateRoles);

  const shipperId = String(formData.get("shipper_id") ?? "");
  const deliveryRate = money(formData, "delivery_rate");
  const returnChargeEnabled = String(formData.get("return_charge_enabled") ?? "") === "true";
  const returnRate = returnChargeEnabled ? money(formData, "return_rate") : 0;
  const vat = vatSettings(formData);

  if (
    !profile.organization_id ||
    !/^[0-9a-f-]{36}$/i.test(shipperId) ||
    deliveryRate === null ||
    returnRate === null ||
    !vat.valid
  ) {
    redirect("/shippers?error=invalid");
  }

  const supabase = await createClient();
  const organizationCurrency = await getOrganizationCurrency(supabase, profile.organization_id);

  const { data: shipper } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", shipperId)
    .eq("organization_id", profile.organization_id)
    .eq("role", "shipper")
    .maybeSingle();

  if (!shipper) redirect("/shippers?error=shipper");

  const now = new Date().toISOString();

  const { error: closeError } = await supabase
    .from("shipper_rates")
    .update({ effective_to: now })
    .eq("organization_id", profile.organization_id)
    .eq("shipper_id", shipperId)
    .is("effective_to", null);

  if (closeError) redirect(`/shippers?error=rate&shipper=${shipperId}`);

  const { error } = await supabase.from("shipper_rates").insert({
    organization_id: profile.organization_id,
    shipper_id: shipperId,
    delivery_rate: deliveryRate,
    return_charge_enabled: returnChargeEnabled,
    return_rate: returnChargeEnabled ? returnRate : 0,
    vat_applicable: vat.vatApplicable,
    vat_rate: vat.vatRate,
    vat_inclusive: vat.vatInclusive,
    tax_registration_number: vat.taxRegistrationNumber,
    currency: organizationCurrency,
    effective_from: now,
    created_by: profile.id,
  });

  if (error) redirect(`/shippers?error=rate&shipper=${shipperId}`);

  revalidatePath("/shippers");
  revalidatePath("/finance");
  redirect(`/shippers?saved=1&shipper=${shipperId}`);
}

function cleanText(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

export async function createShipperAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["super_admin", "operations_admin"]);

  if (!profile.organization_id) redirect("/shippers?error=organization");

  const companyName = cleanText(formData, "company_name", 150);
  const contactPerson = cleanText(formData, "contact_person", 150);
  const email = cleanText(formData, "email", 200).toLowerCase();
  const phone = cleanText(formData, "phone", 50);
  const address = cleanText(formData, "address", 500);
  const city = cleanText(formData, "city", 100);
  const password = String(formData.get("password") ?? "");

  const deliveryRate = money(formData, "delivery_rate");
  const returnChargeEnabled = String(formData.get("return_charge_enabled") ?? "") === "true";
  const returnRate = returnChargeEnabled ? money(formData, "return_rate") : 0;
  const vat = vatSettings(formData);
  const codCycleDays = Number(String(formData.get("cod_cycle_days") ?? "7"));
  const zoneRows = parseZoneRows(formData);

  if (
    companyName.length < 2 ||
    !email.includes("@") ||
    password.length < 8 ||
    deliveryRate === null ||
    returnRate === null ||
    !vat.valid ||
    !zoneRows.valid ||
    !Number.isInteger(codCycleDays) ||
    codCycleDays < 1 ||
    codCycleDays > 90
  ) {
    redirect("/shippers?error=invalid");
  }

  const admin = createAdminClient();
  const [{ data: orgSettings }, { data: configuredZones }] = await Promise.all([
    admin
      .from("organization_settings")
      .select("currency")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    zoneRows.rows.length > 0
      ? admin
          .from("service_zones")
          .select("id")
          .eq("organization_id", profile.organization_id)
          .eq("is_active", true)
          .in("id", zoneRows.rows.map((row) => row.serviceZoneId))
      : Promise.resolve({ data: [] as Array<{ id: number }> }),
  ]);

  if ((configuredZones ?? []).length !== zoneRows.rows.length) {
    redirect("/shippers?error=zones");
  }

  const configuredCurrency = String(orgSettings?.currency ?? "").trim().toUpperCase();
  const organizationCurrency = /^[A-Z]{3}$/.test(configuredCurrency) ? configuredCurrency : "AED";

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: companyName, role: "shipper" },
  });

  if (authError || !authData.user) {
    console.error("CREATE_SHIPPER_AUTH_ERROR", authError);
    redirect("/shippers?error=account");
  }

  const userId = authData.user.id;

  try {
    const { data: updatedProfile, error: profileError } = await admin
      .from("profiles")
      .update({
        organization_id: profile.organization_id,
        full_name: companyName,
        email,
        phone: phone || null,
        role: "shipper",
        status: "active",
      })
      .eq("id", userId)
      .select("id")
      .maybeSingle();

    if (profileError || !updatedProfile) {
      throw profileError ?? new Error("Auto-created shipper profile was not found.");
    }

    const { error: businessError } = await admin.from("shipper_business_profiles").insert({
      shipper_id: userId,
      organization_id: profile.organization_id,
      company_name: companyName,
      contact_person: contactPerson || null,
      address: address || null,
      city: city || null,
      cod_cycle_days: codCycleDays,
    });
    if (businessError) throw businessError;

    const { error: rateError } = await admin.from("shipper_rates").insert({
      organization_id: profile.organization_id,
      shipper_id: userId,
      delivery_rate: deliveryRate,
      return_charge_enabled: returnChargeEnabled,
      return_rate: returnChargeEnabled ? returnRate : 0,
      vat_applicable: vat.vatApplicable,
      vat_rate: vat.vatRate,
      vat_inclusive: vat.vatInclusive,
      tax_registration_number: vat.taxRegistrationNumber,
      currency: organizationCurrency,
      effective_from: new Date().toISOString(),
      created_by: profile.id,
    });
    if (rateError) throw rateError;

    if (zoneRows.rows.length > 0) {
      const effectiveFrom = new Date().toISOString();
      const { error: zoneRateError } = await admin.from("shipper_zone_rates").insert(
        zoneRows.rows.map((row) => ({
          organization_id: profile.organization_id,
          shipper_id: userId,
          service_zone_id: row.serviceZoneId,
          service_type: "standard",
          delivery_rate: row.deliveryRate,
          return_charge_enabled: row.returnRate > 0,
          return_rate: row.returnRate,
          currency: organizationCurrency,
          weight_from_kg: 0,
          weight_to_kg: null,
          additional_kg_rate: 0,
          cod_fee: 0,
          is_active: true,
          effective_from: effectiveFrom,
          created_by: profile.id,
        })),
      );
      if (zoneRateError) throw zoneRateError;
    }
  } catch (error) {
    console.error("CREATE_SHIPPER_FAILED", error);
    await admin.auth.admin.deleteUser(userId);
    redirect("/shippers?error=create");
  }

  revalidatePath("/shippers");
  revalidatePath("/users");
  revalidatePath("/finance");
  redirect(`/shippers?created=1&shipper=${userId}&zones=${zoneRows.rows.length}`);
}

export async function setShipperStatusAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["super_admin", "operations_admin"]);
  const shipperId = String(formData.get("shipper_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (
    !profile.organization_id ||
    !/^[0-9a-f-]{36}$/i.test(shipperId) ||
    !["active", "suspended", "inactive"].includes(status)
  ) {
    redirect("/shippers?error=status");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", shipperId)
    .eq("organization_id", profile.organization_id)
    .eq("role", "shipper")
    .select("id")
    .maybeSingle();

  if (error || !data) redirect("/shippers?error=status");

  revalidatePath("/shippers");
  revalidatePath("/shipments");
  redirect(`/shippers?status_saved=1&shipper=${shipperId}`);
}
