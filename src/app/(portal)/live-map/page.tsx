import { MapPinned, RadioTower } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { LiveOperationsMap } from "@/components/live-operations-map";

export const metadata = {
  title: "Live Operations Map",
};

export default async function LiveMapPage() {
  const profile = await requireProfile(internalRoles);

  if (!profile.organization_id) {
    return (
      <div className="rounded-2xl border border-[#efc7c7] bg-[#fff1f1] p-8 text-sm font-semibold text-[#a13f3f]">
        Organization could not be identified.
      </div>
    );
  }

  const supabase = await createClient();
  const db = supabase as any;

  const [{ data: locationData }, { data: shipmentData }] =
    await Promise.all([
      db
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
        .eq("organization_id", profile.organization_id),

      db
        .from("shipments")
        .select(`
          id,
          tracking_number,
          consignee_name,
          consignee_city,
          cod_amount,
          status,
          assigned_driver_id,
          delivery_latitude,
          delivery_longitude
        `)
        .eq("organization_id", profile.organization_id)
        .eq("status", "out_for_delivery")
        .is("deleted_at", null)
        .not("delivery_latitude", "is", null)
        .not("delivery_longitude", "is", null),
    ]);

  const shipments = (shipmentData ?? []).map((row: any) => ({
    ...row,
    delivery_latitude: Number(row.delivery_latitude),
    delivery_longitude: Number(row.delivery_longitude),
    cod_amount: Number(row.cod_amount || 0),
  }));

  const drivers = (locationData ?? []).map((row: any) => ({
    driver_id: row.driver_id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    speed_mps:
      row.speed_mps === null ? null : Number(row.speed_mps),
    heading_deg:
      row.heading_deg === null ? null : Number(row.heading_deg),
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
    assigned_count: shipments.filter(
      (shipment: any) =>
        shipment.assigned_driver_id === row.driver_id,
    ).length,
  }));

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[#188459]">
            <RadioTower className="size-4" />
            Realtime operations
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            Live Operations Map
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Track drivers and out-for-delivery shipments in realtime.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-xs font-bold text-[#13734b]">
          <MapPinned className="size-4" />
          Driver GPS + Delivery Stops
        </div>
      </div>

      <LiveOperationsMap
        initialDrivers={drivers}
        shipments={shipments}
        organizationId={profile.organization_id}
      />
    </div>
  );
}
