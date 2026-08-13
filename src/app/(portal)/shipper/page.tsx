import { PackagePlus } from "lucide-react";
import { EmptyModule } from "@/components/empty-module";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Shipper Portal" };

export default async function ShipperPage() {
  await requireProfile(["shipper"]);
  return <EmptyModule icon={PackagePlus} eyebrow="Shipper portal" title="Book and control shipments" description="Order booking, bulk upload, AWB printing, tracking, returns, COD statements and invoices will be available here." action="New shipment — next module" />;
}
