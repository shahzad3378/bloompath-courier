import type { createAdminClient } from "@/lib/supabase/admin";

type Tracking = { status: string; standardStatus: number | null; date: string; events: { name: string; location: string; date: string }[] };

/** Keep the authenticated carrier's actual status text; never store a callback hint or invent a milestone. */
export function normalizeGtaPartnerStatus(tracking: Tracking): string | null {
  let status = tracking.status;
  // Some GTA responses keep the summary at "Label Generated" after scan events arrive.
  // Prefer a later, dated scan when it carries a recognized shipment milestone.
  const summaryTime = Date.parse(tracking.date);
  const latestEvent = tracking.events
    .filter((event) => event.name && Number.isFinite(Date.parse(event.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  if (latestEvent && Date.parse(latestEvent.date) >= (Number.isFinite(summaryTime) ? summaryTime : 0)
    && mapGtaCustomerStatus(latestEvent.name)
    && mapGtaCustomerStatus(latestEvent.name) !== mapGtaCustomerStatus(status)) {
    status = latestEvent.name;
  }
  status = status.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return status && status.length <= 100 ? status : null;
}

/** Translate verified GTA tracking text into the safe status used by the shipment list. */
export function mapGtaCustomerStatus(status: string): string | null {
  const value = status.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/^undelivered$|delivery (attempted|failed)|attempted delivery|no answer/.test(value)) return "undelivered";
  if (/\bdelivered\b|delivery complete/.test(value)) return "delivered";
  if (/out for delivery|with courier|on delivery/.test(value)) return "out_for_delivery";
  if (/return(ed)? to (shipper|sender)|returned/.test(value)) return "returned_to_shipper";
  if (/return (initiated|requested)|return to sender/.test(value)) return "return_initiated";
  if (/label generated|label created|shipment created|booked|pending pickup/.test(value)) return "booked";
  if (/picked up|pickup complete|collected/.test(value)) return "picked_up";
  if (/warehouse|sorting|hub|facility/.test(value)) return "at_warehouse";
  if (/transit|departed|arrived|received|processed|accepted|dispatched|shipped/.test(value)) return "in_transit";
  return null;
}

export async function syncGtaPartnerStatus(admin: ReturnType<typeof createAdminClient>, organizationId: string, shipmentId: number, tracking: Tracking) {
  const partnerStatus = normalizeGtaPartnerStatus(tracking);
  if (!partnerStatus) return { updated: false, reason: "unmapped_status" as const };
  const { data: carrier, error: carrierError } = await admin.from("third_party_carriers").select("id").eq("organization_id", organizationId).eq("code", "GTA_AIRSKIP").maybeSingle();
  if (carrierError || !carrier) return { updated: false, reason: "carrier_missing" as const };
  let statusAt: string | undefined;
  const latestEvent = tracking.events
    .filter((event) => event.name === partnerStatus && Number.isFinite(Date.parse(event.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  const statusDate = latestEvent?.date ?? tracking.date;
  if (statusDate) {
    const timestamp = Date.parse(statusDate);
    if (Number.isFinite(timestamp)) statusAt = new Date(timestamp).toISOString();
  }
  const { data, error } = await admin.from("third_party_shipment_links").update({ partner_status: partnerStatus, last_status_at: statusAt ?? new Date().toISOString() })
    .eq("organization_id", organizationId).eq("shipment_id", shipmentId).eq("carrier_id", carrier.id).select("shipment_id").maybeSingle();
  if (error || !data) return { updated: false, reason: "link_missing" as const };
  const customerStatus = mapGtaCustomerStatus(partnerStatus);
  if (customerStatus) {
    const { data: shipment } = await admin.from("shipments").select("customer_tracking_status").eq("organization_id", organizationId).eq("id", shipmentId).maybeSingle();
    if (shipment?.customer_tracking_status !== customerStatus) {
      const { error: eventError } = await admin.from("customer_tracking_events").insert({
        organization_id: organizationId,
        shipment_id: shipmentId,
        status: customerStatus,
        created_at: statusAt ?? new Date().toISOString(),
      });
      if (eventError) return { updated: false, reason: "system_status_sync_failed" as const };
    }
  }
  return { updated: true, partnerStatus, customerStatus };
}
