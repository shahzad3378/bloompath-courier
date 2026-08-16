import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requirePlatformAdmin() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId =
    typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const admin = createAdminClient();

  const { data: platformAdmin, error } = await admin
    .from("platform_admins")
    .select("user_id, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !platformAdmin) {
    redirect("/dashboard");
  }

  return {
    userId,
    email:
      typeof claimsData?.claims?.email === "string"
        ? claimsData.claims.email
        : "",
  };
}
