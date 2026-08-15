"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  shipmentDeleteDelegateRoles,
  type AppRole,
} from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const creatableRoles: readonly AppRole[] = [
  "operations_admin",
  "warehouse_staff",
  "dispatcher",
  "driver",
  "finance_staff",
  "customer_service",
];

function clean(
  formData: FormData,
  key: string,
  maxLength: number,
) {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, maxLength);
}

export async function createInternalUserAction(
  formData: FormData,
): Promise<void> {
  const profile = await requireProfile(["super_admin"]);

  if (!profile.organization_id) {
    redirect("/users?error=organization");
  }

  const fullName = clean(formData, "full_name", 120);
  const email = clean(formData, "email", 180).toLowerCase();
  const phone = clean(formData, "phone", 30);
  const employeeCode = clean(formData, "employee_code", 50);
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as AppRole;
  const status = String(formData.get("status") ?? "active");

  const vehicleNumber = clean(formData, "vehicle_number", 80);
  const plateNumber = clean(formData, "plate_number", 80);
  const drivingLicenceNumber = clean(
    formData,
    "driving_licence_number",
    100,
  );
  const licenceExpiry =
    clean(formData, "licence_expiry", 20) || null;

  if (
    fullName.length < 2 ||
    !email.includes("@") ||
    password.length < 8 ||
    !creatableRoles.includes(role) ||
    !["active", "inactive", "suspended"].includes(status)
  ) {
    redirect("/users?error=invalid");
  }

  const admin = createAdminClient();

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
      },
    });

  if (authError || !authData.user) {
    console.error("CREATE_INTERNAL_USER_AUTH_ERROR", authError);
    redirect("/users?error=account");
  }

  const userId = authData.user.id;

  try {
    const { data: updatedProfile, error: profileError } =
      await admin
        .from("profiles")
        .update({
          organization_id: profile.organization_id,
          full_name: fullName,
          email,
          phone: phone || null,
          employee_code: employeeCode || null,
          role,
          status,
          can_delete_shipments: false,
        })
        .eq("id", userId)
        .select("id")
        .maybeSingle();

    if (profileError || !updatedProfile) {
      console.error(
        "CREATE_INTERNAL_USER_PROFILE_ERROR",
        profileError,
      );

      throw (
        profileError ??
        new Error("Auto-created user profile was not found.")
      );
    }

    if (role === "driver") {
      const { error: driverError } = await admin
        .from("driver_profiles")
        .insert({
          driver_id: userId,
          organization_id: profile.organization_id,
          vehicle_number: vehicleNumber || null,
          plate_number: plateNumber || null,
          driving_licence_number:
            drivingLicenceNumber || null,
          licence_expiry: licenceExpiry,
        });

      if (driverError) {
        console.error(
          "CREATE_DRIVER_PROFILE_ERROR",
          driverError,
        );
        throw driverError;
      }
    }
  } catch (error) {
    console.error("CREATE_INTERNAL_USER_FAILED", error);
    await admin.auth.admin.deleteUser(userId);
    redirect("/users?error=create");
  }

  revalidatePath("/users");
  revalidatePath("/dispatch");
  redirect(`/users?created=1&user=${userId}`);
}

export async function setUserStatusAction(
  formData: FormData,
): Promise<void> {
  const profile = await requireProfile(["super_admin"]);

  const targetId = String(formData.get("profile_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (
    !profile.organization_id ||
    !/^[0-9a-f-]{36}$/i.test(targetId) ||
    targetId === profile.id ||
    !["active", "suspended", "inactive"].includes(status)
  ) {
    redirect("/users?error=status");
  }

  const admin = createAdminClient();

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", targetId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (
    targetError ||
    !target ||
    target.role === "super_admin"
  ) {
    redirect("/users?error=status");
  }

  const { error } = await admin
    .from("profiles")
    .update({ status })
    .eq("id", targetId)
    .eq("organization_id", profile.organization_id);

  if (error) {
    redirect("/users?error=status");
  }

  revalidatePath("/users");
  revalidatePath("/dispatch");
  redirect("/users?status_saved=1");
}

export async function setShipmentDeletePermissionAction(
  formData: FormData,
): Promise<void> {
  const profile = await requireProfile(["super_admin"]);

  const targetId = String(
    formData.get("profile_id") ?? "",
  );

  const enabled =
    String(formData.get("enabled") ?? "") === "true";

  if (
    !profile.organization_id ||
    !/^[0-9a-f-]{36}$/i.test(targetId) ||
    targetId === profile.id
  ) {
    redirect("/users?error=invalid");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .update({
      can_delete_shipments: enabled,
    })
    .eq("id", targetId)
    .eq(
      "organization_id",
      profile.organization_id,
    )
    .in("role", [...shipmentDeleteDelegateRoles])
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/users?error=update");
  }

  revalidatePath("/users");
  redirect("/users?saved=1");
}
