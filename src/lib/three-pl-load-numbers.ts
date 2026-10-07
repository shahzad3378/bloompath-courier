import { createAdminClient } from "@/lib/supabase/admin";

// Booking records are backend-only. Authorize the tenant before calling this helper.
export async function getThreePLLoadNumbers(organizationId: string, items: { shipment_id: number; partner_tracking_number: string | null }[]) {
  const result = new Map<number, string>();
  if (!items.length) return result;
  const { data, error } = await createAdminClient().from("gta_airskip_bookings")
    .select("shipment_id,partner_tracking_number,load_number")
    .eq("organization_id", organizationId).in("shipment_id", items.map((i) => i.shipment_id))
    .in("status", ["generated", "ready"]);
  if (error) throw new Error("Partner load numbers could not be loaded. Please retry.");
  for (const item of items) {
    const booking = data?.find((b) => b.shipment_id === item.shipment_id && b.partner_tracking_number === item.partner_tracking_number);
    if (booking?.load_number) result.set(item.shipment_id, booking.load_number);
  }
  return result;
}
