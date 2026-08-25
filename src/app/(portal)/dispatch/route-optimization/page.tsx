import Link from "next/link";
import { MapPinned, Route, Truck } from "lucide-react";
import { DispatchOptimizationMapLoader } from "@/components/dispatch-optimization-map-loader";
import { DraftRouteManager } from "@/components/draft-route-manager";
import type {
  OptimizationDriver,
  OptimizationRoute,
  OptimizationStop,
} from "@/components/dispatch-optimization-map";
import { FleetRoutePlanner } from "@/components/fleet-route-planner";
import { requireProfile } from "@/lib/auth";
import { parseCoordinatePair } from "@/lib/google-maps";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Route Optimization" };

const dispatchRoles = ["super_admin", "operations_admin", "warehouse_staff", "dispatcher"] as const;
const routeColors = ["#13734b", "#376eb1", "#c77912", "#7b5ac8", "#c14f7a", "#258a8a", "#9b5b32", "#4c6f44"];

type WarehouseShipment = {
  id: number;
  tracking_number: string;
  consignee_name: string;
  consignee_city: string | null;
  service_zone_name: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
};

async function fetchWarehousePool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
) {
  const shipments: WarehouseShipment[] = [];
  for (let start = 0; start < 5000; start += 1000) {
    const { data, error } = await supabase
      .from("shipments")
      .select("id,tracking_number,consignee_name,consignee_city,service_zone_name,delivery_latitude,delivery_longitude")
      .eq("organization_id", organizationId)
      .eq("status", "at_warehouse")
      .eq("fulfillment_mode", "own_fleet")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(start, start + 999);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as WarehouseShipment[];
    shipments.push(...batch);
    if (batch.length < 1000) break;
  }
  return shipments;
}

export default async function RouteOptimizationPage() {
  const profile = await requireProfile(dispatchRoles);
  if (!profile.organization_id) {
    return <div className="rounded-2xl border border-[#efc7c7] bg-[#fff1f1] p-8 text-sm font-semibold text-[#a13f3f]">Organization could not be identified.</div>;
  }

  const supabase = await createClient();
  const db = supabase as any;
  const [
    { data: driverData, error: driverError },
    { data: locationData },
    { data: runData, error: runError },
    { count: exactWarehouseCount },
    { count: totalShipmentCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,employee_code")
      .eq("organization_id", profile.organization_id)
      .eq("role", "driver")
      .eq("status", "active")
      .order("full_name"),
    db
      .from("driver_locations")
      .select("driver_id,latitude,longitude,is_online,recorded_at")
      .eq("organization_id", profile.organization_id),
    supabase
      .from("dispatch_runs")
      .select("id,run_number,route_name,driver_id,status,profiles!dispatch_runs_driver_id_fkey(full_name,employee_code)")
      .eq("organization_id", profile.organization_id)
      .in("status", ["draft", "handed_over"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .eq("status", "at_warehouse")
      .eq("fulfillment_mode", "own_fleet")
      .is("deleted_at", null),
    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null),
  ]);

  let warehouseRows: WarehouseShipment[] = [];
  let warehouseError = "";
  try {
    warehouseRows = await fetchWarehousePool(supabase, profile.organization_id);
  } catch (error) {
    warehouseError = error instanceof Error ? error.message : "Warehouse shipments could not be loaded.";
  }

  const activeRuns = (runData ?? []) as any[];
  const runIds = activeRuns.map((run) => Number(run.id));
  const activeItems: any[] = [];
  if (runIds.length > 0) {
    for (let start = 0; start < 5000; start += 1000) {
      const { data, error } = await db
        .from("dispatch_run_items")
        .select("id,run_id,shipment_id,stop_sequence,shipments(id,tracking_number,consignee_name,consignee_city,delivery_latitude,delivery_longitude)")
        .in("run_id", runIds)
        .order("run_id", { ascending: true })
        .order("stop_sequence", { ascending: true })
        .range(start, start + 999);
      if (error) break;
      const batch = data ?? [];
      activeItems.push(...batch);
      if (batch.length < 1000) break;
    }
  }

  const warehouseIdSet = new Set(warehouseRows.map((shipment) => shipment.id));
  const routedWarehouseIds = new Set(
    activeItems
      .map((item) => Number(item.shipment_id))
      .filter((shipmentId) => warehouseIdSet.has(shipmentId)),
  );
  const availableWarehouseRows = warehouseRows.filter((shipment) => !routedWarehouseIds.has(shipment.id));
  const availableWarehouseCount = Math.max(0, (exactWarehouseCount ?? warehouseRows.length) - routedWarehouseIds.size);

  const poolStops: OptimizationStop[] = availableWarehouseRows.flatMap((shipment) => {
    const point = parseCoordinatePair(shipment.delivery_latitude, shipment.delivery_longitude);
    return point ? [{
      id: shipment.id,
      trackingNumber: shipment.tracking_number,
      consigneeName: shipment.consignee_name,
      city: shipment.consignee_city,
      ...point,
    }] : [];
  });

  const routes: OptimizationRoute[] = activeRuns.map((run, index) => {
    const items = activeItems.filter((item) => Number(item.run_id) === Number(run.id));
    const stops = items.flatMap((item, itemIndex) => {
      const shipment = Array.isArray(item.shipments) ? item.shipments[0] : item.shipments;
      const point = parseCoordinatePair(shipment?.delivery_latitude, shipment?.delivery_longitude);
      return shipment && point ? [{
        id: Number(shipment.id),
        trackingNumber: String(shipment.tracking_number),
        consigneeName: String(shipment.consignee_name),
        city: shipment.consignee_city ? String(shipment.consignee_city) : null,
        sequence: Number(item.stop_sequence) || itemIndex + 1,
        ...point,
      }] : [];
    });
    return {
      id: Number(run.id),
      runNumber: String(run.run_number),
      routeName: String(run.route_name),
      driverName: run.profiles?.full_name || "Driver",
      driverId: String(run.driver_id),
      status: run.status === "handed_over" ? "handed_over" : "draft",
      totalStops: items.length,
      unmappedStops: Math.max(0, items.length - stops.length),
      color: routeColors[index % routeColors.length],
      stops,
    };
  });

  const locationByDriver = new Map((locationData ?? []).map((location: any) => [String(location.driver_id), location]));
  const assignedByDriver = new Map<string, number>();
  for (const route of routes) assignedByDriver.set(route.driverId, (assignedByDriver.get(route.driverId) ?? 0) + route.totalStops);
  const drivers: OptimizationDriver[] = (driverData ?? []).map((driver) => {
    const location: any = locationByDriver.get(driver.id);
    const point = parseCoordinatePair(location?.latitude, location?.longitude);
    return {
      id: driver.id,
      name: driver.full_name,
      employeeCode: driver.employee_code,
      assignedCount: assignedByDriver.get(driver.id) ?? 0,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
      isOnline: Boolean(location?.is_online),
      recordedAt: location?.recorded_at ? String(location.recorded_at) : null,
    };
  });

  const zoneMap = new Map<string, number>();
  for (const shipment of availableWarehouseRows) {
    const name = shipment.service_zone_name || "Unmapped";
    zoneMap.set(name, (zoneMap.get(name) ?? 0) + 1);
  }
  const zones = Array.from(zoneMap, ([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[#188459]"><MapPinned className="size-4" /> Fleet planning control</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Route Optimization</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#74827b]">See all dispatch-ready shipments, active routes and driver GPS positions together, then balance the available pool across selected drivers.</p>
        </div>
        <nav aria-label="Dispatch views" className="inline-flex w-fit rounded-xl border border-[#d9e7df] bg-white p-1">
          <Link href="/dispatch" className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold text-[#526159] transition hover:bg-[#f2f7f4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2b9466]/15"><Truck className="size-4" /> Dispatch routes</Link>
          <span aria-current="page" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#13734b] px-4 text-sm font-bold text-white"><Route className="size-4" /> Route Optimization</span>
        </nav>
      </div>

      {driverError || runError || warehouseError ? (
        <div className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          Some route-planning data could not be loaded. Refresh the page before creating routes.
        </div>
      ) : null}

      <div className="mt-7">
        <DispatchOptimizationMapLoader
          poolStops={poolStops}
          totalPoolStops={availableWarehouseCount}
          unmappedPoolStops={Math.max(0, availableWarehouseCount - poolStops.length)}
          routes={routes}
          drivers={drivers}
        />
      </div>

      <DraftRouteManager
        routes={routes
          .filter((route) => route.status === "draft")
          .map((route) => ({
            id: route.id,
            runNumber: route.runNumber,
            routeName: route.routeName,
            driverName: route.driverName,
            totalStops: route.totalStops,
          }))}
      />

      <FleetRoutePlanner
        drivers={(driverData ?? []).map((driver) => ({ id: driver.id, full_name: driver.full_name, employee_code: driver.employee_code }))}
        warehouseCount={availableWarehouseCount}
        totalShipmentCount={totalShipmentCount ?? availableWarehouseCount}
        zones={zones}
      />
    </div>
  );
}
