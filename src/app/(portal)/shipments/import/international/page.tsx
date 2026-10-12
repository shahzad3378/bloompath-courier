import { InternationalShipmentUpload } from "@/components/international-shipment-upload";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "International Shipment Upload" };

export default async function InternationalShipmentUploadPage() {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  if (profile.role === "shipper") {
    return <InternationalShipmentUpload shippers={[]} requiresShipperSelection={false} />;
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
    <InternationalShipmentUpload
      shippers={(data ?? []).map((shipper) => ({
        id: shipper.id,
        full_name: shipper.full_name || shipper.email,
        email: shipper.email,
      }))}
      requiresShipperSelection
    />
  );
}
