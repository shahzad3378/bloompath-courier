"use server";

import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { homeForRole, type Profile } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { message: string };

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!hasSupabaseEnv()) {
    return { message: "Supabase project connection is not configured yet." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) {
    return { message: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { message: "Email or password is incorrect." };
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, email, phone, employee_code, role, status, can_delete_shipments")
    .eq("id", data.user.id)
    .maybeSingle();
  const profile = profileData as Profile | null;

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return {
      message:
        profile?.status === "pending"
          ? "Your account is waiting for administrator approval."
          : "Your account is not active. Contact the administrator.",
    };
  }

  redirect(homeForRole(profile.role));
}

export async function logoutAction() {
  try {
    if (hasSupabaseEnv()) {
      const supabase = await createClient();
      const { error } = await supabase.auth.signOut();
      if (error) console.error("LOGOUT_SIGNOUT_ERROR", error);
    }
  } catch (error) {
    console.error("LOGOUT_ACTION_ERROR", error);
  }

  redirect("/login");
}
