"use client";

import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { ExternalLink, MapPinned, Navigation } from "lucide-react";

export type DispatchRouteMapStop = {
  id: number;
  sequence: number;
  trackingNumber: string;
  consigneeName: string;
  city: string | null;
  latitude: number;
  longitude: number;
  completed: boolean;
};

export type DispatchRouteMapLink = {
  label: string;
  url: string;
};

export type DispatchRouteMapProps = {
  runNumber: string;
  stops: DispatchRouteMapStop[];
  totalStops: number;
  googleMapsLinks: DispatchRouteMapLink[];
};

function FitRouteBounds({
  positions,
}: {
  positions: Array<[number, number]>;
}) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 1) {
      map.setView(positions[0], 13);
      return;
    }

    if (positions.length > 1) {
      map.fitBounds(positions, {
        padding: [36, 36],
        maxZoom: 14,
      });
    }
  }, [map, positions]);

  return null;
}

export function DispatchRouteMap({
  runNumber,
  stops,
  totalStops,
  googleMapsLinks,
}: DispatchRouteMapProps) {
  const positions = useMemo<Array<[number, number]>>(
    () => stops.map((stop) => [stop.latitude, stop.longitude]),
    [stops],
  );
  const unmappedStops = totalStops - stops.length;
  const center: [number, number] =
    positions[0] ?? [25.2048, 55.2708];

  return (
    <div>
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="overflow-hidden rounded-xl border border-[#dce6e1] bg-[#f6f9f7]">
          {stops.length > 0 ? (
            <MapContainer
              center={center}
              zoom={11}
              scrollWheelZoom
              className="h-[460px] w-full"
            >
              <FitRouteBounds positions={positions} />
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {positions.length > 1 ? (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: "#13734b",
                    weight: 4,
                    opacity: 0.82,
                  }}
                />
              ) : null}
              {stops.map((stop) => (
                <CircleMarker
                  key={stop.id}
                  center={[stop.latitude, stop.longitude]}
                  radius={13}
                  pathOptions={{
                    color: stop.completed ? "#166b47" : "#245f9b",
                    fillColor: stop.completed ? "#2ca66e" : "#4f83c4",
                    fillOpacity: 0.95,
                    weight: 2,
                  }}
                >
                  <Tooltip
                    permanent
                    direction="center"
                    opacity={1}
                    className="bp-route-stop-label"
                  >
                    {stop.sequence}
                  </Tooltip>
                  <Popup>
                    <div className="min-w-[210px]">
                      <strong>Stop {stop.sequence}</strong>
                      <br />
                      {stop.trackingNumber}
                      <br />
                      {stop.consigneeName}
                      <br />
                      {stop.city || "City not recorded"}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          ) : (
            <div className="grid h-[460px] place-items-center p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]">
                  <MapPinned className="size-6" />
                </span>
                <h3 className="mt-4 font-bold text-[#26372f]">
                  Stop coordinates are not available yet
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#74827b]">
                  Use “Map & optimize stops” to geocode the route before
                  reviewing it on the map.
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="overflow-hidden rounded-xl border border-[#e0e8e4] bg-white">
          <div className="border-b border-[#e8eeeb] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#188459]">
              Route sequence
            </p>
            <h3 className="mt-1 font-bold text-[#26372f]">
              {runNumber}
            </h3>
            <p className="mt-1 text-xs text-[#87938d]">
              {stops.length} mapped · {unmappedStops} awaiting coordinates
            </p>
          </div>
          {stops.length > 0 ? (
            <div className="max-h-[360px] divide-y divide-[#edf1ef] overflow-y-auto">
              {stops.map((stop) => (
                <div key={stop.id} className="flex gap-3 px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e8f0fb] text-xs font-black text-[#376eb1]">
                    {stop.sequence}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-black text-[#13734b]">
                      {stop.trackingNumber}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-[#405048]">
                      {stop.consigneeName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#87938d]">
                      {stop.city || "City not recorded"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm leading-6 text-[#87938d]">
              {totalStops} route stops are assigned, but none has usable
              coordinates yet.
            </p>
          )}
          {googleMapsLinks.length > 0 ? (
            <div className="border-t border-[#e8eeeb] p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold text-[#405048]">
                <Navigation className="size-4 text-[#188459]" />
                Open driving route
              </p>
              <div className="flex flex-wrap gap-2">
                {googleMapsLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cfe0d7] bg-[#f3faf6] px-3 text-xs font-bold text-[#13734b] transition hover:border-[#8ebea5] hover:bg-[#e8f5ee] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2b9466]/15"
                  >
                    {link.label}
                    <ExternalLink className="size-3.5" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
