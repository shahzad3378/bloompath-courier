import { ShipmentForm } from "@/components/shipment-form";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";

export const metadata = { title: "Create Shipment" };

export default async function NewShipmentPage() {
  await requireProfile([...internalRoles, "shipper"]);
  return <ShipmentForm />;
}
