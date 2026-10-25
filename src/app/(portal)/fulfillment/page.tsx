import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FulfillmentInventoryTable } from "@/components/fulfillment-inventory-table";

export const metadata = { title: "Fulfillment Inventory" };
const roles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

export default async function FulfillmentInventoryPage() {
  const profile = await requireProfile(roles);
  const supabase = await createClient();
  const { data } = await supabase.from("fulfillment_products").select("id,sku,name,location,quantity_on_hand,quantity_reserved").eq("organization_id", profile.organization_id!).eq("active", true).order("name").limit(1000);
  const products = data ?? [];
  const available = products.reduce((sum, p) => sum + p.quantity_on_hand - p.quantity_reserved, 0);
  return <div className="mx-auto max-w-[1500px] space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--portal-blue)]">Fulfillment</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[#17231e]">Inventory</h1><p className="mt-2 text-sm text-[#65736c]">Manage stored products and available stock for shipper fulfillment orders.</p></header>
    <div className="grid gap-3 sm:grid-cols-3"><article className="bp-panel p-5"><p className="text-xs font-semibold text-[#78858f]">Active products</p><p className="mt-1 text-2xl font-black">{products.length}</p></article><article className="bp-panel p-5"><p className="text-xs font-semibold text-[#78858f]">Available units</p><p className="mt-1 text-2xl font-black text-[#174ea6]">{available.toLocaleString()}</p></article><article className="bp-panel p-5"><p className="text-xs font-semibold text-[#78858f]">Reserved units</p><p className="mt-1 text-2xl font-black">{products.reduce((sum,p)=>sum+p.quantity_reserved,0).toLocaleString()}</p></article></div>
    <FulfillmentInventoryTable products={products}/>
  </div>;
}
