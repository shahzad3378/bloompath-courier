"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
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
