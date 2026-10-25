import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ShipperOrderForm } from "./order-forms";
import { FulfillmentInventoryTable } from "@/components/fulfillment-inventory-table";
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
  <section className="grid gap-5 xl:grid-cols-[1fr_420px]"><FulfillmentInventoryTable products={products??[]}/>
   <article className="bp-panel p-5"><h2 className="font-black">Place an order</h2><p className="mb-4 mt-1 text-xs text-[#78858f]">Selecting a product reserves the requested stock and sends the order to the fulfillment team.</p><ShipperOrderForm products={products??[]}/></article></section>
 </div>;
}
