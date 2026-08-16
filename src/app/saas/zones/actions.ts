"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const zoneTypes = [
  "postal_prefix",
  "postal_range",
  "city",
  "district",
  "area",
  "custom",
] as const;

function text(
  formData: FormData,
  key: string,
  max = 150,
) {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
}

export async function createServiceZoneAction(
  formData: FormData,
) {
  await requirePlatformAdmin();

  const organizationId = text(
    formData,
    "organization_id",
    50,
  );

  const countryCode = text(
    formData,
    "country_code",
    2,
  ).toUpperCase();

  const name = text(formData, "name");

  const zoneType = text(
    formData,
    "zone_type",
    30,
  );

  const postalPrefix = text(
    formData,
    "postal_prefix",
    30,
  ).toUpperCase();

  const postalFrom = text(
    formData,
    "postal_from",
    30,
  ).toUpperCase();

  const postalTo = text(
    formData,
    "postal_to",
    30,
  ).toUpperCase();

  const city = text(formData, "city", 120);
  const district = text(formData, "district", 120);
  const area = text(formData, "area", 120);

  if (
    !/^[0-9a-f-]{36}$/i.test(organizationId) ||
    !/^[A-Z]{2}$/.test(countryCode) ||
    name.length < 2 ||
    !zoneTypes.includes(
      zoneType as (typeof zoneTypes)[number],
    )
  ) {
    redirect("/saas/zones?error=invalid");
  }

  if (
    zoneType === "postal_prefix" &&
    !postalPrefix
  ) {
    redirect("/saas/zones?error=mapping");
  }

  if (
    zoneType === "postal_range" &&
    (!postalFrom || !postalTo)
  ) {
    redirect("/saas/zones?error=mapping");
  }

  if (zoneType === "city" && !city) {
    redirect("/saas/zones?error=mapping");
  }

  if (zoneType === "district" && !district) {
    redirect("/saas/zones?error=mapping");
  }

  if (zoneType === "area" && !area) {
    redirect("/saas/zones?error=mapping");
  }

  const admin = createAdminClient();

  const { data: allowedCountry } = await admin
    .from("organization_countries")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("country_code", countryCode)
    .eq("is_active", true)
    .maybeSingle();

  if (!allowedCountry) {
    redirect("/saas/zones?error=country");
  }

  const { error } = await admin
    .from("service_zones")
    .insert({
      organization_id: organizationId,
      country_code: countryCode,
      name,
      zone_type: zoneType,

      postal_prefix:
        zoneType === "postal_prefix"
          ? postalPrefix
          : null,

      postal_from:
        zoneType === "postal_range"
          ? postalFrom
          : null,

      postal_to:
        zoneType === "postal_range"
          ? postalTo
          : null,

      city:
        ["city", "district", "area", "custom"].includes(
          zoneType,
        ) && city
          ? city
          : null,

      district:
        ["district", "area", "custom"].includes(
          zoneType,
        ) && district
          ? district
          : null,

      area:
        ["area", "custom"].includes(zoneType) && area
          ? area
          : null,

      is_active: true,
    });

  if (error) {
    console.error(
      "Service zone creation failed:",
      error,
    );

    redirect("/saas/zones?error=save");
  }

  revalidatePath("/saas/zones");

  redirect("/saas/zones?created=1");
}

export async function toggleServiceZoneAction(
  formData: FormData,
) {
  await requirePlatformAdmin();

  const zoneId = Number(
    String(formData.get("zone_id") ?? ""),
  );

  const nextActive =
    String(formData.get("next_active") ?? "") ===
    "true";

  if (!Number.isInteger(zoneId) || zoneId <= 0) {
    redirect("/saas/zones?error=invalid");
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("service_zones")
    .update({
      is_active: nextActive,
    })
    .eq("id", zoneId);

  if (error) {
    redirect("/saas/zones?error=save");
  }

  revalidatePath("/saas/zones");

  redirect("/saas/zones?updated=1");
}
