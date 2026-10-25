import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { ArrowLeft, Check, MapPin, MapPinned, PackageCheck, Trash2, Truck } from "lucide-react";
import {
  handoverDispatchRunAction,
  optimizeDispatchRunAction,
  removeDispatchAwbAction,
} from "@/app/(portal)/dispatch/actions";
import { DispatchAwbScanForm } from "@/components/dispatch-forms";
import { DispatchRouteMapActionButton } from "@/components/dispatch-route-map-action-button";
import { DispatchRouteMapLoader } from "@/components/dispatch-route-map-loader";
import { CopyDispatchUpdateButton } from "@/components/copy-dispatch-update-button";
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
import { formatDubaiDate, statusLabels } from "@/lib/shipments";
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
  const itemIds = items.map((item) => item.id);
  const shipmentIds = Array.from(new Set(items.map((item) => item.shipment_id)));
  const shipmentIdChunks: number[][] = [];
  for (let index = 0; index < shipmentIds.length; index += 80) {
    shipmentIdChunks.push(shipmentIds.slice(index, index + 80));
  }
  const eventResults = await Promise.all(shipmentIdChunks.map((shipmentIdChunk) =>
    supabase
      .from("shipment_events")
      .select("id, shipment_id, event_type, new_status, notes, created_at")
      .eq("organization_id", profile.organization_id)
      .in("shipment_id", shipmentIdChunk)
      .order("created_at", { ascending: false })
      .limit(1000),
  ));
  const eventsByShipment = new Map<number, Array<{
    id: number;
    event_type: string;
    new_status: string | null;
    notes: string | null;
    created_at: string;
  }>>();
  for (const event of eventResults.flatMap((result) => result.data ?? [])) {
    const shipmentEvents = eventsByShipment.get(event.shipment_id) ?? [];
    if (shipmentEvents.length < 6) shipmentEvents.push(event);
    eventsByShipment.set(event.shipment_id, shipmentEvents);
  }
  const { data: attemptData } = itemIds.length > 0
    ? await supabase
        .from("delivery_attempts")
        .select("id, run_item_id, attempt_number, outcome, undelivered_reason, notes, proof_path, created_at")
        .eq("organization_id", profile.organization_id)
        .in("run_item_id", itemIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const attemptsWithProof = await Promise.all((attemptData ?? []).map(async (attempt) => {
    const { data: signed } = await supabase.storage
      .from("delivery-proofs")
      .createSignedUrl(attempt.proof_path, 3600);
    return { ...attempt, proofUrl: signed?.signedUrl ?? null };
  }));
  const attemptByRunItem = new Map(attemptsWithProof.map((attempt) => [attempt.run_item_id, attempt]));
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
            {items.length === 0 ? (
              <div className="grid min-h-52 place-items-center p-8 text-center"><div><p className="font-semibold text-[#596861]">No AWBs scanned yet.</p><p className="mt-1 text-xs text-[#87938d]">Scan warehouse-ready AWBs above.</p></div></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                  <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="px-5 py-3.5">AWB</th><th className="px-5 py-3.5">Consignee</th><th className="px-5 py-3.5">Destination</th><th className="px-5 py-3.5">COD</th><th className="px-5 py-3.5">Result</th><th className="px-5 py-3.5 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-[#edf1ef]">
                    {orderedItems.map((item) => {
                      const shipment = item.shipments;
                      const attempt = attemptByRunItem.get(item.id);
                      const shipmentEvents = eventsByShipment.get(shipment.id) ?? [];
                      const latestEvent = shipmentEvents[0];
                      const address = buildShipmentAddress({
                        address1: shipment.consignee_address,
                        address2: shipment.consignee_address_2,
                        city: shipment.consignee_city,
                        stateProvince: shipment.consignee_state_province,
                        postalCode: shipment.consignee_postal_code,
                        countryCode: shipment.consignee_country_code,
                      });
                      const fullAddress = [
                        shipment.consignee_address,
                        shipment.consignee_address_2,
                        shipment.consignee_area,
                        shipment.consignee_city,
                        shipment.consignee_state_province,
                        shipment.consignee_postal_code,
                        shipment.consignee_country_code,
                      ].filter(Boolean).join(", ");
                      const mapUrl = address
                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
                        : null;
                      const currentStatus = item.completed_at && item.outcome
                        ? item.outcome
                        : shipment.status;
                      const statusText = currentStatus === "delivered"
                        ? "Delivered"
                        : currentStatus === "undelivered"
                          ? "Undelivered"
                          : statusLabels[currentStatus as keyof typeof statusLabels] ?? currentStatus.replaceAll("_", " ");
                      const shareText = [
                        `Shipment update · AWB ${shipment.tracking_number}`,
                        shipment.reference_number ? `Reference: ${shipment.reference_number}` : null,
                        `Status: ${statusText}`,
                        `Consignee: ${shipment.consignee_name}`,
                        `Delivery address: ${fullAddress || "Not provided"}`,
                        `Parcel: ${shipment.pieces} piece(s), ${shipment.weight_kg} kg · ${shipment.parcel_description}`,
                        shipment.payment_type === "cod" ? `COD to collect: ${formatMoney(shipment.cod_amount, shipment.currency || currency)}` : "Payment: Prepaid",
                        latestEvent ? `Latest update: ${latestEvent.notes || (latestEvent.new_status ? statusLabels[latestEvent.new_status as keyof typeof statusLabels] : latestEvent.event_type.replaceAll("_", " "))} · ${formatDubaiDate(latestEvent.created_at)}` : null,
                        attempt ? `Latest attempt: ${attempt.outcome === "delivered" ? "Delivered" : `Undelivered${attempt.undelivered_reason ? ` · ${attempt.undelivered_reason.replaceAll("_", " ")}` : ""}`} · ${formatDubaiDate(attempt.created_at)}` : null,
                      ].filter(Boolean).join("\n");

                      return (
                        <Fragment key={item.id}>
                          <tr className="text-sm">
                            <td className="px-5 py-4"><Link href={`/shipments/${item.shipment_id}`} className="font-mono font-black text-[#13734b]">{shipment.tracking_number}</Link><p className="mt-1 text-xs text-[#87938d]">Attempt #{shipment.delivery_attempt_count + (item.completed_at ? 0 : 1)}</p></td>
                            <td className="px-5 py-4"><p className="font-semibold text-[#34453c]">{shipment.consignee_name}</p><p className="mt-1 text-xs text-[#87938d]">{shipment.consignee_phone}</p></td>
                            <td className="px-5 py-4 text-[#516159]">{shipment.consignee_area || shipment.consignee_city}</td>
                            <td className="px-5 py-4 font-bold text-[#13734b]">{formatMoney(shipment.cod_amount, shipment.currency || currency)}</td>
                            <td className="px-5 py-4">{item.completed_at ? <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.outcome === "delivered" ? "bg-[#e4f3ea] text-[#166b47]" : "bg-[#fff0d8] text-[#976019]"}`}>{item.outcome === "delivered" ? "Delivered" : "Undelivered"}</span> : <span className="rounded-full bg-[#e7effb] px-2.5 py-1 text-xs font-bold text-[#356aa6]">{statusText}</span>}</td>
                            <td className="px-5 py-4 text-right">{run.status === "draft" ? <form action={removeDispatchAwbAction}><input type="hidden" name="run_id" value={run.id} /><input type="hidden" name="item_id" value={item.id} /><button aria-label={`Remove ${shipment.tracking_number}`} className="inline-grid size-9 place-items-center rounded-lg border border-[#edd1d1] text-[#a13f3f] hover:bg-[#fff1f1]"><Trash2 className="size-4" /></button></form> : <span className="text-xs text-[#9aa39f]">Locked</span>}</td>
                          </tr>
                          <tr>
                            <td colSpan={6} className="p-0">
                              <details className="group border-t border-[#edf1ef] bg-[#fbfcfb]">
                                <summary className="cursor-pointer list-none px-5 py-3 text-xs font-bold text-[#13734b] marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2b9466]">
                                  <span className="group-open:hidden">View delivery details and shipper update</span>
                                  <span className="hidden group-open:inline">Hide delivery details</span>
                                </summary>
                                <div className="grid gap-4 border-t border-[#e8eeeb] p-4 lg:grid-cols-[1fr_1fr_300px] sm:p-5">
                                  <section className="rounded-xl border border-[#e3ebe6] bg-white p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Consignee & address</p>
                                    <h3 className="mt-2 font-bold text-[#26372f]">{shipment.consignee_name}</h3>
                                    <p className="mt-1 text-sm text-[#53645b]">{shipment.consignee_phone}{shipment.consignee_alt_phone ? ` · ${shipment.consignee_alt_phone}` : ""}</p>
                                    <p className="mt-3 text-sm leading-6 text-[#53645b]">{fullAddress || "Address not provided"}</p>
                                    {shipment.consignee_landmark ? <p className="mt-2 text-xs text-[#74827b]">Landmark: {shipment.consignee_landmark}</p> : null}
                                    {shipment.delivery_instructions ? <p className="mt-3 rounded-lg bg-[#fff9ed] p-3 text-xs leading-5 text-[#755c33]">Delivery instructions: {shipment.delivery_instructions}</p> : null}
                                    {mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-[#376eb1]">Open address in Google Maps</a> : null}
                                  </section>
                                  <section className="rounded-xl border border-[#e3ebe6] bg-white p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Shipment & delivery</p>
                                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                                      <div><dt className="text-[#87938d]">Reference</dt><dd className="mt-1 font-bold text-[#34453c]">{shipment.reference_number || "—"}</dd></div>
                                      <div><dt className="text-[#87938d]">Current status</dt><dd className="mt-1 font-bold capitalize text-[#34453c]">{statusText}</dd></div>
                                      <div><dt className="text-[#87938d]">Pieces / weight</dt><dd className="mt-1 font-bold text-[#34453c]">{shipment.pieces} · {shipment.weight_kg} kg</dd></div>
                                      <div><dt className="text-[#87938d]">COD</dt><dd className="mt-1 font-bold text-[#13734b]">{shipment.payment_type === "cod" ? formatMoney(shipment.cod_amount, shipment.currency || currency) : "Prepaid"}</dd></div>
                                      <div className="col-span-2"><dt className="text-[#87938d]">Contents</dt><dd className="mt-1 font-semibold text-[#34453c]">{shipment.parcel_description || "—"}</dd></div>
                                      <div className="col-span-2"><dt className="text-[#87938d]">Latest activity</dt><dd className="mt-1 font-semibold text-[#34453c]">{latestEvent ? `${latestEvent.notes || (latestEvent.new_status ? statusLabels[latestEvent.new_status as keyof typeof statusLabels] : latestEvent.event_type.replaceAll("_", " "))} · ${formatDubaiDate(latestEvent.created_at)}` : attempt ? `${attempt.outcome === "delivered" ? "Delivered" : `Undelivered${attempt.undelivered_reason ? ` · ${attempt.undelivered_reason.replaceAll("_", " ")}` : ""}`} · ${formatDubaiDate(attempt.created_at)}` : item.completed_at ? `${statusText} · ${formatDubaiDate(item.completed_at)}` : run.handed_over_at ? `Out for delivery · ${formatDubaiDate(run.handed_over_at)}` : `Booked · ${formatDubaiDate(shipment.booked_at)}`}</dd></div>
                                    </dl>
                                    <div className="mt-4 border-t border-[#edf1ef] pt-4">
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Shipment timeline</p>
                                      {shipmentEvents.length > 0 ? <ol className="mt-3 space-y-3">{shipmentEvents.map((event) => <li key={event.id} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#188459]" /><div><p className="text-xs font-semibold text-[#405048]">{event.notes || (event.new_status ? statusLabels[event.new_status as keyof typeof statusLabels] : event.event_type.replaceAll("_", " "))}</p><time className="mt-0.5 block text-[10px] text-[#8a9690]">{formatDubaiDate(event.created_at)}</time></div></li>)}</ol> : <p className="mt-2 text-xs text-[#87938d]">No shipment scans recorded yet.</p>}
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <CopyDispatchUpdateButton text={shareText} />
                                      <Link href={`/shipments/${item.shipment_id}#delivery-proofs`} className="inline-flex min-h-10 items-center rounded-xl border border-[#dce6e1] bg-white px-3 text-xs font-bold text-[#53645b] hover:bg-[#f6f9f7]">Full timeline & POD</Link>
                                    </div>
                                  </section>
                                  <section className="rounded-xl border border-[#e3ebe6] bg-white p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Delivery proof</p>
                                    {attempt?.proofUrl ? <a href={attempt.proofUrl} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-lg border border-[#e8eeeb]"><Image src={attempt.proofUrl} alt={`${attempt.outcome === "delivered" ? "Proof of delivery" : "Proof of attempt"} for ${shipment.tracking_number}`} width={560} height={380} unoptimized className="h-44 w-full object-cover" /></a> : <div className="mt-3 grid min-h-36 place-items-center rounded-lg bg-[#f6f9f7] px-4 text-center text-xs text-[#87938d]">{item.completed_at ? "No proof photo is attached to this delivery result." : "Delivery proof will appear here after the driver records a result."}</div>}
                                    {attempt ? <p className="mt-2 text-xs font-semibold text-[#53645b]">{attempt.outcome === "delivered" ? "POD · Delivered" : `Attempt · ${attempt.undelivered_reason?.replaceAll("_", " ") || "Undelivered"}`}</p> : null}
                                  </section>
                                </div>
                              </details>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
