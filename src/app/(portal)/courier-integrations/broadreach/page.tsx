import Link from "next/link";
import { BroadReachBookingForm } from "@/components/broadreach-booking-form";
import { BroadReachBulkBooking } from "@/components/broadreach-bulk-booking";
import { requireProfile } from "@/lib/auth";
import { getBroadReachConfig } from "@/lib/broadreach-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "BroadReach AWB Booking" };
export default async function BroadReachPage({ searchParams }: { searchParams: Promise<{ awb?: string }> }) {
  const profile = await requireProfile(["super_admin", "operations_admin", "dispatcher"]);
  const config = getBroadReachConfig(profile.organization_id);
  const params = await searchParams;
  let bookings: { id: string; shipment_id: number; partner_tracking_number: string | null; is_test: boolean; status: string }[] = [];
  let storageUnavailable = false;
  if (config) {
    try {
      const { data, error } = await createAdminClient().from("broadreach_bookings").select("id, shipment_id, partner_tracking_number, is_test, status").eq("organization_id", profile.organization_id!).order("created_at", { ascending: false }).limit(20);
      bookings = data ?? [];
      storageUnavailable = Boolean(error);
    } catch { storageUnavailable = true; }
  }
  return <div className="bp-page max-w-5xl space-y-5">
    <Link href="/courier-integrations" className="text-sm font-semibold text-[var(--brand)]">Back to Courier Partner API</Link>
    <header><h1 className="bp-heading mt-3 text-3xl font-bold">BroadReach booking</h1><p className="mt-2 text-[var(--muted)]">Generate carrier labels for FastDrop shipments to Canada and USA.</p></header>
    {!config ? <div className="bp-panel p-5 text-sm" role="status">BroadReach is awaiting account credentials for this courier company. Contact the administrator to activate test booking.</div> : storageUnavailable ? <div className="bp-panel p-5 text-sm" role="status">Carrier booking storage is unavailable. Contact the administrator before booking.</div> : null}
    <BroadReachBookingForm configured={Boolean(config) && !storageUnavailable} liveEnabled={config?.liveEnabled ?? false} initialAwb={params.awb ?? ""} />
    <BroadReachBulkBooking configured={Boolean(config) && !storageUnavailable} liveEnabled={config?.liveEnabled ?? false} />
    {config && !storageUnavailable ? <section className="bp-panel p-5 sm:p-6"><h2 className="text-xl font-bold">Recent carrier bookings</h2>{bookings.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-[var(--line)]"><th className="py-3">Shipment</th><th>Mode</th><th>Partner AWB</th><th>Status</th><th>Label</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id} className="border-b border-[var(--line)]"><td className="py-3"><Link href={`/shipments/${booking.shipment_id}`} className="text-[var(--brand)] underline">Open shipment</Link></td><td>{booking.is_test ? "Test" : "Live"}</td><td className="font-mono">{booking.partner_tracking_number || "Unconfirmed"}</td><td>{booking.status === "needs_review" ? "Needs review" : booking.status === "pending" ? "Pending / unconfirmed" : "Label saved"}</td><td>{["generated", "ready"].includes(booking.status) ? <a className="text-[var(--brand)] underline" href={`/api/courier-integrations/broadreach/labels/${booking.id}`}>Download</a> : "—"}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-[var(--muted)]">No carrier bookings yet. Start with a test label.</p>}<p className="mt-4 text-sm text-[var(--muted)]">Pending or unconfirmed bookings stay blocked. Check the BroadReach portal with the FastDrop AWB reference before any retry.</p></section> : null}
  </div>;
}
