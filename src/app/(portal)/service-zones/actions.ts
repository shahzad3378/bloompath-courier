"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { serviceZoneTypes } from "@/lib/service-zones";
import { createAdminClient } from "@/lib/supabase/admin";

const zoneRoles = [
  "super_admin",
  "operations_admin",
] as const;

function text(
  formData: FormData,
  key: string,
  max = 160,
) {
  const value = String(
    formData.get(key) ?? "",
  ).trim();

  return value && value.length <= max
    ? value
    : null;
}

export async function createServiceZoneAction(
  formData: FormData,
) {
  const profile =
    await requireProfile(zoneRoles);

  if (!profile.organization_id) {
    redirect("/service-zones?error=organization");
  }

  const countryCode = String(
    formData.get("country_code") ?? "",
  )
    .trim()
    .toUpperCase();

  const zoneType = String(
    formData.get("zone_type") ?? "",
  );

  const postalPrefix =
    text(
      formData,
      "postal_prefix",
      30,
    )?.toUpperCase() ?? null;

  const postalFrom =
    text(
      formData,
      "postal_from",
      30,
    )?.toUpperCase() ?? null;

  const postalTo =
    text(
      formData,
      "postal_to",
      30,
    )?.toUpperCase() ?? null;

  const city = text(formData, "city", 120);
  const district = text(
    formData,
    "district",
    120,
  );
  const area = text(formData, "area", 120);

  if (
    !/^[A-Z]{2}$/.test(countryCode) ||
    !serviceZoneTypes.includes(
      zoneType as (typeof serviceZoneTypes)[number],
    ) ||
    !city ||
    (zoneType === "postal_prefix" &&
      !postalPrefix) ||
    (zoneType === "postal_range" &&
      (!postalFrom || !postalTo)) ||
    (zoneType === "district" &&
      !district) ||
    (zoneType === "area" && !area)
  ) {
    redirect("/service-zones?error=invalid");
  }

  const name =
    zoneType === "district"
      ? `${city} · ${district}`
      : zoneType === "area"
        ? `${city} · ${area}`
        : city;

  const admin = createAdminClient();

  const { data: market } = await admin
    .from("organization_countries")
    .select("country_code")
    .eq(
      "organization_id",
      profile.organization_id,
    )
    .eq("country_code", countryCode)
    .eq("is_active", true)
    .maybeSingle();

  if (!market) {
    redirect("/service-zones?error=country");
  }

  const { error } = await admin
    .from("service_zones")
    .insert({
      organization_id:
        profile.organization_id,

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

      city,

      district:
        zoneType === "district"
          ? district
          : null,

      area:
        zoneType === "area"
          ? area
          : null,

      is_active: true,
    });

  if (error) {
    console.error(
      "Service zone creation failed:",
      error,
    );

    redirect("/service-zones?error=save");
  }

  revalidatePath("/service-zones");
  redirect("/service-zones?created=1");
}

export async function toggleServiceZoneAction(
  formData: FormData,
) {
  const profile =
    await requireProfile(zoneRoles);

  const id = Number(
    String(formData.get("zone_id") ?? ""),
  );

  const active =
    String(formData.get("active")) === "true";

  if (
    !profile.organization_id ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return;
  }

  const admin = createAdminClient();

  await admin
    .from("service_zones")
    .update({
      is_active: active,
    })
    .eq("id", id)
    .eq(
      "organization_id",
      profile.organization_id,
    );

  revalidatePath("/service-zones");
}

export async function deleteServiceZoneAction(
  formData: FormData,
) {
  const profile =
    await requireProfile(zoneRoles);

  const id = Number(
    String(formData.get("zone_id") ?? ""),
  );

  if (
    !profile.organization_id ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return;
  }

  const admin = createAdminClient();

  /*
   * Delete only when no shipment references this zone.
   * FK protection will reject unsafe deletion.
   */
  await admin
    .from("service_zones")
    .delete()
    .eq("id", id)
    .eq(
      "organization_id",
      profile.organization_id,
    );

  revalidatePath("/service-zones");
}
