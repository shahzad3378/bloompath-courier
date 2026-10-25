import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FulfillmentProductTabs } from "@/components/fulfillment-workflow-tabs";
export const metadata = { title: "Fulfillment Products" };
export default async function FulfillmentProductsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams; const profile = await requireProfile(["super_admin", "operations_admin", "warehouse_staff"]);
  const db = await createClient();
  const [{data: shippers, error}, {data: groups, error: groupError}] = await Promise.all([
    db.from("profiles").select("id,full_name,email").eq("organization_id",profile.organization_id!).eq("role","shipper").eq("status","active").order("full_name").limit(500),
    db.from("fulfillment_group_charges").select("group_code,group_name,order_charge,currency").eq("organization_id",profile.organization_id!).order("group_name"),
  ]);
  if(error) throw new Error("Active shippers could not be loaded.");
  if(groupError) throw new Error("Fulfillment groups could not be loaded.");
  const options=(shippers??[]).map(shipper=>({id:shipper.id,label:shipper.full_name||shipper.email||"Shipper"}));
  return <div className="mx-auto max-w-5xl space-y-5"><header><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--portal-blue)]">Fulfillment / Inventory</p><h1 className="mt-1 text-3xl font-black text-[#17231e]">Products</h1><p className="mt-2 text-sm text-[#65736c]">Choose a shipper and product group. The group charge is applied once per order.</p></header><FulfillmentProductTabs defaultTab={params.tab} shippers={options} groups={groups??[]}/></div>;
}
