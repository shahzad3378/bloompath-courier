import Link from "next/link";
import { Boxes, FileSpreadsheet } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ShipperOrderForm } from "./order-forms";
export const metadata={title:"Fulfillment Stock & Orders"};
export default async function ShipperFulfillmentPage(){
 const profile=await requireProfile(["shipper"]);const db=await createClient();
 const [{data:products},{count:ordersCount}]=await Promise.all([
  db.from("fulfillment_products").select("id,sku,name,location,quantity_on_hand,quantity_reserved").eq("organization_id",profile.organization_id!).eq("active",true).order("name").limit(1000),
  db.from("fulfillment_orders").select("id",{count:"exact",head:true}).eq("shipper_id",profile.id),
 ]);
 const available=(products??[]).filter(p=>p.quantity_on_hand>p.quantity_reserved);
 return <div className="mx-auto max-w-[1400px] space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--portal-blue)]">Shipper fulfillment</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[#17231e]">Stock & Orders</h1><p className="mt-2 text-sm text-[#65736c]">Check stored stock and request fulfillment from your shipper portal.</p></div><Link className="inline-flex items-center gap-2 rounded-xl border border-[#dce4ef] bg-white px-4 py-2.5 text-sm font-bold text-[#174ea6]" href="/shipper/fulfillment/bulk-upload"><FileSpreadsheet className="size-4"/> Bulk upload</Link></header>
  <div className="grid gap-3 sm:grid-cols-3"><article className="bp-panel p-5"><p className="text-xs font-semibold text-[#78858f]">Products in storage</p><p className="mt-1 text-2xl font-black">{(products??[]).length}</p></article><article className="bp-panel p-5"><p className="text-xs font-semibold text-[#78858f]">Available units</p><p className="mt-1 text-2xl font-black text-[#174ea6]">{available.reduce((s,p)=>s+p.quantity_on_hand-p.quantity_reserved,0).toLocaleString()}</p></article><article className="bp-panel p-5"><p className="text-xs font-semibold text-[#78858f]">Your fulfillment orders</p><p className="mt-1 text-2xl font-black">{ordersCount??0}</p></article></div>
  <section className="grid gap-5 xl:grid-cols-[1fr_420px]"><article className="bp-panel overflow-hidden"><div className="bp-panel-header"><h2 className="flex items-center gap-2 font-black"><Boxes className="size-5 text-[#174ea6]"/> Products available</h2><p className="mt-1 text-xs text-[#78858f]">Only products with stock are selectable for new orders.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-[#f8fafc] text-[10px] uppercase tracking-wide text-[#78858f]"><tr>{["Product","Location","Available"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1ef]">{(products??[]).map(p=><tr key={p.id}><td className="px-4 py-4 font-semibold">{p.name}<div className="font-mono text-[10px] text-[#78858f]">SKU {p.sku}</div></td><td className="px-4 py-4">{p.location}</td><td className="px-4 py-4 font-black text-[#174ea6]">{p.quantity_on_hand-p.quantity_reserved}</td></tr>)}{!(products??[]).length?<tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-[#78858f]">No products are available in storage yet.</td></tr>:null}</tbody></table></div></article>
   <article className="bp-panel p-5"><h2 className="font-black">Place an order</h2><p className="mb-4 mt-1 text-xs text-[#78858f]">Selecting a product reserves the requested stock and sends the order to the fulfillment team.</p><ShipperOrderForm products={products??[]}/></article></section>
 </div>;
}
