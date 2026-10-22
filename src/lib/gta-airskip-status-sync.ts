import type { createAdminClient } from "@/lib/supabase/admin";

type Tracking = { status: string; standardStatus: number | null; date: string; events: { name: string; location: string; date: string }[] };

/** Keep the authenticated carrier's actual status text; never store a callback hint or invent a milestone. */
export function normalizeGtaPartnerStatus(tracking: Tracking): string | null {
  const status = tracking.status.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return status && status.length <= 100 ? status : null;
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
