"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
} from "react-leaflet";
import { createClient } from "@/lib/supabase/client";

type DriverLocation = {
  driver_id: string;
  latitude: number;
  longitude: number;
  speed_mps: number | null;
  heading_deg: number | null;
  accuracy_m: number | null;
  is_online: boolean;
  recorded_at: string;
  driver_name: string;
  assigned_count: number;
};

type ShipmentMarker = {
  id: number;
  tracking_number: string;
  consignee_name: string;
  consignee_city: string | null;
  cod_amount: number;
  status: string;
  assigned_driver_id: string | null;
  delivery_latitude: number;
  delivery_longitude: number;
};

type Props = {
  initialDrivers: DriverLocation[];
  shipments: ShipmentMarker[];
  organizationId: string;
};

function dubaiTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function LiveOperationsMap({
  initialDrivers,
  shipments,
  organizationId,
}: Props) {
  const [drivers, setDrivers] =
    useState<DriverLocation[]>(initialDrivers);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel(`driver-locations-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_locations",
          filter: `organization_id=eq.${organizationId}`,
        },
        async () => {
          const { data } = await (supabase as any)
            .from("driver_locations")
            .select(`
              driver_id,
              latitude,
              longitude,
              speed_mps,
              heading_deg,
              accuracy_m,
              is_online,
              recorded_at,
              driver:profiles!driver_locations_driver_id_fkey(
                full_name,
                email
              )
            `)
            .eq("organization_id", organizationId);

          if (!data) return;

          setDrivers(
            data.map((row: any) => ({
              driver_id: row.driver_id,
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
              speed_mps:
                row.speed_mps === null
                  ? null
                  : Number(row.speed_mps),
              heading_deg:
                row.heading_deg === null
                  ? null
                  : Number(row.heading_deg),
              accuracy_m:
                row.accuracy_m === null
                  ? null
                  : Number(row.accuracy_m),
              is_online: Boolean(row.is_online),
              recorded_at: row.recorded_at,
              driver_name:
                row.driver?.full_name ||
                row.driver?.email ||
                "Driver",
              assigned_count:
                shipments.filter(
                  (shipment) =>
                    shipment.assigned_driver_id === row.driver_id,
                ).length,
            })),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, shipments, supabase]);

  const center: [number, number] =
    drivers.length > 0
      ? [drivers[0].latitude, drivers[0].longitude]
      : shipments.length > 0
        ? [
            shipments[0].delivery_latitude,
            shipments[0].delivery_longitude,
          ]
        : [25.2048, 55.2708];

  const onlineDrivers = drivers.filter(
    (driver) => driver.is_online,
  ).length;

  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#e0e8e4] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Drivers tracked
          </p>
          <p className="mt-2 text-2xl font-black text-[#26372f]">
            {drivers.length}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e0e8e4] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Drivers online
          </p>
          <p className="mt-2 text-2xl font-black text-[#13734b]">
            {onlineDrivers}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e0e8e4] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Delivery stops
          </p>
          <p className="mt-2 text-2xl font-black text-[#26372f]">
            {shipments.length}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e0e8e4] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Map status
          </p>
          <p className="mt-2 text-sm font-black text-[#13734b]">
            Realtime connected
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
        <div className="overflow-hidden rounded-2xl border border-[#dfe7e3] bg-white">
          <MapContainer
            center={center}
            zoom={11}
            scrollWheelZoom
            className="h-[650px] w-full"
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {drivers.map((driver) => (
              <CircleMarker
                key={driver.driver_id}
                center={[
                  driver.latitude,
                  driver.longitude,
                ]}
                radius={10}
                pathOptions={{
                  color: driver.is_online
                    ? "#13734b"
                    : "#7d8983",
                  fillColor: driver.is_online
                    ? "#2ca66e"
                    : "#aab2ae",
                  fillOpacity: 0.9,
                }}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <strong>{driver.driver_name}</strong>
                    <br />
                    {driver.is_online
                      ? "Online"
                      : "Offline"}
                    <br />
                    Assigned AWBs: {driver.assigned_count}
                    <br />
                    Speed:{" "}
                    {driver.speed_mps === null
                      ? "—"
                      : `${(driver.speed_mps * 3.6).toFixed(0)} km/h`}
                    <br />
                    Last seen:{" "}
                    {dubaiTime(driver.recorded_at)}
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {shipments.map((shipment) => (
              <CircleMarker
                key={shipment.id}
                center={[
                  shipment.delivery_latitude,
                  shipment.delivery_longitude,
                ]}
                radius={6}
                pathOptions={{
                  color: "#376eb1",
                  fillColor: "#4f83c4",
                  fillOpacity: 0.85,
                }}
              >
                <Popup>
                  <div className="min-w-[210px]">
                    <strong>
                      {shipment.tracking_number}
                    </strong>
                    <br />
                    {shipment.consignee_name}
                    <br />
                    {shipment.consignee_city || "—"}
                    <br />
                    COD AED{" "}
                    {Number(
                      shipment.cod_amount || 0,
                    ).toFixed(2)}
                    <br />
                    {shipment.status.replaceAll("_", " ")}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <aside className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
          <div className="border-b border-[#e8eeeb] px-5 py-4">
            <h2 className="font-bold text-[#26372f]">
              Driver status
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Latest GPS positions from active drivers.
            </p>
          </div>

          {drivers.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#87938d]">
              No driver has started live tracking yet.
            </p>
          ) : (
            <div className="max-h-[650px] divide-y divide-[#edf1ef] overflow-y-auto">
              {drivers.map((driver) => (
                <div
                  key={driver.driver_id}
                  className="p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-[#34453c]">
                      {driver.driver_name}
                    </p>

                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                        driver.is_online
                          ? "bg-[#e8f7ef] text-[#13734b]"
                          : "bg-[#f1f3f2] text-[#7b8580]"
                      }`}
                    >
                      {driver.is_online
                        ? "Online"
                        : "Offline"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-[#7f8c85]">
                    {driver.assigned_count} assigned AWBs
                  </p>

                  <p className="mt-1 text-[11px] text-[#9aa39f]">
                    Last seen{" "}
                    {dubaiTime(driver.recorded_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
