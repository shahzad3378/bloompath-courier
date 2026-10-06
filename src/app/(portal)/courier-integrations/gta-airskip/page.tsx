import Link from "next/link";
import {requireProfile} from "@/lib/auth";
import {getGtaConfig,getGtaSetupIssue,getGtaPickup} from "@/lib/gta-airskip-server";
import {createAdminClient} from "@/lib/supabase/admin";
import {GtaBookingForm,GtaTrackingForm,GtaConnectionForm,GtaRecoveryForm} from "@/components/gta-airskip-form";
import {CarrierWorkspace} from "@/components/carrier-workspace";
import {GtaBulkBooking} from "@/components/gta-bulk-booking";
export const metadata = {title:"GTA AirSkip booking"};
export default async function GtaPage({searchParams}:{searchParams:Promise<{awb?:string;tab?:string;carrier?:string}>}) {
  const profile = await requireProfile(["super_admin","operations_admin","dispatcher"]);
  const config = getGtaConfig(profile.organization_id), params = await searchParams;
  let bookings: {id:string;shipment_id:number;partner_tracking_number:string|null;status:string;is_test:boolean;base_url:string;response_metadata:{tracking?:{status?:string;date?:string};trackingCheckedAt?:string}|null}[] = [], unavailable = false;
  if(config) { try {const {data,error} = await createAdminClient().from("gta_airskip_bookings").select("id,shipment_id,partner_tracking_number,status,is_test,base_url,response_metadata").eq("organization_id",profile.organization_id!).order("created_at",{ascending:false}).limit(20); bookings = data ?? []; unavailable = Boolean(error); } catch {unavailable=true;} }
  const configured = Boolean(config) && !unavailable;
  const pickup = getGtaPickup(profile.organization_id);
  return <CarrierWorkspace key="gta-airskip" carrier="gta-airskip" configured={configured} mode={config?.test === false ? "Production" : "QA"}
    notice={!configured ? <p className="mb-5 rounded-xl border border-[var(--line)] p-4 text-sm" role="status">{unavailable ? "Carrier booking storage is unavailable. Contact the administrator." : getGtaSetupIssue(profile.organization_id)}</p> : null}
    single={<GtaBookingForm configured={configured} test={config?.test ?? true} liveEnabled={config?.liveEnabled ?? false} initialAwb={params.awb ?? ""} pickup={pickup} />}
    bulk={<GtaBulkBooking configured={configured} test={config?.test ?? true} liveEnabled={config?.liveEnabled ?? false} pickup={pickup} />}
    connection={<GtaConnectionForm configured={configured} />}
    bookings={config && !unavailable ? <section className="bp-panel p-5 sm:p-6"><h2 className="text-xl font-bold">Recent GTA bookings</h2><p className="mt-2 text-sm text-[var(--muted)]">Unconfirmed bookings remain blocked. Check GTA with the FastDrop reference before retrying. Tracking checks show partner events without changing FastDrop custody.</p>{bookings.length ? <ul className="mt-4 space-y-4">{bookings.map(booking => <li key={booking.id} className="rounded-xl border border-[var(--line)] p-4 text-sm"><div className="flex flex-wrap items-center gap-3"><Link href={`/shipments/${booking.shipment_id}`} className="text-[var(--brand)] underline">Open shipment</Link><span>{booking.is_test ? "QA" : "Production"}</span><strong className="font-mono">{booking.partner_tracking_number || "AWB unconfirmed"}</strong><span>{booking.status === "needs_review" ? "Needs review" : booking.status === "pending" ? "Pending / unconfirmed" : "Label saved"}</span>{["generated","ready"].includes(booking.status) ? <a href={`/api/courier-integrations/gta-airskip/labels/${booking.id}`} className="text-[var(--brand)] underline">Download PDF label</a> : null}{["generated","ready"].includes(booking.status) ? <a href={`/api/courier-integrations/gta-airskip/labels/${booking.id}?format=stored`} className="text-[var(--brand)] underline">Saved label</a> : null}</div>{["pending","needs_review"].includes(booking.status) ? <GtaRecoveryForm bookingId={booking.id} tracking={booking.partner_tracking_number} /> : null}{booking.response_metadata?.tracking ? <p className="mt-3 text-sm text-[var(--muted)]">Last verified partner status: {booking.response_metadata.tracking.status || "Unavailable"} · {booking.response_metadata.tracking.date || "No event date"} · Checked {booking.response_metadata.trackingCheckedAt || "unknown"}</p> : null}{booking.partner_tracking_number ? <GtaTrackingForm bookingId={booking.id} /> : null}</li>)}</ul> : <p className="mt-4 text-sm text-[var(--muted)]">No GTA bookings yet. Create a single label or upload a batch.</p>}</section> : null} />;
}
