"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { optimizeRouteStops, parseCoordinatePair } from "@/lib/google-maps";
import { createClient } from "@/lib/supabase/server";

export type FleetPlanState = {
  status: "idle" | "success" | "error";
  message: string;
};

const dispatchRoles = ["super_admin", "operations_admin", "warehouse_staff", "dispatcher"] as const;

type PlanningShipment = {
  id: number;
  tracking_number: string;
  service_zone_name: string | null;
  consignee_postal_code: string | null;
  consignee_city: string;
  consignee_address: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
};

type Driver = { id: string; full_name: string; employee_code: string | null };

function normalizedPostal(value: string | null) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "");
}

function planningKey(shipment: PlanningShipment) {
  return [
    shipment.service_zone_name ?? "ZZZ-UNMAPPED",
    normalizedPostal(shipment.consignee_postal_code),
    shipment.consignee_city.toUpperCase(),
    shipment.consignee_address.toUpperCase(),
    shipment.tracking_number,
  ].join("|");
}

async function fetchWarehouseShipments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  zoneName: string,
) {
  const rows: PlanningShipment[] = [];
  for (let start = 0; start < 5000; start += 1000) {
    let query = supabase
      .from("shipments")
      .select("id,tracking_number,service_zone_name,consignee_postal_code,consignee_city,consignee_address,delivery_latitude,delivery_longitude")
      .eq("organization_id", organizationId)
      .eq("status", "at_warehouse")
      .is("deleted_at", null)
      .eq("fulfillment_mode", "own_fleet")
      .order("service_zone_name", { ascending: true, nullsFirst: false })
      .order("consignee_postal_code", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(start, Math.min(start + 999, 4999));

    if (zoneName === "__unmapped__") query = query.is("service_zone_name", null);
    else if (zoneName) query = query.eq("service_zone_name", zoneName);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as PlanningShipment[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

export async function autoPlanFleetRoutesAction(
  _previousState: FleetPlanState,
  formData: FormData,
): Promise<FleetPlanState> {
  const profile = await requireProfile(dispatchRoles);
  if (!profile.organization_id) return { status: "error", message: "Organization is missing." };

  const driverIds = Array.from(new Set(formData.getAll("driver_ids").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id))));
  const zoneName = String(formData.get("zone_name") ?? "").trim();
  const maxStops = Number(formData.get("max_stops") ?? 100);

  if (!driverIds.length) return { status: "error", message: "Select at least one active driver." };
  if (!Number.isInteger(maxStops) || maxStops < 10 || maxStops > 250) {
    return { status: "error", message: "Stops per route must be between 10 and 250." };
  }

  const supabase = await createClient();
  const { data: driverData, error: driverError } = await supabase
    .from("profiles")
    .select("id,full_name,employee_code")
    .eq("organization_id", profile.organization_id)
    .eq("role", "driver")
    .eq("status", "active")
    .in("id", driverIds)
    .order("full_name");

  if (driverError) return { status: "error", message: "Selected drivers could not be loaded." };
  const drivers = (driverData ?? []) as Driver[];
  if (drivers.length !== driverIds.length) return { status: "error", message: "One or more selected drivers are not active." };

  let shipments: PlanningShipment[];
  try {
    shipments = await fetchWarehouseShipments(supabase, profile.organization_id, zoneName);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Warehouse shipments could not be loaded." };
  }

  if (!shipments.length) return { status: "error", message: "No own-fleet warehouse shipments are available for this selection." };

  const shipmentIds = shipments.map((shipment) => shipment.id);
  const alreadyPlanned = new Set<number>();
  for (let index = 0; index < shipmentIds.length; index += 200) {
    const { data } = await supabase
      .from("dispatch_run_items")
      .select("shipment_id,dispatch_runs!inner(status,organization_id)")
      .in("shipment_id", shipmentIds.slice(index, index + 200))
      .eq("dispatch_runs.organization_id", profile.organization_id)
      .in("dispatch_runs.status", ["draft", "handed_over"]);
    for (const row of data ?? []) alreadyPlanned.add(Number(row.shipment_id));
  }

  shipments = shipments.filter((shipment) => !alreadyPlanned.has(shipment.id));
  if (!shipments.length) return { status: "error", message: "All matching warehouse shipments are already on active or draft routes." };

  shipments.sort((a, b) => planningKey(a).localeCompare(planningKey(b), "en"));

  const groups = new Map<string, PlanningShipment[]>();
  for (const shipment of shipments) {
    const key = shipment.service_zone_name || "Unmapped";
    const current = groups.get(key) ?? [];
    current.push(shipment);
    groups.set(key, current);
  }

  const routeBatches: Array<{ zone: string; shipments: PlanningShipment[] }> = [];
  for (const [zone, zoneShipments] of groups) {
    for (let index = 0; index < zoneShipments.length; index += maxStops) {
      routeBatches.push({ zone, shipments: zoneShipments.slice(index, index + maxStops) });
    }
  }

  let createdRoutes = 0;
  let plannedShipments = 0;
  let driverCursor = 0;
  const zoneCounters = new Map<string, number>();

  for (const batch of routeBatches) {
    const driver = drivers[driverCursor % drivers.length];
    driverCursor += 1;
    const zoneBatch = (zoneCounters.get(batch.zone) ?? 0) + 1;
    zoneCounters.set(batch.zone, zoneBatch);
    const routeName = `${batch.zone} · ${driver.full_name} · Batch ${zoneBatch}`.slice(0, 100);

    const { data: run, error: runError } = await supabase
      .from("dispatch_runs")
      .insert({
        organization_id: profile.organization_id,
        route_name: routeName,
        driver_id: driver.id,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (runError || !run) {
      return { status: "error", message: `Route planning stopped after ${createdRoutes} routes. ${runError?.message ?? "Route could not be created."}` };
    }

    const knownStops = batch.shipments.flatMap((shipment) => {
      const point = parseCoordinatePair(
        shipment.delivery_latitude,
        shipment.delivery_longitude,
      );
      return point ? [{ id: shipment.id, ...point }] : [];
    });

    const optimizedShipmentIds = knownStops.length >= 2 ? await optimizeRouteStops(knownStops) : [];
    const optimizedSet = new Set(optimizedShipmentIds);
    const fallback = batch.shipments.map((shipment) => shipment.id).filter((id) => !optimizedSet.has(id));
    const sequence = [...optimizedShipmentIds, ...fallback];
    const sequenceMap = new Map(sequence.map((shipmentId, index) => [shipmentId, index + 1]));

    for (let index = 0; index < batch.shipments.length; index += 500) {
      const rows = batch.shipments.slice(index, index + 500).map((shipment) => ({
        run_id: Number(run.id),
        shipment_id: shipment.id,
        added_by: profile.id,
        stop_sequence: sequenceMap.get(shipment.id) ?? index + 1,
        optimized_at: optimizedSet.has(shipment.id) ? new Date().toISOString() : null,
      }));
      const { error: itemError } = await supabase.from("dispatch_run_items").insert(rows);
      if (itemError) {
        return { status: "error", message: `Route ${routeName} was created but its AWBs could not be fully assigned: ${itemError.message}` };
      }
    }

    createdRoutes += 1;
    plannedShipments += batch.shipments.length;
  }

  revalidatePath("/dispatch");
  revalidatePath("/shipments");

  const coordinateCount = shipments.filter((shipment) =>
    parseCoordinatePair(
      shipment.delivery_latitude,
      shipment.delivery_longitude,
    ),
  ).length;
  const optimizationNote = coordinateCount === shipments.length
    ? "Google stop sequencing was applied to all routes."
    : `${coordinateCount}/${shipments.length} shipments already had coordinates; remaining stops are provisionally ordered by zone/postal code and will be Google-optimized at driver handover.`;

  return {
    status: "success",
    message: `${plannedShipments} warehouse shipments planned into ${createdRoutes} draft route${createdRoutes === 1 ? "" : "s"} across ${drivers.length} driver${drivers.length === 1 ? "" : "s"}. ${optimizationNote}`,
  };
}
