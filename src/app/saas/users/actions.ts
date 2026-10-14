"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { internalRoles, type AppRole } from "@/lib/roles";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const platformManagedRoles = internalRoles;

function clean(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function userEditPath(id: string, query: string) {
  return `/saas/users/${id}?${query}`;
}

export async function updateTenantUserDetailsAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();

  const userId = String(formData.get("user_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) redirect("/saas/users?error=invalid");

  const fullName = clean(formData, "full_name", 120);
  const email = clean(formData, "email", 180).toLowerCase();
  const phone = clean(formData, "phone", 30);
  const employeeCode = clean(formData, "employee_code", 50);
  if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(userEditPath(userId, "error=invalid"));
  }

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin.from("profiles")
    .select("id, organization_id, email, role, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (targetError || !target?.organization_id || target.role === "shipper") {
    redirect("/saas/users?error=target");
  }

  const previousEmail = target.email ?? "";
  if (email !== previousEmail.toLowerCase()) {
    const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) redirect(userEditPath(userId, "error=email"));
  }

  const { data: saved, error } = await admin.from("profiles")
    .update({ full_name: fullName, email, phone: phone || null, employee_code: employeeCode || null })
    .eq("id", userId)
    .eq("organization_id", target.organization_id)
    .eq("updated_at", target.updated_at)
    .select("id")
    .maybeSingle();

  if (error || !saved) {
    if (email !== previousEmail.toLowerCase()) {
      const { error: rollbackError } = await admin.auth.admin.updateUserById(userId, { email: previousEmail, email_confirm: true });
      if (rollbackError) console.error("SAAS_USER_EMAIL_ROLLBACK_ERROR", rollbackError);
    }
    redirect(userEditPath(userId, "error=save"));
  }

  revalidatePath("/saas/users");
  revalidatePath(`/saas/users/${userId}`);
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
  redirect(userEditPath(userId, "saved=1"));
}

export async function updateTenantUserRoleAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();

  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as AppRole;
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !platformManagedRoles.includes(role)) {
    redirect("/saas/users?error=invalid");
  }

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, organization_id, role, status")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target?.organization_id || target.role === "shipper") {
    redirect("/saas/users?error=target");
  }

  if (role === "super_admin" && target.status !== "active") {
    redirect("/saas/users?error=inactive");
  }

  if (role === "super_admin" && target.role !== "super_admin") {
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", target.organization_id)
      .eq("role", "super_admin");
    if (error || (count ?? 0) > 0) redirect("/saas/users?error=one_admin");
  }

  if (target.role === "super_admin" && target.status === "active" && role !== "super_admin") {
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", target.organization_id)
      .eq("role", "super_admin")
      .eq("status", "active");
    if (error || (count ?? 0) <= 1) redirect("/saas/users?error=last_admin");
  }

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ role, ...(role === "super_admin" ? {} : { can_delete_shipments: false }) })
    .eq("id", userId)
    .eq("organization_id", target.organization_id)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) redirect("/saas/users?error=save");

  if (role === "driver") {
    const { error } = await admin.from("driver_profiles").upsert({
      driver_id: userId,
      organization_id: target.organization_id,
    }, { onConflict: "driver_id" });
    if (error) {
      await admin.from("profiles").update({ role: target.role }).eq("id", userId).eq("organization_id", target.organization_id);
      redirect("/saas/users?error=save");
    }
  }

  revalidatePath("/saas/users");
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
  redirect("/saas/users?saved=role");
}
