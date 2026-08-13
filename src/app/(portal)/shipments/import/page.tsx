import { BulkShipmentUpload } from "@/components/bulk-shipment-upload";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";

export const metadata = { title: "Bulk Shipment Upload" };

export default async function BulkShipmentUploadPage() {
  await requireProfile([...internalRoles, "shipper"]);
  return <BulkShipmentUpload />;
}
