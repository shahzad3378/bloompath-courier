"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { getGtaBookingConfig, requestGtaTracking } from "@/lib/gta-airskip-server";
import { syncGtaPartnerStatus } from "@/lib/gta-airskip-status-sync";
import { internalRoles } from "@/lib/roles";
import { hasCanadaPrimaryMarket } from "@/lib/market-access";
import { resolveReportDateRange } from "@/lib/report-date-range";
import { parseTablePagination } from "@/lib/table-pagination";
import { createAdminClient } from "@/lib/supabase/admin";

export type RefreshStatusState = { status: "idle" | "success" | "error"; message: string };
const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function refreshGtaReportStatuses(_state: RefreshStatusState, form: FormData): Promise<RefreshStatusState> {
  const profile = await requireProfile(internalRoles);
  if (!profile.organization_id || !(await hasCanadaPrimaryMarket(profile.organization_id))) return { status: "error", message: "This report is only available in the Canada portal." };

  const params = { range: field(form, "range"), from: field(form, "from"), to: field(form, "to"), page: field(form, "page"), page_size: field(form, "page_size") };
  const { start, endExclusive, error: rangeError } = resolveReportDateRange(params);
  if (rangeError) return { status: "error", message: rangeError };
  const pagination = parseTablePagination(params);
  const admin = createAdminClient();
  const { data: links, error } = await admin.from("third_party_shipment_links").select("shipment_id,partner_tracking_number,third_party_carriers!inner(code),shipments!inner(booked_at,deleted_at)")
    .eq("organization_id", profile.organization_id).eq("third_party_carriers.code", "GTA_AIRSKIP").is("shipments.deleted_at", null)
    .gte("shipments.booked_at", start.toISOString()).lt("shipments.booked_at", endExclusive.toISOString())
    .order("created_at", { ascending: false }).range(pagination.from, pagination.to);
  if (error) return { status: "error", message: "Could not load GTA-linked shipments for this report page." };
  const usable = (links ?? []).filter((link) => link.partner_tracking_number);
  if (!usable.length) return { status: "success", message: "No GTA/AirSkip shipments were found on this report page." };

  const shipmentIds = usable.map((link) => link.shipment_id);
  const { data: bookings, error: bookingError } = await admin.from("gta_airskip_bookings")
    .select("shipment_id,partner_tracking_number,base_url,response_metadata")
    .eq("organization_id", profile.organization_id).eq("is_test", false).in("status", ["generated", "ready"]).in("shipment_id", shipmentIds);
  if (bookingError) return { status: "error", message: "GTA booking details are unavailable for live tracking." };
  const byShipment = new Map((bookings ?? []).map((booking) => [booking.shipment_id, booking]));
  let updated = 0, skipped = 0, failed = 0, cursor = 0;
  const refreshNext = async () => {
    while (cursor < usable.length) {
      const link = usable[cursor++];
      const booking = byShipment.get(link.shipment_id);
      if (!booking || booking.partner_tracking_number !== link.partner_tracking_number) { skipped++; continue; }
      const config = getGtaBookingConfig(profile.organization_id!, booking.base_url);
      if (!config || config.test) { skipped++; continue; }
      try {
        const tracking = await requestGtaTracking(link.partner_tracking_number!, config);
        const result = await syncGtaPartnerStatus(admin, profile.organization_id!, link.shipment_id, tracking);
        if (result.updated) updated++; else skipped++;
        const metadata = booking.response_metadata && typeof booking.response_metadata === "object" && !Array.isArray(booking.response_metadata) ? booking.response_metadata as Record<string, unknown> : {};
        await admin.from("gta_airskip_bookings").update({ response_metadata: { ...metadata, trackingCheckedAt: new Date().toISOString(), tracking } })
          .eq("organization_id", profile.organization_id!).eq("shipment_id", link.shipment_id).eq("partner_tracking_number", link.partner_tracking_number).eq("is_test", false);
      } catch { failed++; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, usable.length) }, () => refreshNext()));

  revalidatePath("/reports/bloompath-fastdrop");
  revalidatePath("/reports");
  revalidatePath("/shipments");
  revalidatePath("/dispatch/3pl");
  const message = `GTA tracking checked: ${updated} report statuses updated${skipped ? `, ${skipped} unchanged` : ""}${failed ? `, ${failed} checks failed` : ""}.`;
  return { status: failed && !updated ? "error" : "success", message };
}
