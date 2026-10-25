import { requireProfile } from "@/lib/auth";
import { FulfillmentProductTabs } from "@/components/fulfillment-workflow-tabs";
export const metadata = { title: "Fulfillment Products" };
export default async function FulfillmentProductsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams; await requireProfile(["super_admin", "operations_admin", "warehouse_staff"]);
  return <div className="mx-auto max-w-5xl space-y-5"><header><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--portal-blue)]">Fulfillment / Inventory</p><h1 className="mt-1 text-3xl font-black text-[#17231e]">Products</h1><p className="mt-2 text-sm text-[#65736c]">Add one product or upload a spreadsheet from the same workspace.</p></header><FulfillmentProductTabs defaultTab={params.tab}/></div>;
}
