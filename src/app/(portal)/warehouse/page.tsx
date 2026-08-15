import Link from "next/link";
import { ArrowRight, ClipboardList, RotateCcw, Truck, Warehouse } from "lucide-react";
import { WarehouseReturnForm } from "@/components/warehouse-return-form";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import {
  manifestStatusClass,
  pickupManifestStatusLabels,
  type PickupManifest,
} from "@/lib/pickup-manifests";
import { formatDubaiDate, type Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Warehouse Receiving" };

const warehouseRoles = ["super_admin", "operations_admin", "warehouse_staff"] as const;
type WarehouseManifest = PickupManifest & { pickup_manifest_items: Array<{ id: number; received_at: string | null }> };
type PendingDriverReturn = Shipment & { profiles: { full_name: string } | null };

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const profile = await requireProfile(internalRoles);
  const params = await searchParams;

  const allowedViews = [
    "all",
    "new",
    "driver_returns",
    "reattempt",
    "rto",
    "dispatch_ready",
  ];

  const view = allowedViews.includes(params.view ?? "")
    ? String(params.view)
    : "all";

  const supabase = await createClient();

  const lookupTracking = String(params.q ?? "").trim().toUpperCase();

  const lookupResult = lookupTracking
    ? await supabase
        .from("shipments")
        .select(
          "*, profiles!shipments_assigned_driver_id_fkey(full_name)",
        )
        .eq("tracking_number", lookupTracking)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };

  const lookupShipment =
    lookupResult.data as unknown as PendingDriverReturn | null;

  const [
    { data: manifestData, error: manifestError },
    { data: returnData, error: returnError },
    { data: warehouseData, error: warehouseError },
  ] = await Promise.all([
    supabase
      .from("pickup_manifests")
      .select("*, pickup_manifest_items(id, received_at)")
      .in("status", ["picked_up", "partially_received"])
      .order("picked_up_at", { ascending: true }),

    supabase
      .from("shipments")
      .select(
        "*, profiles!shipments_assigned_driver_id_fkey(full_name)",
      )
      .in("status", ["undelivered", "return_initiated"])
      .not("assigned_driver_id", "is", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: true }),

    supabase
      .from("shipments")
      .select(
        "*, profiles!shipments_assigned_driver_id_fkey(full_name)",
      )
      .in("status", ["at_warehouse", "return_initiated"])
      .is("deleted_at", null)
      .order("updated_at", { ascending: true }),
  ]);

  const manifests = (manifestData ?? []) as WarehouseManifest[];
  const pendingReturns =
    (returnData ?? []) as unknown as PendingDriverReturn[];

  const warehouseInventory = (
    (warehouseData ?? []) as unknown as PendingDriverReturn[]
  ).filter(
    (shipment) =>
      shipment.status === "at_warehouse" ||
      (shipment.status === "return_initiated" &&
        !shipment.assigned_driver_id),
  );

  const pendingPickupAwbs = manifests.reduce(
    (sum, manifest) =>
      sum +
      manifest.pickup_manifest_items.filter((item) => !item.received_at)
        .length,
    0,
  );

  const canReceiveReturns = warehouseRoles.includes(
    profile.role as (typeof warehouseRoles)[number],
  );

  const categoryFor = (shipment: PendingDriverReturn) => {
    if (shipment.status === "return_initiated") return "rto";

    if (
      shipment.status === "at_warehouse" &&
      shipment.delivery_attempt_count > 0
    ) {
      return "reattempt";
    }

    return "new";
  };

  const reasonFor = (shipment: PendingDriverReturn) => {
    const category = categoryFor(shipment);

    if (category === "rto") {
      return "Return to shipper";
    }

    if (category === "reattempt") {
      return `Reattempt ready · Attempt ${shipment.delivery_attempt_count}`;
    }

    return "New pickup received";
  };

  const nextActionFor = (shipment: PendingDriverReturn) => {
    const category = categoryFor(shipment);

    if (category === "rto") {
      return "Add to Return to Shipper run";
    }

    return "Ready for dispatch";
  };

  const newPickupInventory = warehouseInventory.filter(
    (shipment) => categoryFor(shipment) === "new",
  );

  const reattemptInventory = warehouseInventory.filter(
    (shipment) => categoryFor(shipment) === "reattempt",
  );

  const rtoInventory = warehouseInventory.filter(
    (shipment) => categoryFor(shipment) === "rto",
  );

  const dispatchReadyInventory = warehouseInventory.filter(
    (shipment) =>
      categoryFor(shipment) === "new" ||
      categoryFor(shipment) === "reattempt",
  );

  let visibleInventory = warehouseInventory;

  if (view === "new") visibleInventory = newPickupInventory;
  if (view === "reattempt") visibleInventory = reattemptInventory;
  if (view === "rto") visibleInventory = rtoInventory;
  if (view === "dispatch_ready")
    visibleInventory = dispatchReadyInventory;

  const tabs = [
    ["all", "All in Warehouse", warehouseInventory.length],
    ["new", "New Pickup", newPickupInventory.length],
    ["driver_returns", "Driver Returns", pendingReturns.length],
    ["reattempt", "Reattempt Ready", reattemptInventory.length],
    ["rto", "RTO Ready", rtoInventory.length],
    ["dispatch_ready", "Dispatch Ready", dispatchReadyInventory.length],
  ] as const;

  return (
    <div className="mx-auto max-w-[1450px]">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm font-semibold text-[#188459]">
            Physical custody control
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            Warehouse operations
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#74827b]">
            See what is physically in the warehouse, why each AWB is here and
            what should happen next.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {tabs.map(([key, label, count]) => (
            <Link
              key={key}
              href={`/warehouse?view=${key}`}
              className={`rounded-xl border px-4 py-3 transition ${
                view === key
                  ? "border-[#13734b] bg-[#13734b] text-white"
                  : "border-[#dce6e1] bg-white text-[#405048] hover:border-[#9fc8b4]"
              }`}
            >
              <p
                className={`text-[9px] font-bold uppercase tracking-wide ${
                  view === key ? "text-white/65" : "text-[#7b8982]"
                }`}
              >
                {label}
              </p>
              <p className="mt-1 text-xl font-black">{count}</p>
            </Link>
          ))}
        </div>
      </div>

      <section className="mt-7 rounded-2xl border border-[#dce6e1] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">
              Universal AWB check
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#26372f]">
              Scan or search any shipment
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Check where an AWB is, whether warehouse has physical custody and what action is required next.
            </p>
          </div>

          <form
            action="/warehouse"
            method="get"
            className="flex w-full max-w-xl gap-2"
          >
            <input type="hidden" name="view" value={view} />
            <input
              name="q"
              defaultValue={lookupTracking}
              placeholder="Scan / enter AWB"
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#dbe5e0] bg-white px-4 text-sm font-semibold uppercase text-[#25352d] outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10"
            />
            <button className="h-11 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white">
              Check AWB
            </button>
          </form>
        </div>

        {lookupTracking ? (
          <div className="mt-5 border-t border-[#edf1ef] pt-5">
            {!lookupShipment ? (
              <div className="rounded-xl border border-[#efcccc] bg-[#fff5f5] px-4 py-4 text-sm font-semibold text-[#a63e3e]">
                AWB {lookupTracking} was not found.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr]">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                    Shipment
                  </p>
                  <Link
                    href={`/shipments/${lookupShipment.id}`}
                    className="mt-1 block font-mono text-base font-black text-[#13734b]"
                  >
                    {lookupShipment.tracking_number}
                  </Link>
                  <p className="mt-1 text-xs text-[#87938d]">
                    {lookupShipment.consignee_name} · {lookupShipment.consignee_city}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                    Current status
                  </p>
                  <p className="mt-1 text-sm font-black capitalize text-[#405048]">
                    {lookupShipment.status.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-[#87938d]">
                    Attempt #{lookupShipment.delivery_attempt_count}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                    Physical custody
                  </p>

                  {lookupShipment.status === "at_warehouse" ||
                  (lookupShipment.status === "return_initiated" &&
                    !lookupShipment.assigned_driver_id) ? (
                    <>
                      <p className="mt-1 text-sm font-black text-[#13734b]">
                        In warehouse
                      </p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        {lookupShipment.status === "return_initiated"
                          ? "RTO / Return to Shipper"
                          : lookupShipment.delivery_attempt_count > 0
                            ? "Returned for reattempt"
                            : "New pickup received"}
                      </p>
                    </>
                  ) : lookupShipment.status === "undelivered" &&
                    lookupShipment.assigned_driver_id ? (
                    <>
                      <p className="mt-1 text-sm font-black text-[#b76223]">
                        With driver
                      </p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        Physical warehouse return pending
                      </p>
                    </>
                  ) : lookupShipment.status === "out_for_delivery" ? (
                    <>
                      <p className="mt-1 text-sm font-black text-[#376eb1]">
                        With delivery driver
                      </p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        Not in warehouse
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-sm font-black text-[#68766f]">
                        Not in warehouse
                      </p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        No physical warehouse custody currently
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                    Next action
                  </p>

                  <p className="mt-1 text-sm font-black text-[#26372f]">
                    {lookupShipment.status === "at_warehouse"
                      ? lookupShipment.delivery_attempt_count > 0
                        ? "Dispatch for reattempt"
                        : "Ready for dispatch"
                      : lookupShipment.status === "return_initiated" &&
                          !lookupShipment.assigned_driver_id
                        ? "Add to Return to Shipper run"
                        : lookupShipment.status === "undelivered" &&
                            lookupShipment.assigned_driver_id
                          ? "Receive driver return at warehouse"
                          : lookupShipment.status === "out_for_delivery"
                            ? "Await delivery result"
                            : lookupShipment.status === "delivered"
                              ? "Completed — no warehouse action"
                              : lookupShipment.status === "returned_to_shipper"
                                ? "Completed — returned to shipper"
                                : "Follow current shipment workflow"}
                  </p>

                  {lookupShipment.last_undelivered_reason ? (
                    <p className="mt-1 text-xs capitalize text-[#87938d]">
                      Reason:{" "}
                      {lookupShipment.last_undelivered_reason.replaceAll(
                        "_",
                        " ",
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
        {canReceiveReturns ? (
          <WarehouseReturnForm />
        ) : (
          <div className="rounded-2xl border border-[#e4d5b8] bg-[#fffaf1] p-5 text-sm font-semibold text-[#8a651f]">
            Warehouse receipt access is required to scan driver returns.
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
          <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
            <div>
              <h2 className="font-bold text-[#26372f]">
                {view === "driver_returns"
                  ? "Pending physical driver returns"
                  : "Current warehouse inventory"}
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                {view === "driver_returns"
                  ? "Driver still holds these AWBs; receive them physically before the next action."
                  : "Only AWBs currently under warehouse custody are shown."}
              </p>
            </div>
            <Warehouse className="size-5 text-[#13734b]" />
          </div>

          {view === "driver_returns" ? (
            returnError ? (
              <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
                Driver-return queue could not be loaded.
              </p>
            ) : pendingReturns.length === 0 ? (
              <div className="grid min-h-64 place-items-center p-8 text-center">
                <div>
                  <Truck className="mx-auto size-9 text-[#9aaba2]" />
                  <p className="mt-3 font-bold text-[#405048]">
                    No driver returns pending
                  </p>
                  <p className="mt-1 text-sm text-[#87938d]">
                    Undelivered and final-return AWBs will appear here until
                    warehouse receipt.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                  <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]">
                    <tr>
                      <th className="px-5 py-3.5">AWB</th>
                      <th className="px-5 py-3.5">Consignee</th>
                      <th className="px-5 py-3.5">Type</th>
                      <th className="px-5 py-3.5">Attempt</th>
                      <th className="px-5 py-3.5">Reason</th>
                      <th className="px-5 py-3.5">Returning driver</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ef]">
                    {pendingReturns.map((shipment) => (
                      <tr key={shipment.id} className="text-sm">
                        <td className="px-5 py-4">
                          <Link
                            href={`/shipments/${shipment.id}`}
                            className="font-mono font-black text-[#13734b]"
                          >
                            {shipment.tracking_number}
                          </Link>
                          <p className="mt-1 text-xs text-[#87938d]">
                            {shipment.reference_number || "No reference"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-[#34453c]">
                            {shipment.consignee_name}
                          </p>
                          <p className="mt-1 text-xs text-[#87938d]">
                            {shipment.consignee_city}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-[#fff0d8] px-2.5 py-1 text-xs font-bold text-[#976019]">
                            {shipment.status === "return_initiated"
                              ? "Final RTO"
                              : "Driver return"}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-black text-[#8a5b18]">
                          #{shipment.delivery_attempt_count}
                        </td>
                        <td className="px-5 py-4 text-xs font-semibold capitalize text-[#68766f]">
                          {shipment.last_undelivered_reason?.replaceAll(
                            "_",
                            " ",
                          ) || "—"}
                        </td>
                        <td className="px-5 py-4 font-semibold text-[#405048]">
                          {shipment.profiles?.full_name || "Assigned driver"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : warehouseError ? (
            <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
              Warehouse inventory could not be loaded.
            </p>
          ) : visibleInventory.length === 0 ? (
            <div className="grid min-h-64 place-items-center p-8 text-center">
              <div>
                <Warehouse className="mx-auto size-10 text-[#9aaba2]" />
                <p className="mt-3 font-bold text-[#405048]">
                  No AWBs in this warehouse view
                </p>
                <p className="mt-1 text-sm text-[#87938d]">
                  Change the warehouse filter or receive the next inbound AWB.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left">
                <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]">
                  <tr>
                    <th className="px-5 py-3.5">AWB</th>
                    <th className="px-5 py-3.5">Consignee</th>
                    <th className="px-5 py-3.5">Why here</th>
                    <th className="px-5 py-3.5">Attempt</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Next action</th>
                    <th className="px-5 py-3.5">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ef]">
                  {visibleInventory.map((shipment) => (
                    <tr key={shipment.id} className="text-sm">
                      <td className="px-5 py-4">
                        <Link
                          href={`/shipments/${shipment.id}`}
                          className="font-mono font-black text-[#13734b]"
                        >
                          {shipment.tracking_number}
                        </Link>
                        <p className="mt-1 text-xs text-[#87938d]">
                          {shipment.reference_number || "No reference"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#34453c]">
                          {shipment.consignee_name}
                        </p>
                        <p className="mt-1 text-xs text-[#87938d]">
                          {shipment.consignee_city}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            categoryFor(shipment) === "rto"
                              ? "bg-[#fdeaea] text-[#b44747]"
                              : categoryFor(shipment) === "reattempt"
                                ? "bg-[#fff0d8] text-[#976019]"
                                : "bg-[#e5f3eb] text-[#16724b]"
                          }`}
                        >
                          {reasonFor(shipment)}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-black text-[#405048]">
                        #{shipment.delivery_attempt_count}
                      </td>

                      <td className="px-5 py-4 text-xs font-semibold capitalize text-[#68766f]">
                        {shipment.status.replaceAll("_", " ")}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-[#edf5f1] px-3 py-2 text-xs font-bold text-[#37604e]">
                          {nextActionFor(shipment)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-xs text-[#87938d]">
                        {formatDubaiDate(shipment.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
          <div>
            <h2 className="font-bold text-[#26372f]">
              Inbound pickup manifests
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              New pickups waiting for complete warehouse receiving.
            </p>
          </div>
          <ClipboardList className="size-5 text-[#13734b]" />
        </div>

        {manifestError ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            Warehouse queue could not be loaded.
          </p>
        ) : manifests.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e7f4ed] text-[#188459]">
                <Warehouse className="size-7" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-[#26372f]">
                Pickup queue is clear
              </h2>
              <p className="mt-1 text-sm text-[#7a8881]">
                Picked-up manifests will appear here automatically.
              </p>
              <Link
                href="/pickup-manifests"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#13734b] px-4 py-2.5 text-sm font-bold text-white"
              >
                <ClipboardList className="size-4" />
                View manifests
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#edf1ef]">
            {manifests.map((manifest) => {
              const total = manifest.pickup_manifest_items.length;
              const received =
                manifest.pickup_manifest_items.filter(
                  (item) => item.received_at,
                ).length;
              const percent = total
                ? Math.round((received / total) * 100)
                : 0;

              return (
                <Link
                  key={manifest.id}
                  href={`/pickup-manifests/${manifest.id}`}
                  className="grid gap-4 px-5 py-5 transition hover:bg-[#fbfcfb] sm:grid-cols-[1.2fr_1fr_1fr_130px_auto] sm:items-center"
                >
                  <div>
                    <p className="font-mono text-sm font-black text-[#24362d]">
                      {manifest.manifest_number}
                    </p>
                    <p className="mt-1 text-xs text-[#87938d]">
                      {manifest.shipper_name}
                    </p>
                  </div>

                  <div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${manifestStatusClass(
                        manifest.status,
                      )}`}
                    >
                      {pickupManifestStatusLabels[manifest.status]}
                    </span>
                    <p className="mt-2 text-xs text-[#87938d]">
                      Picked{" "}
                      {manifest.picked_up_at
                        ? formatDubaiDate(manifest.picked_up_at)
                        : "—"}
                    </p>
                  </div>

                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#edf1ef]">
                      <div
                        className="h-full rounded-full bg-[#2ca66e]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[#68766f]">
                      {received}/{total} received
                    </p>
                  </div>

                  <p className="text-sm font-black text-[#8a5b18]">
                    {total - received} pending
                  </p>

                  <span className="grid size-9 place-items-center rounded-lg border border-[#dfe7e3] text-[#13734b]">
                    <ArrowRight className="size-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

