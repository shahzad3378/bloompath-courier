import { statusLabels, type Shipment, type ShipmentStatus } from "@/lib/shipments";

export const customerTrackingLabels = {
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  undelivered: "Undelivered",
} as const;
export type CustomerTrackingStatus = keyof typeof customerTrackingLabels;
export type CustomerTrackingEvent = { id: number; status: ShipmentStatus | CustomerTrackingStatus; created_at: string };

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
