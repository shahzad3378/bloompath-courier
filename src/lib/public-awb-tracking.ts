import { customerEventLabel, customerStatusLabel } from "@/lib/customer-tracking";
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

  const events = (history ?? [])
    .filter((event) => event.status !== "booked")
    .map((event) => ({ status: customerEventLabel(event.status), timestamp: event.created_at }));
  events.push({ status: "Shipment booked", timestamp: shipment.created_at });

  const label = customerStatusLabel(shipment);
  const currentStatus = label === "Booked" ? "Shipment booked" : label ?? events[0].status;
  const currentEvent = events.find((event) => event.status === currentStatus);
  return {
    trackingNumber: shipment.tracking_number,
    currentStatus,
    updatedAt: currentEvent?.timestamp ?? shipment.updated_at,
    events,
    podUrl: null,
    timeZone: shipment.consignee_country_code === "AE" ? "Asia/Dubai" : undefined,
  };
}
