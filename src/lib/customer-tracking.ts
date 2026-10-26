import { statusLabels, type Shipment, type ShipmentStatus } from "@/lib/shipments";

export const internationalTrackingMilestones = [
  "arrived_at_destination_airport_customs_started",
  "customs_clearance_completed_warehouse_scanned",
] as const;
export type InternationalTrackingMilestone = (typeof internationalTrackingMilestones)[number];

export const customerTrackingLabels = {
  ...statusLabels,
  in_transit: "In transit",
  arrived_at_destination_airport_customs_started: "Arrived at destination airport — customs clearance started",
  customs_clearance_completed_warehouse_scanned: "Customs clearance completed — shipment scanned in warehouse",
} as const;
export type CustomerTrackingStatus = keyof typeof customerTrackingLabels;
export const manualTrackingStatuses = [
  "booked",
  "ready_for_pickup",
  "picked_up",
  "at_warehouse",
  "in_transit",
  "arrived_at_destination_airport_customs_started",
  "customs_clearance_completed_warehouse_scanned",
  "out_for_delivery",
  "delivered",
  "undelivered",
  "return_initiated",
  "returned_to_shipper",
  "cancelled",
] as const satisfies readonly CustomerTrackingStatus[];
export type CustomerTrackingEvent = { id: number; status: ShipmentStatus | CustomerTrackingStatus; created_at: string; proof_path?: string | null };

// Only canonical status labels enter customer output. Never display partner payloads or notes.
export function customerStatusLabel(shipment: Pick<Shipment, "status" | "customer_tracking_status">) {
  const safe = shipment.customer_tracking_status;
  return safe && Object.hasOwn(customerTrackingLabels, safe) ? customerTrackingLabels[safe] : statusLabels[shipment.status];
}
export function customerEventLabel(status: CustomerTrackingEvent["status"]) {
  return Object.hasOwn(customerTrackingLabels, status)
    ? customerTrackingLabels[status as CustomerTrackingStatus]
    : statusLabels[status as ShipmentStatus] || "Shipment status updated";
}
