import type { createAdminClient } from "@/lib/supabase/admin";

type Tracking = { status: string; standardStatus: number | null; date: string; events: { name: string; location: string; date: string }[] };

/** Map only explicit carrier milestones. Unknown GTA wording never overwrites a known report status. */
export function normalizeGtaPartnerStatus(tracking: Tracking): string | null {
  const text = `${tracking.status} ${tracking.events[0]?.name ?? ""}`.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(undelivered|delivery attempted|attempted delivery|delivery failed)\b/.test(text)) return "undelivered";
  if (/\b(delivered|successfully delivered)\b/.test(text) && !/\bnot delivered\b/.test(text)) return "delivered";
  if (/\b(returned to shipper|returned to sender)\b/.test(text)) return "returned_to_shipper";
  if (/\b(return initiated|return to sender|return requested)\b/.test(text)) return "return_initiated";
  if (/\b(out for delivery|with delivery courier)\b/.test(text)) return "out_for_delivery";
  if (/\b(in transit|picked up|received at|arrived at|departed|processed at|shipment accepted)\b/.test(text)) return "in_transit";
  if (/\b(label generated|shipment created|created|pending pickup)\b/.test(text)) return "label_generated";
  return null;
}

export async function syncGtaPartnerStatus(admin: ReturnType<typeof createAdminClient>, organizationId: string, shipmentId: number, tracking: Tracking) {
  const partnerStatus = normalizeGtaPartnerStatus(tracking);
  if (!partnerStatus) return { updated: false, reason: "unmapped_status" as const };
  const { data: carrier, error: carrierError } = await admin.from("third_party_carriers").select("id").eq("organization_id", organizationId).eq("code", "GTA_AIRSKIP").maybeSingle();
  if (carrierError || !carrier) return { updated: false, reason: "carrier_missing" as const };
  let statusAt: string | undefined;
  if (tracking.date) {
    const timestamp = Date.parse(tracking.date);
    if (Number.isFinite(timestamp)) statusAt = new Date(timestamp).toISOString();
  }
  const { data, error } = await admin.from("third_party_shipment_links").update({ partner_status: partnerStatus, last_status_at: statusAt ?? new Date().toISOString() })
    .eq("organization_id", organizationId).eq("shipment_id", shipmentId).eq("carrier_id", carrier.id).select("shipment_id").maybeSingle();
  if (error || !data) return { updated: false, reason: "link_missing" as const };
  return { updated: true, partnerStatus };
}
