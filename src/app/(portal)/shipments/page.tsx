import Link from "next/link";
import {
  Archive,
  Download,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  Search,
  Truck,
  UploadCloud,
  Warehouse,
  XCircle,
} from "lucide-react";
import { ShipmentSelectionTable } from "@/components/shipment-selection-table";
import { ShipmentDateFields } from "@/components/shipment-date-fields";
import { requireProfile } from "@/lib/auth";
import { canDeleteShipments, internalRoles } from "@/lib/roles";
import { shipmentStatuses, statusLabels, type Shipment, type ShipmentStatus } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Shipments" };

function agingDaysSince(value: string) {
  const start = new Date(value);
  const now = new Date();
  const startDubai = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  const nowDubai = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const startDay = Date.UTC(startDubai.getUTCFullYear(), startDubai.getUTCMonth(), startDubai.getUTCDate());
  const nowDay = Date.UTC(nowDubai.getUTCFullYear(), nowDubai.getUTCMonth(), nowDubai.getUTCDate());
  return Math.max(0, Math.floor((nowDay - startDay) / 86400000));
}

export default async function ShipmentsPage({ searchParams }: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    view?: string;
    archived?: string;
    from?: string;
    to?: string;
    shipper?: string;
    driver?: string;
    destination?: string;
    generated?: string;
    ids?: string;
  }>;
}) {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const params = await searchParams;
  const mayArchive = canDeleteShipments(profile);
  const showArchived = mayArchive && params.view === "archived";
  const queryText = String(params.q ?? "").trim().toLowerCase().slice(0, 80);
  const requestedStatus = shipmentStatuses.includes(params.status as ShipmentStatus) ? params.status as ShipmentStatus : params.status === "in_transit" && profile.role === "shipper" ? "in_transit" : "";
  const supabase = await createClient();
  const isShipper = profile.role === "shipper";
  const destinationCountryCodeCandidate = String(params.destination ?? "").trim().toUpperCase();
  const destinationCountryCode = /^[A-Z]{2}$/.test(destinationCountryCodeCandidate) ? destinationCountryCodeCandidate : "";

  const [{ data: shippers }, { data: drivers }, { data: orgSettings }, { data: destinationRows }] = await Promise.all([
    isShipper
      ? Promise.resolve({ data: [] })
      : supabase.from("profiles").select("id, full_name, email").eq("organization_id", profile.organization_id).eq("role", "shipper").eq("status", "active").order("full_name"),
    supabase.from("profiles").select("id, full_name, email").eq("organization_id", profile.organization_id).eq("role", "driver").eq("status", "active").order("full_name"),
    supabase.from("organization_settings").select("currency").eq("organization_id", profile.organization_id).maybeSingle(),
    supabase.from("shipments").select("consignee_country_code").eq("organization_id", profile.organization_id).is("deleted_at", null).not("consignee_country_code", "is", null).limit(5000),
  ]);
  const destinationCountryCodes = [...new Set((destinationRows ?? []).map((row) => String(row.consignee_country_code ?? "").trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))].sort();

  const tenantCurrency = /^\d+$/.test(String(orgSettings?.currency ?? "").toUpperCase())
    ? String(orgSettings?.currency).toUpperCase()
    : "AED";

  const applyCommonFilters = <T,>(query: T): T => {
    let q = query as any;
    q = q.eq("organization_id", profile.organization_id).is("deleted_at", null);
    if (isShipper) q = q.eq("shipper_id", profile.id);
    else if (params.shipper) q = q.eq("shipper_id", params.shipper);
    if (params.driver) q = q.eq("assigned_driver_id", params.driver);
    if (destinationCountryCode) q = q.eq("consignee_country_code", destinationCountryCode);
    if (params.from) q = q.gte("created_at", `${params.from}T00:00:00+04:00`);
    if (params.to) q = q.lte("created_at", `${params.to}T23:59:59.999+04:00`);
    return q as T;
  };

  async function exactCount(statuses?: ShipmentStatus[]) {
    let countQuery = supabase.from("shipments").select("id", { count: "exact", head: true });
    countQuery = applyCommonFilters(countQuery);
    if (statuses?.length) {
      const currentStatuses = statuses.flatMap((status) =>
        status === "at_warehouse" ? ["at_warehouse", "customs_clearance_completed_warehouse_scanned"] : [status],
      );
      const currentCodes = currentStatuses.join(",");
      const operationalCodes = statuses.join(",");
      countQuery = countQuery.or(`customer_tracking_status.in.(${currentCodes}),and(customer_tracking_status.is.null,status.in.(${operationalCodes}))`);
    }
    const { count } = await countQuery;
    return count ?? 0;
  }

  const [allCount, bookedCount, pickupCount, warehouseCount, ofdCount, deliveredCount, undeliveredCount, rtoCount] = await Promise.all([
    exactCount(),
    exactCount(["booked"]),
    exactCount(["ready_for_pickup", "picked_up"]),
    exactCount(["at_warehouse"]),
    exactCount(["out_for_delivery"]),
    exactCount(["delivered"]),
    exactCount(["undelivered"]),
    exactCount(["return_initiated", "returned_to_shipper"]),
  ]);

  let query = supabase
    .from("shipments")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order(showArchived ? "deleted_at" : "created_at", { ascending: false })
    .limit(5000);

  query = showArchived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (isShipper) query = query.eq("shipper_id", profile.id);
  else if (params.shipper) query = query.eq("shipper_id", params.shipper);
  if (params.driver) query = query.eq("assigned_driver_id", params.driver);
  if (destinationCountryCode) query = query.eq("consignee_country_code", destinationCountryCode);
  if (requestedStatus) {
    const currentStatuses = requestedStatus === "at_warehouse"
      ? "at_warehouse,customs_clearance_completed_warehouse_scanned"
      : requestedStatus;
    query = requestedStatus === "in_transit"
      ? query.eq("customer_tracking_status", requestedStatus)
      : query.or(`customer_tracking_status.in.(${currentStatuses}),and(customer_tracking_status.is.null,status.eq.${requestedStatus})`);
  }
  if (params.from) query = query.gte("created_at", `${params.from}T00:00:00+04:00`);
  if (params.to) query = query.lte("created_at", `${params.to}T23:59:59.999+04:00`);

  const { data, error } = await query;
  const filteredShipments = ((data ?? []) as Shipment[]).filter((shipment) => {
    if (!queryText) return true;
    return (
      shipment.tracking_number.toLowerCase().includes(queryText) ||
      shipment.reference_number?.toLowerCase().includes(queryText) ||
      shipment.consignee_name.toLowerCase().includes(queryText) ||
      shipment.consignee_phone.toLowerCase().includes(queryText)
    );
  });

  const visibleShipmentIds = filteredShipments.map((shipment) => shipment.id);
  const latestUndeliveredByShipment = new Map<number, string>();
  const latestProofByShipment = new Map<number, { kind: "POA" | "POD"; attemptNumber: number; proofPath: string }>();

  for (let index = 0; index < visibleShipmentIds.length; index += 500) {
    const ids = visibleShipmentIds.slice(index, index + 500);
    if (!ids.length) continue;
    const { data: visibleAttempts } = await supabase
      .from("delivery_attempts")
      .select("shipment_id, attempt_number, outcome, proof_path, created_at")
      .in("shipment_id", ids)
      .order("created_at", { ascending: false });

    for (const attempt of visibleAttempts ?? []) {
      const shipmentId = Number(attempt.shipment_id);
      if (attempt.outcome === "undelivered" && !latestUndeliveredByShipment.has(shipmentId) && attempt.created_at) {
        latestUndeliveredByShipment.set(shipmentId, attempt.created_at);
      }
      if (attempt.proof_path && !latestProofByShipment.has(shipmentId)) {
        latestProofByShipment.set(shipmentId, {
          kind: attempt.outcome === "delivered" ? "POD" : "POA",
          attemptNumber: Number(attempt.attempt_number),
          proofPath: attempt.proof_path,
        });
      }
    }
  }

  const latestProofUrlByShipment = new Map<number, string>();
  await Promise.all(Array.from(latestProofByShipment.entries()).map(async ([shipmentId, proof]) => {
    const { data: signedProof } = await supabase.storage
      .from("delivery-proofs")
      .createSignedUrl(proof.proofPath, 3600);
    if (signedProof?.signedUrl) latestProofUrlByShipment.set(shipmentId, signedProof.signedUrl);
  }));

  const shipments = filteredShipments.map((shipment) => {
    const lastUndeliveredAt = latestUndeliveredByShipment.get(shipment.id) ?? null;
    const agingClosed = shipment.status === "delivered" || shipment.status === "returned_to_shipper" || shipment.status === "cancelled";
    return {
      ...shipment,
      currency: shipment.currency || tenantCurrency,
      last_undelivered_at: lastUndeliveredAt,
      latest_proof_kind: latestProofByShipment.get(shipment.id)?.kind ?? null,
      latest_proof_attempt: latestProofByShipment.get(shipment.id)?.attemptNumber ?? null,
      latest_proof_url: latestProofUrlByShipment.get(shipment.id) ?? null,
      undelivered_aging_days: lastUndeliveredAt && !agingClosed ? agingDaysSince(lastUndeliveredAt) : null,
    };
  });

  const generatedIds = new Set(String(params.ids ?? "").split(",").filter((id) => /^\d+$/.test(id)).slice(0, 999));
  const generatedShipments = params.generated === "international" ? shipments.filter((shipment) => generatedIds.has(String(shipment.id))) : [];

  const exportParams = new URLSearchParams();
  if (params.q) exportParams.set("q", params.q);
  if (requestedStatus) exportParams.set("status", requestedStatus);
  if (params.from) exportParams.set("from", params.from);
  if (params.to) exportParams.set("to", params.to);
  if (!isShipper && params.shipper) exportParams.set("shipper", params.shipper);
  if (params.driver) exportParams.set("driver", params.driver);
  if (destinationCountryCode) exportParams.set("destination", destinationCountryCode);
  const exportHref = `/shipments/export?${exportParams.toString()}`;
  const excelExportHref = `/shipments/export-xlsx?${exportParams.toString()}`;

  const { count: transitCount } = isShipper
    ? await applyCommonFilters(supabase.from("shipments").select("id", { count: "exact", head: true })).eq("customer_tracking_status", "in_transit")
    : { count: 0 };
  const dashboardCards = [
    ...(isShipper ? [["in_transit", "In transit", transitCount ?? 0, Truck] as const] : []),
    ["", "All Shipments", allCount, PackageCheck],
    ["booked", "Booked", bookedCount, PackagePlus],
    ["ready_for_pickup", "Pickup", pickupCount, Truck],
    ["at_warehouse", "Warehouse", warehouseCount, Warehouse],
    ["out_for_delivery", "Out for Delivery", ofdCount, Truck],
    ["delivered", "Delivered", deliveredCount, PackageCheck],
    ["undelivered", "Undelivered", undeliveredCount, XCircle],
    ["return_initiated", "RTO / Returns", rtoCount, RotateCcw],
  ] as const;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-[#188459]">Order management</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">{showArchived ? "Archived AWBs" : "Shipments"}</h1><p className="mt-2 text-sm text-[#74827b]">{showArchived ? "Read-only audit records removed from active operations." : "Book, search and print courier AWBs."}</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {mayArchive ? <Link href={showArchived ? "/shipments" : "/shipments?view=archived"} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e3caca] bg-white px-5 text-sm font-bold text-[#9b4444] shadow-sm"><Archive className="size-4" /> {showArchived ? "Active AWBs" : "Archived AWBs"}</Link> : null}
          {!showArchived ? <><Link href="/shipments/import" className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#bdd9ca] bg-white px-5 text-sm font-bold text-[#13734b] shadow-sm"><UploadCloud className="size-4" /> Bulk upload</Link><Link href="/shipments/new" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white shadow-lg shadow-[#13734b]/15"><PackagePlus className="size-4" /> New shipment</Link></> : null}
        </div>
      </div>

      {params.archived === "1" ? <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">AWB archived successfully. Its audit record is available under Archived AWBs.</div> : null}
      {generatedShipments.length ? <section className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] p-4 text-[#176a47]"><p className="font-bold">{generatedShipments.length} separate international AWB{generatedShipments.length === 1 ? "" : "s"} created</p><div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-auto">{generatedShipments.map((shipment) => <Link key={shipment.id} href={`/shipments/${shipment.id}`} className="rounded-lg border border-[#bfe3cf] bg-white px-3 py-1.5 font-mono text-xs font-bold text-[#13734b]">{shipment.tracking_number}</Link>)}</div></section> : null}

      {!showArchived ? (
        <>
        {!isShipper ? (
          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">Live operations</p><h2 className="mt-1 text-lg font-bold text-[#26372f]">Shipment dashboard</h2></div>
            <div className="flex flex-wrap gap-2">
              <Link href={exportHref} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#bdd9ca] bg-white px-4 text-xs font-bold text-[#13734b] shadow-sm transition hover:bg-[#edf7f2]"><Download className="size-4" />CSV</Link>
              <Link href={excelExportHref} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#13734b] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#0d5e3d]"><Download className="size-4" />Excel</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
            {dashboardCards.map(([status, label, count, Icon]) => {
              const href = new URLSearchParams();
              if (status) href.set("status", status);
              if (params.from) href.set("from", params.from);
              if (params.to) href.set("to", params.to);
              if (!isShipper && params.shipper) href.set("shipper", params.shipper);
              if (params.driver) href.set("driver", params.driver);
              if (destinationCountryCode) href.set("destination", destinationCountryCode);
              const active = status === "" ? !requestedStatus : requestedStatus === status;
              return (
                <Link key={label} href={`/shipments?${href.toString()}`} className={`rounded-2xl border p-4 transition ${active ? "border-[#13734b] bg-[#13734b] text-white shadow-lg shadow-[#13734b]/10" : "border-[#e0e8e4] bg-white text-[#26372f] hover:border-[#9fc8b4]"}`}>
                  <Icon className={`size-4 ${active ? "text-white/80" : "text-[#13734b]"}`} />
                  <p className="mt-3 text-2xl font-black">{count}</p>
                  <p className={`mt-1 text-[9px] font-bold uppercase tracking-wide ${active ? "text-white/65" : "text-[#87938d]"}`}>{label}</p>
                </Link>
              );
            })}
          </div>
          </section>
        ) : null}
        </>
      ) : null}

      <form noValidate className="mt-7 grid gap-3 rounded-2xl border border-[#e0e8e4] bg-white p-4 shadow-[0_8px_30px_rgba(24,51,39,0.045)] md:grid-cols-2 xl:grid-cols-5">
        {showArchived ? <input type="hidden" name="view" value="archived" /> : null}
        <label className="relative"><Search className="absolute left-3.5 top-3.5 size-4 text-[#819088]" /><input name="q" defaultValue={params.q} className="h-11 w-full rounded-xl border border-[#dbe5e0] pl-10 pr-3 text-sm outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10" placeholder="AWB, reference, customer or phone" /></label>
        <select name="status" defaultValue={requestedStatus} className="h-11 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm text-[#405048] outline-none focus:border-[#2b9466]"><option value="">All statuses</option>{(isShipper ? [...shipmentStatuses, "in_transit" as const] : shipmentStatuses).map((status) => <option key={status} value={status}>{status === "in_transit" ? "In transit" : statusLabels[status]}</option>)}</select>
        {!isShipper ? (
          <select name="shipper" defaultValue={params.shipper ?? ""} className="h-11 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm text-[#405048] outline-none focus:border-[#2b9466]"><option value="">All shippers</option>{(shippers ?? []).map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.full_name || shipper.email}</option>)}</select>
        ) : <input type="hidden" name="shipper" value="" />}
        <select name="destination" defaultValue={destinationCountryCode} className="h-11 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm text-[#405048] outline-none focus:border-[#2b9466]"><option value="">All destination country codes</option>{destinationCountryCodes.map((code) => <option key={code} value={code}>{code}</option>)}</select>
        <select name="driver" defaultValue={params.driver ?? ""} className="h-11 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm text-[#405048] outline-none focus:border-[#2b9466]"><option value="">All drivers</option>{(drivers ?? []).map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name || driver.email}</option>)}</select>
        <ShipmentDateFields initialFrom={params.from ?? ""} initialTo={params.to ?? ""} />
        <button className="h-11 self-end rounded-xl bg-[#e7f4ed] px-5 text-sm font-bold text-[#13734b]">Apply filters</button>
      </form>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        {error ? <div className="p-8 text-center text-sm font-semibold text-[#b74646]">Shipments could not be loaded.</div> : shipments.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center"><div><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e7f4ed] text-[#188459]"><PackagePlus className="size-7" /></div><h2 className="mt-4 text-lg font-bold text-[#26372f]">No shipments found</h2><p className="mt-1 text-sm text-[#7a8881]">Create your first shipment to generate a printable AWB.</p><Link href="/shipments/new" className="mt-5 inline-flex rounded-xl bg-[#13734b] px-5 py-2.5 text-sm font-bold text-white">Create shipment</Link></div></div>
        ) : <ShipmentSelectionTable shipments={shipments} archived={showArchived} currency={tenantCurrency} />}
      </section>
    </div>
  );
}

