import Link from "next/link";
import {requireProfile} from "@/lib/auth";
import {getGtaConfig} from "@/lib/gta-airskip-server";
import {createAdminClient} from "@/lib/supabase/admin";
import {GtaBookingForm,GtaTrackingForm} from "@/components/gta-airskip-form";
export const metadata = {title:"GTA AirSkip booking"};
export default async function GtaPage({searchParams}:{searchParams:Promise<{awb?:string}>}) {
  const profile = await requireProfile(["super_admin","operations_admin","dispatcher"]);
  const config = getGtaConfig(profile.organization_id), params = await searchParams;
  let bookings: {id:string;shipment_id:number;partner_tracking_number:string|null;status:string;is_test:boolean;base_url:string}[] = [], unavailable = false;
  if(config) { try {const {data,error} = await createAdminClient().from("gta_airskip_bookings").select("id,shipment_id,partner_tracking_number,status,is_test,base_url").eq("organization_id",profile.organization_id!).order("created_at",{ascending:false}).limit(20); bookings = data ?? []; unavailable = Boolean(error); } catch {unavailable=true;} }
  return <div className="bp-page max-w-5xl space-y-5"><Link href="/courier-integrations" className="text-sm font-semibold text-[var(--brand)]">Back to Courier Partner API</Link><header><h1 className="bp-heading mt-3 text-3xl font-bold">GTA AirSkip · Canada & USA</h1><p className="mt-2 text-[var(--muted)]">Check rates, generate a partner AWB and download its label.</p></header>
    {!config || unavailable ? <p className="bp-panel p-5 text-sm" role="status">{unavailable ? "Carrier booking storage is unavailable. Contact the administrator." : "GTA is awaiting account/API keys and the induction terminal details. Contact the administrator to activate QA booking."}</p> : null}
    <GtaBookingForm configured={Boolean(config) && !unavailable} test={config?.test ?? true} liveEnabled={config?.liveEnabled ?? false} initialAwb={params.awb ?? ""} />
    {config && !unavailable ? <section className="bp-panel p-5 sm:p-6"><h2 className="text-xl font-bold">Recent GTA bookings</h2><p className="mt-2 text-sm text-[var(--muted)]">Unconfirmed bookings remain blocked. Check GTA with the FastDrop reference before retrying. Tracking checks show partner events without changing FastDrop custody.</p>{bookings.length ? <ul className="mt-4 space-y-4">{bookings.map(booking => <li key={booking.id} className="rounded-xl border border-[var(--line)] p-4 text-sm"><div className="flex flex-wrap items-center gap-3"><Link href={`/shipments/${booking.shipment_id}`} className="text-[var(--brand)] underline">Open shipment</Link><span>{booking.is_test ? "QA" : "Production"}</span><strong className="font-mono">{booking.partner_tracking_number || "AWB unconfirmed"}</strong><span>{booking.status === "needs_review" ? "Needs review" : booking.status === "pending" ? "Pending / unconfirmed" : "Label saved"}</span>{["generated","ready"].includes(booking.status) ? <a href={`/api/courier-integrations/gta-airskip/labels/${booking.id}`} className="text-[var(--brand)] underline">Download label</a> : null}</div>{booking.partner_tracking_number && booking.base_url === config.baseUrl ? <GtaTrackingForm bookingId={booking.id} /> : null}</li>)}</ul> : <p className="mt-4 text-sm text-[var(--muted)]">No GTA bookings yet. Start with a QA rate check.</p>}</section> : null}
  </div>;
}
