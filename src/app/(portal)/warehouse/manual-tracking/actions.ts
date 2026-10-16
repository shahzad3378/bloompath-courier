"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { customerTrackingLabels, manualTrackingStatuses, type CustomerTrackingStatus } from "@/lib/customer-tracking";
import { createClient } from "@/lib/supabase/server";

const warehouseRoles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

export type ManualTrackingState = {
  status: "idle" | "success" | "error";
  message: string;
};

function parseDubaiDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+04:00`);
  if (!Number.isFinite(date.getTime())) return null;
  const roundTrip = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date).replace(" ", "T");
  return roundTrip === value ? date.toISOString() : null;
}

export async function recordManualTrackingAction(
  _previous: ManualTrackingState,
  formData: FormData,
): Promise<ManualTrackingState> {
  const profile = await requireProfile(warehouseRoles);
  if (!profile.organization_id) return { status: "error", message: "This account is not linked to a courier company." };

  const tracking = String(formData.get("tracking_number") ?? "").trim().toUpperCase();
  const status = String(formData.get("status") ?? "") as CustomerTrackingStatus;
  const occurredAt = parseDubaiDateTime(String(formData.get("occurred_at") ?? ""));
  if (tracking.length < 3 || tracking.length > 40) return { status: "error", message: "Scan or enter a valid AWB number." };
  if (!manualTrackingStatuses.includes(status)) return { status: "error", message: "Select a valid customer tracking status." };
  if (!occurredAt) return { status: "error", message: "Select a valid Dubai date and time." };
  if (new Date(occurredAt).getTime() > Date.now() + 10 * 60 * 1000) return { status: "error", message: "Tracking date and time cannot be in the future." };

  const supabase = await createClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, sender_country_code, consignee_country_code")
    .eq("tracking_number", tracking)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (shipmentError || !shipment) return { status: "error", message: `AWB ${tracking} was not found in this courier account.` };
  const isInternational = Boolean(shipment.sender_country_code && shipment.consignee_country_code && shipment.sender_country_code !== shipment.consignee_country_code);
  if (!isInternational && (status === "arrived_at_destination_airport_customs_started" || status === "customs_clearance_completed_warehouse_scanned")) {
    return { status: "error", message: "Airport and customs statuses are only available for international shipments." };
  }

  const { error } = await supabase.from("customer_tracking_events").insert({
    shipment_id: shipment.id,
    organization_id: profile.organization_id,
    status,
    source: "manual",
    recorded_by: profile.id,
    created_at: occurredAt,
  });

  if (error) {
    if (error.code === "23505") return { status: "error", message: "This customs milestone has already been recorded for this AWB." };
    if (error.message.includes("earlier date and time")) return { status: "error", message: error.message };
    return { status: "error", message: "Tracking update could not be saved. Check the AWB status sequence and try again." };
  }

  revalidatePath("/warehouse/manual-tracking");
  revalidatePath("/shipments");
  revalidatePath(`/shipments/${shipment.id}`);
  revalidatePath(`/track/${tracking}`);
  return { status: "success", message: `${tracking} updated to ${customerTrackingLabels[status]}. Customer tracking has been refreshed.` };
}
