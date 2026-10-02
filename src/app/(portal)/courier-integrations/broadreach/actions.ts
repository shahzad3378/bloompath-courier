"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { buildBroadReachShipment, type BroadReachItem } from "@/lib/broadreach";
import { getBroadReachConfig, requestBroadReachLabel } from "@/lib/broadreach-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Shipment } from "@/lib/shipments";

export type BroadReachState = { status: "idle" | "success" | "error"; message: string; bookingId?: string; tracking?: string; test?: boolean };
const roles = ["super_admin", "operations_admin", "dispatcher"] as const;
const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function generateBroadReachAwb(_state: BroadReachState, form: FormData): Promise<BroadReachState> {
  const profile = await requireProfile(roles);
  const config = getBroadReachConfig(profile.organization_id);
  const fail = (message: string): BroadReachState => ({ status: "error", message });
  if (!config || !profile.organization_id) return fail("BroadReach credentials are not configured for this courier company.");
  const mode = field(form, "mode");
  if (mode !== "test" && mode !== "live") return fail("Choose test or live booking.");
  const test = mode === "test";
  if (!test && (!config.liveEnabled || field(form, "confirm_live") !== "on")) return fail("Live booking must be enabled and the shipping-charge confirmation selected.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("shipments").select("*").eq("organization_id", profile.organization_id).eq("tracking_number", field(form, "awb").toUpperCase()).is("deleted_at", null).maybeSingle();
  if (error || !data) return fail("FastDrop AWB was not found in this courier company.");
  const shipment = data as Shipment;
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return fail("Carrier booking storage is not configured. Contact the administrator."); }
  const finish = async (booking: { id: string; partner_tracking_number: string }) => {
    const { error: finishError } = await admin.rpc("finalize_broadreach_booking", { p_booking_id: booking.id, p_organization_id: profile.organization_id });
    if (finishError) return fail(`BroadReach AWB ${booking.partner_tracking_number} was generated and saved, but the local carrier link needs attention. Submit again to retry linking without creating another AWB.`);
    revalidatePath("/courier-integrations/broadreach");
    revalidatePath(`/shipments/${shipment.id}`);
    return { status: "success" as const, message: `${test ? "Test" : "Live"} label is ready.`, bookingId: booking.id, tracking: booking.partner_tracking_number, test };
  };
  const { data: existing, error: readError } = await admin.from("broadreach_bookings").select("id, status, partner_tracking_number").eq("organization_id", profile.organization_id).eq("shipment_id", shipment.id).eq("is_test", test).maybeSingle();
  if (readError) return fail("Carrier booking storage is unavailable. Contact the administrator; no booking has been sent.");
  if (existing) {
    if (["generated", "ready"].includes(existing.status) && existing.partner_tracking_number) return finish(existing);
    return fail("This shipment has a pending or unconfirmed carrier booking. Check BroadReach using the FastDrop AWB reference before retrying; duplicate booking is blocked.");
  }
  let payload: ReturnType<typeof buildBroadReachShipment>;
  try {
    const count = Number(field(form, "item_count"));
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new Error("Add between 1 and 100 content items.");
    const items: BroadReachItem[] = Array.from({ length: count }, (_, index) => ({
      description: field(form, `description_${index}`), unit: "pc",
      qty: Number(field(form, `qty_${index}`)), value: field(form, `value_${index}`) === "" ? NaN : Number(field(form, `value_${index}`)),
      sku: field(form, `sku_${index}`), origin: field(form, `origin_${index}`), hscode: field(form, `hscode_${index}`),
    }));
    const dims = ["length", "width", "height"].map((key) => field(form, key));
    payload = buildBroadReachShipment(shipment, config.account, { test, currency: field(form, "currency"), items,
      ...(dims.some(Boolean) ? { dimensions: { length: Number(dims[0]), width: Number(dims[1]), height: Number(dims[2]) } } : {}),
    });
  } catch (issue) { return fail(issue instanceof Error ? issue.message : "Review the shipment details."); }
  const { data: bookingId, error: reserveError } = await admin.rpc("reserve_broadreach_booking", { p_organization_id: profile.organization_id, p_shipment_id: shipment.id, p_is_test: test, p_service: payload.shipment.service, p_actor: profile.id });
  if (reserveError || typeof bookingId !== "string") return fail("Shipment is already reserved, linked to a partner, assigned to a driver, or no longer eligible. No new booking was sent.");
  let result: Awaited<ReturnType<typeof requestBroadReachLabel>>;
  try { result = await requestBroadReachLabel(payload, config); }
  catch {
    await admin.from("broadreach_bookings").update({ status: "needs_review" }).eq("id", bookingId).eq("organization_id", profile.organization_id);
    return fail("BroadReach did not confirm a complete label. Check its portal using the FastDrop AWB reference; this shipment is blocked from duplicate booking.");
  }
  const { error: saveError } = await admin.from("broadreach_bookings").update({
    status: "generated", partner_tracking_number: result.tracking, label_base64: result.label, label_format: result.format,
    response_metadata: { carrier: result.carrier, service: result.service, alternate_tracking: result.alternateTracking, scn: result.scn, rate: result.rate, currency: result.currency },
  }).eq("id", bookingId).eq("organization_id", profile.organization_id);
  if (saveError) return fail(`BroadReach generated AWB ${result.tracking}, but the label could not be saved. Recover it from the BroadReach portal. Do not book again.`);
  return finish({ id: bookingId, partner_tracking_number: result.tracking });
}
