"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { ManifestActionState } from "./actions";

export async function createSellerPickupManifestAction(
  _previousState: ManifestActionState,
  formData: FormData,
): Promise<ManifestActionState> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  if (!profile.organization_id) {
    return { status: "error", message: "Your account is not linked to an organization." };
  }

  const requestedShipperId = String(formData.get("shipper_id") ?? "");
  const shipperId = profile.role === "shipper" ? profile.id : requestedShipperId;
  if (!/^[0-9a-f-]{36}$/i.test(shipperId)) {
    return { status: "error", message: "Select a valid shipper." };
  }

  const supabase = await createClient();
  const [{ data: shipper }, { data: business }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", shipperId)
      .eq("organization_id", profile.organization_id)
      .eq("role", "shipper")
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("shipper_business_profiles")
      .select("company_name")
      .eq("shipper_id", shipperId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
  ]);

  if (!shipper) {
    return { status: "error", message: "Selected shipper is not active or is not part of this courier company." };
  }

  const shipperName = String(business?.company_name || shipper.full_name || shipper.email || "Shipper").slice(0, 120);
  const { data, error } = await supabase
    .from("pickup_manifests")
    .insert({
      organization_id: profile.organization_id,
      shipper_id: shipperId,
      shipper_name: shipperName,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: "Pickup manifest could not be created." };
  }

  redirect(`/pickup-manifests/${data.id}`);
}
