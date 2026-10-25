import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FulfillmentProductTabs } from "@/components/fulfillment-workflow-tabs";
export const metadata = { title: "Fulfillment Products" };
export default async function FulfillmentProductsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams; const profile = await requireProfile(["super_admin", "operations_admin", "warehouse_staff"]);
  const db = await createClient();
  const {data: shippers, error} = await db.from("profiles").select("id,full_name,email").eq("organization_id",profile.organization_id!).eq("role","shipper").eq("status","active").order("full_name").limit(500);
  if(error) throw new Error("Active shippers could not be loaded.");
  const options=(shippers??[]).map(shipper=>({id:shipper.id,label:shipper.full_name||shipper.email||"Shipper"}));
  return <div className="mx-auto max-w-5xl space-y-5"><header><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--portal-blue)]">Fulfillment / Inventory</p><h1 className="mt-1 text-3xl font-black text-[#17231e]">Products</h1><p className="mt-2 text-sm text-[#65736c]">Add a product for a selected shipper and save its rate, or upload a spreadsheet with per-product rates.</p></header><FulfillmentProductTabs defaultTab={params.tab} shippers={options}/></div>;
}
