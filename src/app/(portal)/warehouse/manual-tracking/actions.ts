"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { customerTrackingLabels, manualTrackingStatuses, type CustomerTrackingStatus } from "@/lib/customer-tracking";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeLocal, inferTrackingTimeZone, isTrackingTimeZone, parseDateTimeLocal, trackingTimeZones, type TrackingTimeZone } from "@/lib/tracking-timezones";

const warehouseRoles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

export type ManualTrackingState = {
  status: "idle" | "success" | "error";
  message: string;
};

type TrackingTimeZoneLookup =
  | { status: "success"; timeZone: TrackingTimeZone; label: string; localDateTime: string }
  | { status: "error"; message: string };

export async function lookupManualTrackingTimeZoneAction(
  trackingNumber: string,
  status: string,
): Promise<TrackingTimeZoneLookup> {
  const profile = await requireProfile(warehouseRoles);
  if (!profile.organization_id) return { status: "error", message: "This account is not linked to a courier company." };
  const tracking = trackingNumber.trim().toUpperCase();
  if (tracking.length < 3 || tracking.length > 40) return { status: "error", message: "Scan or enter an AWB to detect its local time zone." };

  const supabase = await createClient();
  const { data: shipment, error } = await supabase
    .from("shipments")
    .select("sender_country_code,sender_city,sender_postal_code,consignee_country_code,consignee_city,consignee_postal_code")
    .eq("tracking_number", tracking)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !shipment) return { status: "error", message: "Shipment location was not found. Dubai time remains selected; choose the scan location time zone if needed." };

  const timeZone = inferTrackingTimeZone(shipment, status);
  const zone = trackingTimeZones.find((item) => item.value === timeZone);
  return {
    status: "success",
    timeZone,
    label: zone?.label ?? timeZone,
    localDateTime: formatDateTimeLocal(new Date(), timeZone),
  };
}

export async function recordManualTrackingAction(
  _previous: ManualTrackingState,
  formData: FormData,
): Promise<ManualTrackingState> {
  const profile = await requireProfile(warehouseRoles);
  if (!profile.organization_id) return { status: "error", message: "This account is not linked to a courier company." };

  const tracking = String(formData.get("tracking_number") ?? "").trim().toUpperCase();
  const status = String(formData.get("status") ?? "") as CustomerTrackingStatus;
  const timeZone = String(formData.get("time_zone") ?? "");
  const occurredAtInput = String(formData.get("occurred_at") ?? "");
  if (tracking.length < 3 || tracking.length > 40) return { status: "error", message: "Scan or enter a valid AWB number." };
  if (!manualTrackingStatuses.includes(status)) return { status: "error", message: "Select a valid customer tracking status." };
  if (!isTrackingTimeZone(timeZone)) return { status: "error", message: "Select the time zone where the scan happened." };
  const occurredAt = parseDateTimeLocal(occurredAtInput, timeZone);
  if (!occurredAt) return { status: "error", message: "Select a valid local date and time. The selected time zone may not have that time." };
  if (new Date(occurredAt).getTime() > Date.now() + 10 * 60 * 1000) return { status: "error", message: "Tracking date and time cannot be in the future." };

  const supabase = await createClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, status, sender_country_code, consignee_country_code")
    .eq("tracking_number", tracking)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (shipmentError || !shipment) return { status: "error", message: `AWB ${tracking} was not found in this courier account.` };
  const isInternational = Boolean(shipment.sender_country_code && shipment.consignee_country_code && shipment.sender_country_code !== shipment.consignee_country_code);
  if (!isInternational && (status === "arrived_at_destination_airport_customs_started" || status === "customs_clearance_completed_warehouse_scanned")) {
    return { status: "error", message: "Airport and customs statuses are only available for international shipments." };
  }

  // “At warehouse” and the customs-cleared / warehouse-scanned milestone both mean the
  // parcel has been received into the warehouse. Keep dispatch inventory in sync so it does
  // not ask for a second inbound scan. Historical updates must never move a later state backwards.
  const marksWarehouseReceived =
    status === "at_warehouse" || status === "customs_clearance_completed_warehouse_scanned";
  let movedIntoWarehouse = false;
  if (marksWarehouseReceived && shipment.status !== "at_warehouse") {
    const canReceiveNow = ["booked", "ready_for_pickup", "picked_up"].includes(shipment.status);
    if (canReceiveNow) {
      const { data: received, error: receiveError } = await supabase
        .from("shipments")
        .update({ status: "at_warehouse", warehouse_received_at: occurredAt, warehouse_location: null })
        .eq("id", shipment.id)
        .eq("organization_id", profile.organization_id)
        .in("status", ["booked", "ready_for_pickup", "picked_up"])
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (receiveError) {
        return { status: "error", message: "Warehouse status could not be updated. Refresh the shipment and try again." };
      }
      movedIntoWarehouse = Boolean(received);
    }
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
    if (movedIntoWarehouse) {
      await supabase.from("shipments")
        .update({ status: shipment.status, warehouse_received_at: null, warehouse_location: null })
        .eq("id", shipment.id)
        .eq("organization_id", profile.organization_id)
        .eq("status", "at_warehouse")
        .eq("warehouse_received_at", occurredAt)
        .is("deleted_at", null);
    }
    if (error.code === "23505") return { status: "error", message: "This customs milestone has already been recorded for this AWB." };
    if (error.message.includes("earlier date and time")) return { status: "error", message: error.message };
    return { status: "error", message: "Tracking update could not be saved. Check the AWB status sequence and try again." };
  }

  // Manual tracking is the shared current status used by customer tracking,
  // shipment lists, dashboards, warehouse, and dispatch. Invalidate the app
  // layout so every module refreshes from the same saved shipment state.
  revalidatePath("/", "layout");
  const warehouseMessage = movedIntoWarehouse || shipment.status === "at_warehouse"
    ? " The shipment is now in warehouse and ready for dispatch."
    : "";
  return { status: "success", message: `${tracking} updated to ${customerTrackingLabels[status]}. Customer tracking has been refreshed.${warehouseMessage}` };
}
