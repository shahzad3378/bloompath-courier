import type { Shipment } from "@/lib/shipments";

export const pickupManifestStatuses = [
  "draft",
  "ready_for_pickup",
  "picked_up",
  "partially_received",
  "received",
] as const;

export type PickupManifestStatus = (typeof pickupManifestStatuses)[number];

export type PickupManifest = {
  id: number;
  organization_id: string;
  manifest_number: string;
  shipper_id: string | null;
  shipper_name: string;
  status: PickupManifestStatus;
  created_by: string;
  assigned_driver_id: string | null;
  picked_up_by: string | null;
  submitted_at: string | null;
  picked_up_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PickupManifestItem = {
  id: number;
  manifest_id: number;
  shipment_id: number;
  added_by: string;
  received_at: string | null;
  received_by: string | null;
  warehouse_location: string | null;
  created_at: string;
  shipments: Shipment;
};

export const pickupManifestStatusLabels: Record<PickupManifestStatus, string> = {
  draft: "Draft",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  partially_received: "Partially received",
  received: "Received",
};

export function manifestStatusClass(status: PickupManifestStatus) {
  if (status === "received") return "bg-[#e4f3ea] text-[#166b47]";
  if (status === "partially_received") return "bg-[#fff0d8] text-[#976019]";
  if (status === "picked_up") return "bg-[#e7effb] text-[#356aa6]";
  if (status === "ready_for_pickup") return "bg-[#eee9fa] text-[#66509b]";
  return "bg-[#eef1ef] text-[#617068]";
}
