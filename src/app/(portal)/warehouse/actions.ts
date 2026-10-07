"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { receiveManifestShipmentAction } from "@/app/(portal)/pickup-manifests/actions";
import { createClient } from "@/lib/supabase/server";

export type WarehouseReturnActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const warehouseRoles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

function trackingNumber(formData: FormData) {
  const value = String(formData.get("tracking_number") ?? "").trim().toUpperCase();
  return value.length >= 3 && value.length <= 40 ? value : null;
}

export async function receiveUndeliveredReturnAction(
  _previousState: WarehouseReturnActionState,
  formData: FormData,
): Promise<WarehouseReturnActionState> {
  const profile = await requireProfile(warehouseRoles);
  const tracking = trackingNumber(formData);
  if (!profile.organization_id || !tracking) {
    return { status: "error", message: "Scan or enter a valid AWB number." };
  }

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, status, delivery_attempt_count, assigned_driver_id")
    .eq("tracking_number", tracking)
    .is("deleted_at", null)
    .maybeSingle();

  if (!shipment) return { status: "error", message: `AWB ${tracking} was not found.` };
  const isReattemptReturn =
    shipment.status === "undelivered" &&
    [1, 2].includes(shipment.delivery_attempt_count);

  const isFinalReturn =
    shipment.status === "return_initiated" &&
    shipment.delivery_attempt_count >= 1 &&
    shipment.delivery_attempt_count <= 4;

  if (!isReattemptReturn && !isFinalReturn) {
    return { status: "error", message: `AWB ${tracking} is not pending a warehouse return.` };
  }
  if (!shipment.assigned_driver_id) {
    return { status: "error", message: `AWB ${tracking} has no returning driver assigned.` };
  }

  const { error } = await supabase.from("warehouse_reattempt_receipts").insert({
    organization_id: profile.organization_id,
    shipment_id: shipment.id,
    attempt_number: shipment.delivery_attempt_count,
    driver_id: shipment.assigned_driver_id,
    received_by: profile.id,
  });

  if (error?.code === "23505") {
    return { status: "error", message: `AWB ${tracking} was already received for this attempt.` };
  }
  if (error) {
    return { status: "error", message: `AWB ${tracking} could not be received. Refresh and retry.` };
  }

  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  revalidatePath("/dispatch");
  return {
    status: "success",
    message: isFinalReturn
      ? `AWB ${tracking} received at warehouse and is ready for Return to Seller.`
      : `AWB ${tracking} returned to warehouse and is ready for reattempt.`,
  };
}

export async function receiveWarehouseShipmentAction(
  _previousState: WarehouseReturnActionState,
  formData: FormData,
): Promise<WarehouseReturnActionState> {
  const profile = await requireProfile(warehouseRoles);
  const tracking = trackingNumber(formData);
  if (!profile.organization_id || !tracking) {
    return { status: "error", message: "Scan or enter a valid AWB number." };
  }
  const supabase = await createClient();
  const { data: shipment, error: lookupError } = await supabase.from("shipments")
    .select("id,status,assigned_driver_id,delivery_attempt_count")
    .eq("organization_id", profile.organization_id).eq("tracking_number", tracking)
    .is("deleted_at", null).maybeSingle();
  if (lookupError) return { status: "error", message: "Shipment lookup failed. Try the scan again." };
  if (!shipment) return { status: "error", message: `AWB ${tracking} was not found in this courier company.` };
  if (shipment.status === "at_warehouse") return { status: "error", message: `AWB ${tracking} is already in the warehouse.` };
  if (!["booked", "picked_up", "ready_for_pickup"].includes(shipment.status)) {
    return { status: "error", message: `AWB ${tracking} cannot be received as a new inbound shipment. Use Driver return scan for undelivered returns.` };
  }

  const { data: item, error: manifestError } = await supabase.from("pickup_manifest_items")
    .select("id,manifest_id,received_at").eq("shipment_id", shipment.id).maybeSingle();
  if (manifestError) return { status: "error", message: "Pickup manifest could not be checked. Try again." };
  if (item) {
    const manifestForm = new FormData();
    manifestForm.set("manifest_id", String(item.manifest_id));
    manifestForm.set("tracking_number", tracking);
    return receiveManifestShipmentAction(_previousState, manifestForm);
  }
  if (shipment.status !== "booked" || shipment.assigned_driver_id || shipment.delivery_attempt_count !== 0) {
    return { status: "error", message: `AWB ${tracking} needs its pickup manifest or custody record reviewed before receiving.` };
  }

  const { data: received, error } = await supabase.from("shipments")
    .update({ status: "at_warehouse", warehouse_received_at: new Date().toISOString(), warehouse_location: null })
    .eq("id", shipment.id).eq("organization_id", profile.organization_id)
    .eq("status", "booked").eq("delivery_attempt_count", 0)
    .is("assigned_driver_id", null).is("deleted_at", null)
    .select("id").maybeSingle();
  if (error || !received) return { status: "error", message: `AWB ${tracking} could not be received or its custody changed. Refresh and scan again.` };
  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  revalidatePath("/dispatch");
  revalidatePath(`/shipments/${shipment.id}`);
  return { status: "success", message: `AWB ${tracking} received at warehouse and is ready for dispatch.` };
}
