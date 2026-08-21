"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  driverId: string;
  organizationId: string;
};

export function DriverLocationTracker({ driverId, organizationId }: Props) {
  const watchId = useRef<number | null>(null);
  const lastSent = useRef<number>(0);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    if (!navigator.geolocation) return;

    async function saveLocation(position: GeolocationPosition, force = false) {
      const now = Date.now();
      if (!force && now - lastSent.current < 15000) return;
      lastSent.current = now;

      const coords = position.coords;
      await (supabaseRef.current as any)
        .from("driver_locations")
        .upsert(
          {
            driver_id: driverId,
            organization_id: organizationId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy_m: coords.accuracy,
            speed_mps: coords.speed === null ? null : Math.max(0, coords.speed),
            heading_deg: coords.heading === null ? null : coords.heading,
            is_online: true,
            recorded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "driver_id" },
        );
    }

    function start() {
      if (watchId.current !== null) return;

      // Browser security still requires the driver's one-time location permission.
      watchId.current = navigator.geolocation.watchPosition(
        (position) => void saveLocation(position),
        () => {
          // Keep tracking silent in the driver UI. If permission is denied the
          // browser itself exposes that state; the app will retry on next login/load.
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 30000,
        },
      );
    }

    start();

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [driverId, organizationId]);

  return null;
}
