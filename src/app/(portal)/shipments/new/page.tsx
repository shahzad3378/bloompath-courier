import { ShipmentForm } from "@/components/shipment-form";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Create Shipment" };

export default async function NewShipmentPage() {
  const profile = await requireProfile([...internalRoles, "shipper"]);

  if (profile.role === "shipper") {
    return (
      <ShipmentForm
        shippers={[]}
        requiresShipperSelection={false}
      />
    );
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("organization_id", profile.organization_id)
    .eq("role", "shipper")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  return (
    <ShipmentForm
      shippers={(data ?? []).map((shipper) => ({
        id: shipper.id,
        full_name: shipper.full_name || shipper.email,
        email: shipper.email,
      }))}
      requiresShipperSelection
    />
  );
}
