"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { ArrowRight, MapPinned, Navigation, RadioTower, Truck } from "lucide-react";

export type OptimizationStop = {
  id: number;
  trackingNumber: string;
  consigneeName: string;
  city: string | null;
  latitude: number;
  longitude: number;
  sequence?: number | null;
};

export type OptimizationRoute = {
  id: number;
  runNumber: string;
  routeName: string;
  driverName: string;
  driverId: string;
  status: "draft" | "handed_over";
  totalStops: number;
  unmappedStops: number;
  color: string;
  stops: OptimizationStop[];
};

export type OptimizationDriver = {
  id: string;
  name: string;
  employeeCode: string | null;
  assignedCount: number;
  latitude: number | null;
  longitude: number | null;
  isOnline: boolean;
  recordedAt: string | null;
};

export type DispatchOptimizationMapProps = {
  poolStops: OptimizationStop[];
  totalPoolStops: number;
  unmappedPoolStops: number;
  routes: OptimizationRoute[];
  drivers: OptimizationDriver[];
};

function FitOptimizationBounds({ positions }: { positions: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 1) {
      map.setView(positions[0], 13);
      return;
    }
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [36, 36], maxZoom: 13 });
    }
  }, [map, positions]);

  return null;
}

function shortTime(value: string | null) {
  if (!value) return "No GPS update";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DispatchOptimizationMap({
  poolStops,
  totalPoolStops,
  unmappedPoolStops,
  routes,
  drivers,
}: DispatchOptimizationMapProps) {
  const routePositions = useMemo(
    () => routes.flatMap((route) => route.stops.map((stop) => [stop.latitude, stop.longitude] as [number, number])),
    [routes],
  );
  const driverPositions = useMemo(
    () => drivers.flatMap((driver) =>
      driver.latitude !== null && driver.longitude !== null
        ? [[driver.latitude, driver.longitude] as [number, number]]
        : [],
    ),
    [drivers],
  );
  const poolPositions = useMemo(
    () => poolStops.map((stop) => [stop.latitude, stop.longitude] as [number, number]),
    [poolStops],
  );
  const allPositions = useMemo(
    () => [...routePositions, ...driverPositions, ...poolPositions],
    [driverPositions, poolPositions, routePositions],
  );
  const center: [number, number] = allPositions[0] ?? [25.2048, 55.2708];
  const routedStops = routes.reduce((sum, route) => sum + route.totalStops, 0);
  const mappedRoutedStops = routes.reduce((sum, route) => sum + route.stops.length, 0);
  const onlineDrivers = drivers.filter((driver) => driver.isOnline).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-[#d7e4dd] bg-white shadow-[0_10px_32px_rgba(24,51,39,0.055)]">
      <div className="grid gap-3 border-b border-[#e4ebe7] bg-[#f8fbf9] p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[#dfe8e3] bg-white px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Ready & unassigned</p>
          <p className="mt-1 text-2xl font-black text-[#26372f]">{totalPoolStops.toLocaleString("en-US")}</p>
          <p className="mt-1 text-[10px] font-semibold text-[#376eb1]">{poolStops.length.toLocaleString("en-US")} exact map points</p>
        </div>
        <div className="rounded-xl border border-[#dfe8e3] bg-white px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Active route AWBs</p>
          <p className="mt-1 text-2xl font-black text-[#13734b]">{routedStops.toLocaleString("en-US")}</p>
          <p className="mt-1 text-[10px] font-semibold text-[#87938d]">{mappedRoutedStops.toLocaleString("en-US")} mapped</p>
        </div>
        <div className="rounded-xl border border-[#dfe8e3] bg-white px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Active drivers</p>
          <p className="mt-1 text-2xl font-black text-[#26372f]">{drivers.length.toLocaleString("en-US")}</p>
          <p className="mt-1 text-[10px] font-semibold text-[#13734b]">{onlineDrivers} online now</p>
        </div>
        <div className="rounded-xl border border-[#efd8aa] bg-[#fffaf0] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#9a6a20]">Awaiting coordinates</p>
          <p className="mt-1 text-2xl font-black text-[#805918]">{unmappedPoolStops.toLocaleString("en-US")}</p>
          <p className="mt-1 text-[10px] font-semibold text-[#9a7845]">Address mapping remains visible</p>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_350px]">
        <div className="min-h-[620px] bg-[#f4f7f6]">
          {allPositions.length > 0 ? (
            <MapContainer center={center} zoom={11} scrollWheelZoom className="h-[620px] w-full">
              <FitOptimizationBounds positions={allPositions} />
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              {poolStops.map((stop) => (
                <CircleMarker
                  key={`pool-${stop.id}`}
                  center={[stop.latitude, stop.longitude]}
                  radius={5}
                  pathOptions={{ color: "#245f9b", fillColor: "#4f83c4", fillOpacity: 0.72, weight: 1.5 }}
                >
                  <Popup><strong>{stop.trackingNumber}</strong><br />Ready for route<br />{stop.consigneeName}<br />{stop.city || "City not recorded"}</Popup>
                </CircleMarker>
              ))}

              {routes.map((route) => {
                const positions = route.stops.map((stop) => [stop.latitude, stop.longitude] as [number, number]);
                return (
                  <Fragment key={route.id}>
                    {positions.length > 1 ? <Polyline positions={positions} pathOptions={{ color: route.color, weight: 4, opacity: 0.82 }} /> : null}
                    {route.stops.map((stop, index) => (
                      <CircleMarker
                        key={`${route.id}-${stop.id}`}
                        center={[stop.latitude, stop.longitude]}
                        radius={11}
                        pathOptions={{ color: route.color, fillColor: route.color, fillOpacity: 0.94, weight: 2 }}
                      >
                        <Tooltip permanent direction="center" opacity={1} className="bp-route-stop-label">{stop.sequence ?? index + 1}</Tooltip>
                        <Popup><strong>{route.runNumber}</strong><br />Stop {stop.sequence ?? index + 1}<br />{stop.trackingNumber}<br />{route.driverName}</Popup>
                      </CircleMarker>
                    ))}
                  </Fragment>
                );
              })}

              {drivers.flatMap((driver) =>
                driver.latitude !== null && driver.longitude !== null
                  ? [(
                    <CircleMarker
                      key={`driver-${driver.id}`}
                      center={[driver.latitude, driver.longitude]}
                      radius={14}
                      pathOptions={{
                        color: driver.isOnline ? "#0c4d33" : "#727f78",
                        fillColor: driver.isOnline ? "#2ca66e" : "#a8b0ac",
                        fillOpacity: 0.96,
                        weight: 3,
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -10]}>{driver.name}</Tooltip>
                      <Popup><strong>{driver.name}</strong><br />{driver.isOnline ? "Online" : "Offline"}<br />{driver.assignedCount} assigned AWBs<br />Last seen {shortTime(driver.recordedAt)}</Popup>
                    </CircleMarker>
                  )]
                  : [],
              )}
            </MapContainer>
          ) : (
            <div className="grid h-[620px] place-items-center p-8 text-center">
              <div className="max-w-md">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]"><MapPinned className="size-7" /></span>
                <h3 className="mt-4 font-bold text-[#26372f]">No exact map points yet</h3>
                <p className="mt-2 text-sm leading-6 text-[#74827b]">Shipments and drivers are counted on this screen. Exact markers appear as addresses are Google-mapped and drivers share GPS.</p>
              </div>
            </div>
          )}
        </div>

        <aside className="border-t border-[#e0e8e4] bg-white xl:border-l xl:border-t-0">
          <div className="border-b border-[#e8eeeb] px-5 py-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#188459]"><Navigation className="size-4" /> Route overview</p>
            <p className="mt-2 text-xs leading-5 text-[#87938d]">Open a route to review its Google sequence and driving links.</p>
          </div>
          <div className="max-h-[335px] divide-y divide-[#edf1ef] overflow-y-auto">
            {routes.length === 0 ? (
              <p className="p-6 text-sm leading-6 text-[#87938d]">No active routes yet. Select drivers below and run automatic optimization.</p>
            ) : routes.map((route) => (
              <Link key={route.id} href={`/dispatch/${route.id}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#f7faf8] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#2b9466]/15">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: route.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs font-black text-[#26372f]">{route.runNumber}</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-[#526159]">{route.driverName} · {route.totalStops} stops</span>
                  <span className="mt-1 block text-[10px] text-[#87938d]">{route.stops.length} mapped · {route.unmappedStops} awaiting</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-[#13734b]" />
              </Link>
            ))}
          </div>

          <div className="border-y border-[#e8eeeb] px-5 py-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#188459]"><RadioTower className="size-4" /> Driver positions</p>
          </div>
          <div className="max-h-[220px] divide-y divide-[#edf1ef] overflow-y-auto">
            {drivers.length === 0 ? <p className="p-6 text-sm text-[#87938d]">No active drivers.</p> : drivers.map((driver) => (
              <div key={driver.id} className="flex items-center gap-3 px-5 py-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${driver.isOnline ? "bg-[#e7f4ed] text-[#13734b]" : "bg-[#f0f3f1] text-[#7d8983]"}`}><Truck className="size-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#34453c]">{driver.name}</p><p className="mt-0.5 text-[10px] text-[#87938d]">{driver.assignedCount} AWBs · {driver.latitude === null ? "GPS not started" : shortTime(driver.recordedAt)}</p></div>
                <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${driver.isOnline ? "bg-[#e8f7ef] text-[#13734b]" : "bg-[#f1f3f2] text-[#7b8580]"}`}>{driver.isOnline ? "Online" : "Offline"}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
