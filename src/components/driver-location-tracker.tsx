"use client";

import { useEffect, useRef, useState } from "react";
import {
  LocateFixed,
  MapPin,
  Radio,
  RadioTower,
  Square,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  driverId: string;
  organizationId: string;
};

export function DriverLocationTracker({
  driverId,
  organizationId,
}: Props) {
  const [tracking, setTracking] = useState(false);
  const [status, setStatus] = useState("Tracking is off");
  const [lastUpdated, setLastUpdated] = useState<string | null>(
    null,
  );

  const watchId = useRef<number | null>(null);
  const lastSent = useRef<number>(0);
  const supabaseRef = useRef(createClient());

  async function saveLocation(
    position: GeolocationPosition,
    force = false,
  ) {
    const now = Date.now();

    if (!force && now - lastSent.current < 15000) {
      return;
    }

    lastSent.current = now;

    const coords = position.coords;

    const { error } = await (supabaseRef.current as any)
      .from("driver_locations")
      .upsert(
        {
          driver_id: driverId,
          organization_id: organizationId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy_m: coords.accuracy,
          speed_mps:
            coords.speed === null
              ? null
              : Math.max(0, coords.speed),
          heading_deg:
            coords.heading === null ? null : coords.heading,
          is_online: true,
          recorded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "driver_id",
        },
      );

    if (error) {
      setStatus("Location could not be updated");
      return;
    }

    setStatus("Live location sharing");
    setLastUpdated(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date()),
    );
  }

  async function markOffline() {
    await (supabaseRef.current as any)
      .from("driver_locations")
      .update({
        is_online: false,
        updated_at: new Date().toISOString(),
      })
      .eq("driver_id", driverId);
  }

  function startTracking() {
    if (!navigator.geolocation) {
      setStatus("GPS is not supported on this device");
      return;
    }

    setStatus("Requesting GPS permission...");

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setTracking(true);
        void saveLocation(position);
      },
      (error) => {
        setTracking(false);

        if (error.code === error.PERMISSION_DENIED) {
          setStatus("Location permission denied");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setStatus("GPS position unavailable");
        } else {
          setStatus("GPS could not lock your position. Check Location Services and try again.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 30000,
      },
    );
  }

  async function stopTracking() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    setTracking(false);
    setStatus("Tracking stopped");
    await markOffline();
  }

  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  return (
    <div className="rounded-2xl border border-[#cfe3d8] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={`grid size-11 place-items-center rounded-xl ${
              tracking
                ? "bg-[#e7f6ee] text-[#13734b]"
                : "bg-[#f1f4f2] text-[#738079]"
            }`}
          >
            {tracking ? (
              <RadioTower className="size-5" />
            ) : (
              <MapPin className="size-5" />
            )}
          </span>

          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-[#26372f]">
                Live GPS Tracking
              </p>

              {tracking ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f7ef] px-2 py-1 text-[10px] font-black uppercase text-[#13734b]">
                  <Radio className="size-3" />
                  Live
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-xs text-[#7d8983]">
              {status}
              {lastUpdated
                ? ` · Updated ${lastUpdated}`
                : ""}
            </p>
          </div>
        </div>

        {tracking ? (
          <button
            type="button"
            onClick={() => void stopTracking()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#e5caca] bg-white px-4 text-xs font-bold text-[#a74444]"
          >
            <Square className="size-4" />
            Stop Tracking
          </button>
        ) : (
          <button
            type="button"
            onClick={startTracking}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-4 text-xs font-bold text-white"
          >
            <LocateFixed className="size-4" />
            Start Live Tracking
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-5 text-[#8a9690]">
        Keep this page open while you are on route. Your GPS
        position will be sent securely to BloomPath operations.
      </p>
    </div>
  );
}
