import { Boxes, PackagePlus } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createFulfillmentProductAction, receiveFulfillmentStockAction } from "./actions";

export const metadata = { title: "Fulfillment Inventory" };
const roles = ["super_admin", "operations_admin", "warehouse_staff"] as const;
const field = "bp-input w-full";

export default async function FulfillmentInventoryPage() {
  const profile = await requireProfile(roles);
  const supabase = await createClient();
  const { data } = await supabase.from("fulfillment_products").select("id,sku,name,location,quantity_on_hand,quantity_reserved").eq("organization_id", profile.organization_id!).eq("active", true).order("name").limit(1000);
  const products = data ?? [];
  const available = products.reduce((sum, p) => sum + p.quantity_on_hand - p.quantity_reserved, 0);
  return <div className="mx-auto max-w-[1500px] space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--portal-blue)]">Fulfillment</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[#17231e]">Inventory</h1><p className="mt-2 text-sm text-[#65736c]">Manage stored products and available stock for shipper fulfillment orders.</p></header>
    <div className="grid gap-3 sm:grid-cols-3"><article className="bp-panel p-5"><p className="text-xs font-semibold text-[#78858f]">Active products</p><p className="mt-1 text-2xl font-black">{products.length}</p></article><article className="bp-panel p-5"><p className="text-xs font-semibold text-[#78858f]">Available units</p><p className="mt-1 text-2xl font-black text-[#174ea6]">{available.toLocaleString()}</p></article><article className="bp-panel p-5"><p className="text-xs font-semibold text-[#78858f]">Reserved units</p><p className="mt-1 text-2xl font-black">{products.reduce((sum,p)=>sum+p.quantity_reserved,0).toLocaleString()}</p></article></div>
    <section className="grid gap-5 lg:grid-cols-2">
      <article className="bp-panel p-5"><h2 className="flex items-center gap-2 font-black"><PackagePlus className="size-5 text-[#174ea6]"/> Add product</h2><form action={createFulfillmentProductAction} className="mt-4 grid gap-3 sm:grid-cols-2"><input className={field} name="sku" placeholder="SKU / product code" required maxLength={80}/><input className={field} name="name" placeholder="Product name" required maxLength={180}/><input className={`${field} sm:col-span-2`} name="location" placeholder="Storage location (e.g. A-01)" maxLength={80}/><button className="bp-button-primary sm:col-span-2">Add product</button></form></article>
      <article className="bp-panel p-5"><h2 className="flex items-center gap-2 font-black"><Boxes className="size-5 text-[#174ea6]"/> Receive stock</h2><form action={receiveFulfillmentStockAction} className="mt-4 grid gap-3 sm:grid-cols-2"><select name="product_id" className={field} required defaultValue=""><option value="" disabled>Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select><input className={field} name="quantity" type="number" min="1" max="100000" placeholder="Quantity received" required/><input className={`${field} sm:col-span-2`} name="note" placeholder="Supplier / receiving note (optional)" maxLength={240}/><button className="bp-button-primary sm:col-span-2">Receive stock</button></form></article>
    </section>
    <section className="bp-panel overflow-hidden"><div className="bp-panel-header"><h2 className="font-black">Storage inventory</h2><p className="mt-1 text-xs text-[#78858f]">Shippers can see available units when selecting products.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#f8fafc] text-[10px] uppercase tracking-wide text-[#78858f]"><tr>{["SKU","Product","Location","On hand","Reserved","Available"].map(x=><th key={x} className="px-5 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1ef]">{products.map(p=><tr key={p.id}><td className="px-5 py-4 font-mono text-xs font-bold">{p.sku}</td><td className="px-5 py-4 font-semibold">{p.name}</td><td className="px-5 py-4">{p.location}</td><td className="px-5 py-4">{p.quantity_on_hand}</td><td className="px-5 py-4">{p.quantity_reserved}</td><td className="px-5 py-4 font-black text-[#174ea6]">{p.quantity_on_hand-p.quantity_reserved}</td></tr>)}{!products.length?<tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-[#78858f]">No products yet. Add a product to begin managing stock.</td></tr>:null}</tbody></table></div></section>
  </div>;
}
