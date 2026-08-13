"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { shipmentDeleteDelegateRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export async function setShipmentDeletePermissionAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["super_admin"]);
  const targetId = String(formData.get("profile_id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";

  if (!profile.organization_id || !/^[0-9a-f-]{36}$/i.test(targetId) || targetId === profile.id) {
    redirect("/users?error=invalid");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ can_delete_shipments: enabled })
    .eq("id", targetId)
    .eq("organization_id", profile.organization_id)
    .in("role", [...shipmentDeleteDelegateRoles])
    .select("id")
    .maybeSingle();

  if (error || !data) redirect("/users?error=update");
  revalidatePath("/users");
  redirect("/users?saved=1");
}
