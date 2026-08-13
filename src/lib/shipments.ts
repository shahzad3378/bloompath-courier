export const shipmentStatuses = [
  "booked",
  "ready_for_pickup",
  "picked_up",
  "at_warehouse",
  "out_for_delivery",
  "delivered",
  "undelivered",
  "return_initiated",
  "returned_to_shipper",
  "cancelled",
] as const;

export const serviceTypes = ["same_day", "next_day", "standard"] as const;
export const paymentTypes = ["cod", "prepaid"] as const;

export type ShipmentStatus = (typeof shipmentStatuses)[number];
export type ServiceType = (typeof serviceTypes)[number];
export type PaymentType = (typeof paymentTypes)[number];

export type Shipment = {
  id: number;
  organization_id: string;
  tracking_number: string;
  reference_number: string | null;
  shipper_id: string | null;
  created_by: string;
  assigned_driver_id: string | null;
  status: ShipmentStatus;
  service_type: ServiceType;
  payment_type: PaymentType;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  sender_city: string;
  consignee_name: string;
  consignee_phone: string;
  consignee_alt_phone: string | null;
  consignee_address: string;
  consignee_city: string;
  consignee_area: string | null;
  consignee_landmark: string | null;
  pieces: number;
  weight_kg: number;
  parcel_description: string;
  cod_amount: number;
  delivery_instructions: string | null;
  booked_at: string;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentEvent = {
  id: number;
  event_type: string;
  previous_status: ShipmentStatus | null;
  new_status: ShipmentStatus | null;
  notes: string | null;
  created_at: string;
};

export const statusLabels: Record<ShipmentStatus, string> = {
  booked: "Booked",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  at_warehouse: "At warehouse",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  undelivered: "Undelivered",
  return_initiated: "Return initiated",
  returned_to_shipper: "Returned to shipper",
  cancelled: "Cancelled",
};

export const serviceLabels: Record<ServiceType, string> = {
  same_day: "Same day",
  next_day: "Next day",
  standard: "Standard",
};

export const uaeCities = [
  "Abu Dhabi",
  "Ajman",
  "Al Ain",
  "Dubai",
  "Fujairah",
  "Ras Al Khaimah",
  "Sharjah",
  "Umm Al Quwain",
] as const;

export function formatAed(value: number | string) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

export function formatDubaiDate(value: string, includeTime = true) {
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}
