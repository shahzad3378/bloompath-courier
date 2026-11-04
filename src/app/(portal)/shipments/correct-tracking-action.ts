"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { manualTrackingStatuses } from "@/lib/customer-tracking";
export type CorrectionState = { message: string };
export async function correctTrackingAction(_state: CorrectionState, form: FormData): Promise<CorrectionState> {
  await requireProfile(["super_admin", "operations_admin"]);
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const shipmentId = field("shipment_id"), eventId = field("event_id"), status = field("status");
  const localTime = field("occurred_at"), reason = field("reason");
  if (!/^\d+$/.test(shipmentId) || !/^\d+$/.test(eventId)) return { message: "Select a shipment scan to correct." };
  if (!(manualTrackingStatuses as readonly string[]).includes(status)) return { message: "Choose a valid tracking status." };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(localTime)) return { message: "Enter the corrected scan date and time." };
  if (reason.length < 5 || reason.length > 500) return { message: "Add a correction reason (5–500 characters)." };
  if (field("confirm_correction") !== "on") return { message: "Confirm the scan correction before saving." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_shipment_tracking_event", {
    p_shipment_id: Number(shipmentId), p_event_id: Number(eventId),
    p_expected_updated_at: field("updated_at"), p_expected_event_at: field("expected_event_at"),
    p_expected_status: field("expected_status"), p_status: status,
    p_local_time: localTime, p_timezone: field("timezone"), p_reason: reason,
  });
  if (error) {
    const message = error.code === "P0001" ? error.message : "Correction was not saved. Reload the shipment and try again.";
    return { message };
  }
  for (const path of ["/shipments", `/shipments/${shipmentId}`, "/tracking", "/reports", "/activity-log", "/finance", "/warehouse", "/dispatch/3pl"]) revalidatePath(path);
  redirect(`/shipments/${shipmentId}?saved=1`);
}
