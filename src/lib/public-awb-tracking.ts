import { customerEventLabel, customerStatusLabel } from "@/lib/customer-tracking";
import { undeliveredReasons } from "@/lib/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

const fastDropOrganizationId = "edb6f2a6-1e35-45b6-a60c-35b8ca4aa01e";

export async function findPublicAwbTracking(trackingNumber: string) {
  const supabase = createAdminClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, organization_id, tracking_number, status, customer_tracking_status, created_at, updated_at, consignee_country_code")
    .eq("tracking_number", trackingNumber)
    .is("deleted_at", null)
    .maybeSingle();
  if (shipmentError) throw shipmentError;
  // Fast Drop keeps its existing timeline and proof-of-delivery flow.
  if (!shipment || shipment.organization_id === fastDropOrganizationId) return null;

  const { data: history, error: historyError } = await supabase
    .from("customer_tracking_events")
    .select("status, created_at")
    .eq("organization_id", shipment.organization_id)
    .eq("shipment_id", shipment.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (historyError) throw historyError;

  const failedEventTimes = (history ?? []).filter((event) => event.status === "undelivered").map((event) => event.created_at);
  const reasonsByTime = new Map<string, string>();
  if (failedEventTimes.length) {
    const { data: attempts, error: attemptsError } = await supabase
      .from("delivery_attempts")
      .select("created_at, undelivered_reason")
      .eq("organization_id", shipment.organization_id)
      .eq("shipment_id", shipment.id)
      .eq("outcome", "undelivered")
      .in("created_at", failedEventTimes);
    if (attemptsError) console.error("Public delivery reason lookup failed", attemptsError.code);
    for (const attempt of attempts ?? []) {
      const reason = undeliveredReasons.find(([code]) => code === attempt.undelivered_reason)?.[1];
      if (reason) reasonsByTime.set(attempt.created_at, reason);
    }
  }

  const events: { status: string; timestamp: string; reason?: string }[] = (history ?? [])
    .filter((event) => event.status !== "booked")
    .map((event) => ({
      status: customerEventLabel(event.status),
      timestamp: event.created_at,
      reason: event.status === "undelivered" ? reasonsByTime.get(event.created_at) : undefined,
    }));
  events.push({ status: "Shipment booked", timestamp: shipment.created_at });

  const label = customerStatusLabel(shipment);
  const currentStatus = label === "Booked" ? "Shipment booked" : label ?? events[0].status;
  const currentEvent = events.find((event) => event.status === currentStatus);
  return {
    trackingNumber: shipment.tracking_number,
    currentStatus,
    currentReason: currentEvent?.reason,
    updatedAt: currentEvent?.timestamp ?? shipment.updated_at,
    events,
    podUrl: null,
    timeZone: shipment.consignee_country_code === "AE" ? "Asia/Dubai" : undefined,
  };
}
