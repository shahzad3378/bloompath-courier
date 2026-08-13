import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, type AppRole, type Profile } from "@/lib/roles";

export async function getCurrentProfile() {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, email, phone, employee_code, role, status")
    .eq("id", userId)
    .maybeSingle();

  return profile as Profile | null;
}

export async function requireProfile(allowedRoles?: readonly AppRole[]) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active") redirect("/login");
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    redirect(homeForRole(profile.role));
  }
  return profile;
}
