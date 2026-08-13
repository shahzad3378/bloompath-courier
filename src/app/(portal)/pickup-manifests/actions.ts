"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type ManifestActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const pickupRoles = ["super_admin", "operations_admin", "warehouse_staff", "dispatcher"] as const;
const warehouseRoles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

function validId(value: FormDataEntryValue | null) {
  const id = String(value ?? "");
  return /^\d+$/.test(id) ? id : null;
}

function cleanText(value: FormDataEntryValue | null, min: number, max: number) {
  const text = String(value ?? "").trim();
  return text.length >= min && text.length <= max ? text : null;
}

function workflowMessage(message: string | undefined, fallback: string) {
  const allowed = [
    "Add at least one AWB",
    "Every AWB must be active and booked",
    "Only authorized operations staff",
    "Select an active driver",
    "Only warehouse staff",
    "already been received",
    "must be picked up",
    "not available for warehouse receiving",
  ];
  return message && allowed.some((part) => message.includes(part)) ? message : fallback;
}

export async function createPickupManifestAction(
  _previousState: ManifestActionState,
  formData: FormData,
): Promise<ManifestActionState> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  if (!profile.organization_id) return { status: "error", message: "Your account is not linked to an organization." };
  const shipperName = cleanText(formData.get("shipper_name"), 2, 120);
  if (!shipperName) return { status: "error", message: "Enter a shipper or pickup account name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pickup_manifests")
    .insert({
      organization_id: profile.organization_id,
      shipper_id: profile.role === "shipper" ? profile.id : null,
      shipper_name: shipperName,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { status: "error", message: "Pickup manifest could not be created." };
  redirect(`/pickup-manifests/${data.id}`);
}

export async function addManifestShipmentAction(
  _previousState: ManifestActionState,
  formData: FormData,
): Promise<ManifestActionState> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const manifestId = validId(formData.get("manifest_id"));
  const trackingNumber = cleanText(formData.get("tracking_number"), 3, 40)?.toUpperCase();
  if (!manifestId || !trackingNumber) return { status: "error", message: "Scan or enter a valid AWB number." };

  const supabase = await createClient();
  const [{ data: manifest }, { data: shipment }] = await Promise.all([
    supabase.from("pickup_manifests").select("id, status").eq("id", manifestId).maybeSingle(),
    supabase.from("shipments").select("id, status").eq("tracking_number", trackingNumber).is("deleted_at", null).maybeSingle(),
  ]);
  if (!manifest || manifest.status !== "draft") return { status: "error", message: "This manifest is no longer open for scanning." };
  if (!shipment) return { status: "error", message: `AWB ${trackingNumber} was not found or is not accessible.` };
  if (shipment.status !== "booked") return { status: "error", message: `AWB ${trackingNumber} is ${String(shipment.status).replaceAll("_", " ")} and cannot be added.` };

  const { error } = await supabase.from("pickup_manifest_items").insert({
    manifest_id: Number(manifestId),
    shipment_id: shipment.id,
    added_by: profile.id,
  });
  if (error?.code === "23505") return { status: "error", message: `AWB ${trackingNumber} is already assigned to a pickup manifest.` };
  if (error) return { status: "error", message: `AWB ${trackingNumber} could not be added.` };

  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/pickup-manifests");
  return { status: "success", message: `AWB ${trackingNumber} added.` };
}

export async function removeManifestShipmentAction(formData: FormData): Promise<void> {
  await requireProfile([...internalRoles, "shipper"]);
  const manifestId = validId(formData.get("manifest_id"));
  const itemId = validId(formData.get("item_id"));
  if (!manifestId || !itemId) return;
  const supabase = await createClient();
  await supabase.from("pickup_manifest_items").delete().eq("id", itemId).eq("manifest_id", manifestId);
  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/pickup-manifests");
}

export async function submitPickupManifestAction(formData: FormData): Promise<void> {
  await requireProfile([...internalRoles, "shipper"]);
  const manifestId = validId(formData.get("manifest_id"));
  if (!manifestId) redirect("/pickup-manifests?error=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pickup_manifests")
    .update({ status: "ready_for_pickup" })
    .eq("id", manifestId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/pickup-manifests/${manifestId}?error=submit`);
  revalidatePath("/pickup-manifests");
  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/shipments");
  redirect(`/pickup-manifests/${manifestId}?submitted=1`);
}

export async function markManifestPickedUpAction(
  _previousState: ManifestActionState,
  formData: FormData,
): Promise<ManifestActionState> {
  await requireProfile(pickupRoles);
  const manifestId = validId(formData.get("manifest_id"));
  const driverId = String(formData.get("assigned_driver_id") ?? "").trim();
  if (!manifestId || (driverId && !/^[0-9a-f-]{36}$/i.test(driverId))) {
    return { status: "error", message: "Pickup details are invalid." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pickup_manifests")
    .update({ status: "picked_up", assigned_driver_id: driverId || null })
    .eq("id", manifestId)
    .eq("status", "ready_for_pickup")
    .select("id")
    .maybeSingle();
  if (error || !data) return { status: "error", message: workflowMessage(error?.message, "Manifest could not be marked as picked up.") };

  revalidatePath("/pickup-manifests");
  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  return { status: "success", message: "Pickup confirmed. Manifest is ready for warehouse receiving." };
}

export async function receiveManifestShipmentAction(
  _previousState: ManifestActionState,
  formData: FormData,
): Promise<ManifestActionState> {
  await requireProfile(warehouseRoles);
  const manifestId = validId(formData.get("manifest_id"));
  const trackingNumber = cleanText(formData.get("tracking_number"), 3, 40)?.toUpperCase();
  const warehouseLocation = cleanText(formData.get("warehouse_location"), 1, 50)?.toUpperCase();
  if (!manifestId || !trackingNumber || !warehouseLocation) {
    return { status: "error", message: "Scan an AWB and enter its warehouse bin/location." };
  }

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id")
    .eq("tracking_number", trackingNumber)
    .is("deleted_at", null)
    .maybeSingle();
  if (!shipment) return { status: "error", message: `AWB ${trackingNumber} was not found.` };

  const { data: item } = await supabase
    .from("pickup_manifest_items")
    .select("id, received_at")
    .eq("manifest_id", manifestId)
    .eq("shipment_id", shipment.id)
    .maybeSingle();
  if (!item) return { status: "error", message: `AWB ${trackingNumber} does not belong to this manifest.` };
  if (item.received_at) return { status: "error", message: `AWB ${trackingNumber} was already received.` };

  const { data, error } = await supabase
    .from("pickup_manifest_items")
    .update({ received_at: new Date().toISOString(), warehouse_location: warehouseLocation })
    .eq("id", item.id)
    .is("received_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { status: "error", message: workflowMessage(error?.message, `AWB ${trackingNumber} could not be received.`) };

  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/pickup-manifests");
  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  return { status: "success", message: `AWB ${trackingNumber} received in ${warehouseLocation}.` };
}
