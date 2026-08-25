import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, MapPin, MapPinned, PackageCheck, Trash2, Truck } from "lucide-react";
import {
  handoverDispatchRunAction,
  optimizeDispatchRunAction,
  removeDispatchAwbAction,
} from "@/app/(portal)/dispatch/actions";
import { DispatchAwbScanForm } from "@/components/dispatch-forms";
import { DispatchRouteMapActionButton } from "@/components/dispatch-route-map-action-button";
import { DispatchRouteMapLoader } from "@/components/dispatch-route-map-loader";
import { requireProfile } from "@/lib/auth";
import {
  dispatchStatusClass,
  dispatchStatusLabels,
  type DispatchRun,
  type DispatchRunItem,
} from "@/lib/dispatch";
import { formatMoney } from "@/lib/currency";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import {
  buildShipmentAddress,
  parseCoordinatePair,
} from "@/lib/google-maps";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dispatch Route" };
const dispatchRoles = ["super_admin", "operations_admin", "warehouse_staff", "dispatcher"] as const;

type RunWithDriver = DispatchRun & {
  profiles: { full_name: string; employee_code: string | null; phone: string | null } | null;
};

function buildGoogleMapsLinks(items: DispatchRunItem[]) {
  const addresses = items
    .map((item) =>
      buildShipmentAddress({
        address1: item.shipments.consignee_address,
        address2: item.shipments.consignee_address_2,
        city: item.shipments.consignee_city,
        stateProvince: item.shipments.consignee_state_province,
        postalCode: item.shipments.consignee_postal_code,
        countryCode: item.shipments.consignee_country_code,
      }),
    )
    .filter(Boolean);

  if (addresses.length === 0) return [];

  if (addresses.length === 1) {
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", addresses[0]);
    return [{ label: "Google Maps", url: url.toString() }];
  }

  const links: Array<{ label: string; url: string }> = [];
  let start = 0;

  while (start < addresses.length - 1) {
    const segment = addresses.slice(start, start + 9);
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("travelmode", "driving");
    url.searchParams.set("origin", segment[0]);
    url.searchParams.set("destination", segment[segment.length - 1]);

    if (segment.length > 2) {
      url.searchParams.set("waypoints", segment.slice(1, -1).join("|"));
    }

    links.push({
      label:
        addresses.length <= 9
          ? "Open in Google Maps"
          : `Google Maps segment ${links.length + 1}`,
      url: url.toString(),
    });
    start += Math.max(1, segment.length - 1);
  }

  return links;
}

export default async function DispatchRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    handed_over?: string;
    error?: string;
    route_mapped?: string;
    route_unmapped?: string;
  }>;
}) {
  const profile = await requireProfile(dispatchRoles);
  const { id } = await params;
  const notices = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const supabase = await createClient();
  const [
    { data: runData },
    { data: itemData },
    currency,
    { count: activeRouteCount },
    { count: activeShipmentCount },
  ] = await Promise.all([
    supabase
      .from("dispatch_runs")
      .select("*, profiles!dispatch_runs_driver_id_fkey(full_name, employee_code, phone)")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    supabase.from("dispatch_run_items").select("*, shipments(*)").eq("run_id", id).order("created_at", { ascending: true }),
    resolveOrganizationCurrency(supabase, profile.organization_id!),
    supabase
      .from("dispatch_runs")
      .select("id, dispatch_run_items!inner(id)", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .in("status", ["draft", "handed_over"]),
    supabase
      .from("dispatch_run_items")
      .select("id, dispatch_runs!inner(organization_id, status)", { count: "exact", head: true })
      .eq("dispatch_runs.organization_id", profile.organization_id)
      .in("dispatch_runs.status", ["draft", "handed_over"]),
  ]);
  if (!runData) notFound();
  const run = runData as unknown as RunWithDriver;
  const items = (itemData ?? []) as unknown as DispatchRunItem[];
  const completed = items.filter((item) => item.completed_at).length;
  const batchNumber = run.route_name.match(/· Batch (\d+)$/)?.[1] ?? null;
  const orderedItems = [...items].sort(
    (left, right) =>
      (left.stop_sequence ?? Number.MAX_SAFE_INTEGER) -
      (right.stop_sequence ?? Number.MAX_SAFE_INTEGER),
  );
  const routeMapStops = orderedItems.flatMap((item, index) => {
    const point = parseCoordinatePair(
      item.shipments.delivery_latitude,
      item.shipments.delivery_longitude,
    );

    return point
      ? [{
          id: item.id,
          sequence: item.stop_sequence ?? index + 1,
          trackingNumber: item.shipments.tracking_number,
          consigneeName: item.shipments.consignee_name,
          city: item.shipments.consignee_city,
          completed: Boolean(item.completed_at),
          ...point,
        }]
      : [];
  });
  const googleMapsLinks = buildGoogleMapsLinks(orderedItems);
  const mappedNotice = /^\d+$/.test(notices.route_mapped ?? "")
    ? Number(notices.route_mapped)
    : null;
  const unmappedNotice = /^\d+$/.test(notices.route_unmapped ?? "")
    ? Number(notices.route_unmapped)
    : null;

  return (
    <div className="mx-auto max-w-[1350px]">
      <Link href="/dispatch" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to dispatch</Link>
      {notices.handed_over === "1" ? <div className="mb-5 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">Route handed over. AWBs are now Out for Delivery on the driver app.</div> : null}
      {mappedNotice !== null ? (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${unmappedNotice === 0 ? "border-[#bfe3cf] bg-[#ebf8f1] text-[#176a47]" : "border-[#efd8aa] bg-[#fff9ed] text-[#805918]"}`}>
          {mappedNotice} stops mapped and optimized
          {unmappedNotice ? `; ${unmappedNotice} addresses still need valid coordinates.` : "."}
        </div>
      ) : null}
      {notices.error ? <div className="mb-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">{notices.error === "route_map" ? "Route mapping could not be refreshed." : "Route handover failed. Confirm it has at least one eligible AWB and an active driver."}</div> : null}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-[#188459]">Dispatch route</p><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="font-mono text-3xl font-black tracking-[-0.035em] text-[#17231e]">{run.run_number}</h1><span className={`rounded-full px-3 py-1 text-xs font-bold ${dispatchStatusClass(run.status)}`}>{dispatchStatusLabels[run.status]}</span></div><p className="mt-2 text-sm text-[#74827b]">{run.route_name} · Created {formatDubaiDate(run.created_at)}</p></div>
        <div className="rounded-xl border border-[#dde7e2] bg-white px-4 py-3 text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Delivery progress</p><p className="mt-1 text-lg font-black text-[#26372f]">{completed} / {items.length}</p></div>
      </div>

      {batchNumber ? (
        <div className="mt-5 rounded-xl border border-[#cfe0d7] bg-[#f3faf6] px-4 py-3 text-sm text-[#486158]">
          <span className="font-bold text-[#176a47]">Viewing auto-planned Batch {batchNumber}:</span>{" "}
          this route contains {items.length.toLocaleString("en-US")} AWBs. All active routes contain {(activeShipmentCount ?? items.length).toLocaleString("en-US")} AWBs across {(activeRouteCount ?? 1).toLocaleString("en-US")} non-empty routes.
        </div>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#dce6e1] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        <div className="flex flex-col justify-between gap-4 border-b border-[#e8eeeb] px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
              <MapPinned className="size-5" />
            </span>
            <div>
              <h2 className="font-bold text-[#26372f]">Dispatcher route map</h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Review Google-sequenced stops before and after driver handover.
              </p>
            </div>
          </div>
          {run.status === "draft" || run.status === "handed_over" ? (
            <form action={optimizeDispatchRunAction}>
              <input type="hidden" name="run_id" value={run.id} />
              <DispatchRouteMapActionButton />
            </form>
          ) : null}
        </div>
        <div className="p-4 sm:p-5">
          <DispatchRouteMapLoader
            runNumber={run.run_number}
            stops={routeMapStops}
            totalStops={items.length}
            googleMapsLinks={googleMapsLinks}
          />
        </div>
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {run.status === "draft" ? <DispatchAwbScanForm runId={run.id} /> : null}
          {run.status === "completed" ? <div className="flex items-center gap-3 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-4 text-sm font-semibold text-[#176a47]"><Check className="size-5" /> All delivery results are complete. Route closed {run.completed_at ? formatDubaiDate(run.completed_at) : ""}.</div> : null}
          {run.status === "cancelled" ? <div className="flex items-center gap-3 rounded-xl border border-[#efc7c7] bg-[#fff7f7] px-4 py-4 text-sm font-semibold text-[#a13f3f]"><Trash2 className="size-5" /> Route cancelled {run.cancelled_at ? formatDubaiDate(run.cancelled_at) : ""}. Its warehouse-ready AWBs are available for route planning again.</div> : null}
          <section className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
            <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4"><div><h2 className="font-bold text-[#26372f]">Route AWBs</h2><p className="mt-1 text-xs text-[#87938d]">{items.length} shipment{items.length === 1 ? "" : "s"}</p></div><PackageCheck className="size-5 text-[#188459]" /></div>
            {items.length === 0 ? <div className="grid min-h-52 place-items-center p-8 text-center"><div><p className="font-semibold text-[#596861]">No AWBs scanned yet.</p><p className="mt-1 text-xs text-[#87938d]">Scan warehouse-ready AWBs above.</p></div></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="px-5 py-3.5">AWB</th><th className="px-5 py-3.5">Consignee</th><th className="px-5 py-3.5">Destination</th><th className="px-5 py-3.5">COD</th><th className="px-5 py-3.5">Result</th><th className="px-5 py-3.5 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#edf1ef]">{items.map((item) => <tr key={item.id} className="text-sm"><td className="px-5 py-4"><Link href={`/shipments/${item.shipment_id}`} className="font-mono font-black text-[#13734b]">{item.shipments.tracking_number}</Link><p className="mt-1 text-xs text-[#87938d]">Attempt #{item.shipments.delivery_attempt_count + (item.completed_at ? 0 : 1)}</p></td><td className="px-5 py-4"><p className="font-semibold text-[#34453c]">{item.shipments.consignee_name}</p><p className="mt-1 text-xs text-[#87938d]">{item.shipments.consignee_phone}</p></td><td className="px-5 py-4 text-[#516159]">{item.shipments.consignee_area || item.shipments.consignee_city}</td><td className="px-5 py-4 font-bold text-[#13734b]">{formatMoney(item.shipments.cod_amount, item.shipments.currency || currency)}</td><td className="px-5 py-4">{item.completed_at ? <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.outcome === "delivered" ? "bg-[#e4f3ea] text-[#166b47]" : "bg-[#fff0d8] text-[#976019]"}`}>{item.outcome === "delivered" ? "Delivered" : "Undelivered"}</span> : <span className="rounded-full bg-[#e7effb] px-2.5 py-1 text-xs font-bold text-[#356aa6]">Pending</span>}</td><td className="px-5 py-4 text-right">{run.status === "draft" ? <form action={removeDispatchAwbAction}><input type="hidden" name="run_id" value={run.id} /><input type="hidden" name="item_id" value={item.id} /><button aria-label={`Remove ${item.shipments.tracking_number}`} className="inline-grid size-9 place-items-center rounded-lg border border-[#edd1d1] text-[#a13f3f] hover:bg-[#fff1f1]"><Trash2 className="size-4" /></button></form> : <span className="text-xs text-[#9aa39f]">Locked</span>}</td></tr>)}</tbody></table></div>}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e8f0fb] text-[#376eb1]"><Truck className="size-5" /></span><div><p className="text-xs text-[#819088]">Assigned driver</p><h2 className="font-bold text-[#26372f]">{run.profiles?.full_name ?? "Driver"}</h2></div></div><div className="mt-4 space-y-2 text-sm text-[#62716a]"><p>{run.profiles?.employee_code || "No employee code"}</p><p>{run.profiles?.phone || "No phone recorded"}</p><p className="flex items-center gap-2 pt-2 text-xs font-semibold"><MapPin className="size-4" /> {run.route_name}</p></div></section>
          {run.status === "draft" ? <form action={handoverDispatchRunAction} className="rounded-2xl border border-[#cde3d7] bg-white p-5"><input type="hidden" name="run_id" value={run.id} /><h2 className="font-bold text-[#26372f]">Handover to driver</h2><p className="mt-2 text-xs leading-5 text-[#7a8881]">This locks the route and changes every AWB to Out for Delivery.</p><button disabled={items.length === 0} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Truck className="size-4" /> Confirm handover</button></form> : null}
        </aside>
      </div>
    </div>
  );
}
