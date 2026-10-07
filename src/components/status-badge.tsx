import { customerTrackingLabels } from "@/lib/customer-tracking";
import { statusLabels, type ShipmentStatus } from "@/lib/shipments";

const tones: Record<ShipmentStatus, string> = {
  booked: "bg-[#e8f0fb] text-[#376eb1]",
  ready_for_pickup: "bg-[#fff2df] text-[#a96614]",
  picked_up: "bg-[#e4f5f3] text-[#27847c]",
  at_warehouse: "bg-[#eeeaf8] text-[#6952a0]",
  out_for_delivery: "bg-[#e7f4ed] text-[#13734b]",
  delivered: "bg-[#dff4e8] text-[#14734b]",
  undelivered: "bg-[#fdeaea] text-[#b74646]",
  return_initiated: "bg-[#fff0e5] text-[#b76223]",
  returned_to_shipper: "bg-[#f0edf0] text-[#665b64]",
  cancelled: "bg-[#ecefee] text-[#64716b]",
};

export function StatusBadge({ status, customerStatus }: { status: ShipmentStatus; customerStatus?: "in_transit" | "out_for_delivery" | "delivered" | "undelivered" | null }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${customerStatus === "in_transit" ? tones.picked_up : tones[customerStatus || status]}`}>
      {customerStatus ? customerTrackingLabels[customerStatus] : statusLabels[status]}
    </span>
  );
}

