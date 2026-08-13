import { Store } from "lucide-react";
import { EmptyModule } from "@/components/empty-module";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Shippers" };

export default async function ShippersPage() {
  await requireProfile(["super_admin", "operations_admin", "finance_staff", "customer_service"]);
  return <EmptyModule icon={Store} eyebrow="Customer accounts" title="Shippers & rate cards" description="Each shipper will have a service area, COD cycle and delivery, return, remote-area and weight rates used automatically in invoicing." action="Create shipper — next module" />;
}
