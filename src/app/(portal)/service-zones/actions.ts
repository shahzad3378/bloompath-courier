"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
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

  const name = text(formData, "name", 120);

  const zoneType = String(
    formData.get("zone_type") ?? "",
  );

  if (
    !/^[A-Z]{2}$/.test(countryCode) ||
    !name ||
    ![
      "postal_prefix",
      "postal_range",
      "city",
      "district",
      "area",
      "custom",
    ].includes(zoneType)
  ) {
    redirect("/service-zones?error=invalid");
  }

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
          ? text(
              formData,
              "postal_prefix",
              30,
            )?.toUpperCase()
          : null,

      postal_from:
        zoneType === "postal_range"
          ? text(
              formData,
              "postal_from",
              30,
            )?.toUpperCase()
          : null,

      postal_to:
        zoneType === "postal_range"
          ? text(
              formData,
              "postal_to",
              30,
            )?.toUpperCase()
          : null,

      city:
        zoneType === "city"
          ? text(formData, "city", 120)
          : null,

      district:
        zoneType === "district"
          ? text(
              formData,
              "district",
              120,
            )
          : null,

      area:
        zoneType === "area"
          ? text(formData, "area", 120)
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
