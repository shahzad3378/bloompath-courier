"use client";

import { useState } from "react";
import { FulfillmentBulkUploadForm } from "@/components/fulfillment-bulk-upload-form";
import { createFulfillmentProductAction, receiveFulfillmentStockAction } from "@/app/(portal)/fulfillment/actions";

type Product = { id: string; sku: string; name: string; quantity_on_hand: number; quantity_reserved: number };
const field = "bp-input w-full";
function Tabs({ names, active, onChange }: { names: string[]; active: string; onChange: (value: string) => void }) {
  return <div className="flex flex-wrap gap-2 border-b border-[#e8edf3] pb-3">{names.map(name => <button type="button" key={name} onClick={() => onChange(name)} className={`rounded-lg px-4 py-2 text-sm font-bold ${active === name ? "bg-[#174ea6] text-white" : "bg-[#f2f5f9] text-[#526159]"}`}>{name}</button>)}</div>;
}
export function FulfillmentProductTabs({ defaultTab = "Add Product" }: { defaultTab?: string }) {
  const [tab, setTab] = useState(defaultTab === "bulk" ? "Bulk Upload" : "Add Product");
  return <section className="bp-panel space-y-5 p-5"><Tabs names={["Add Product", "Bulk Upload"]} active={tab} onChange={setTab}/>{tab === "Add Product" ? <form action={createFulfillmentProductAction} className="grid gap-3 sm:grid-cols-2"><input className={field} name="sku" placeholder="SKU / product code" required maxLength={80}/><input className={field} name="name" placeholder="Product name" required maxLength={180}/><input className={`${field} sm:col-span-2`} name="location" placeholder="Storage location (e.g. A-01)" maxLength={80}/><button className="bp-button-primary sm:col-span-2">Add product</button></form> : <FulfillmentBulkUploadForm kind="products"/>}</section>;
}
export function FulfillmentStockTabs({ products, defaultTab = "Receive Stock" }: { products: Product[]; defaultTab?: string }) {
  const [tab, setTab] = useState(defaultTab === "bulk" ? "Bulk Upload" : "Receive Stock");
  return <section className="bp-panel space-y-5 p-5"><Tabs names={["Receive Stock", "Bulk Upload"]} active={tab} onChange={setTab}/>{tab === "Receive Stock" ? <form action={receiveFulfillmentStockAction} className="grid gap-3 sm:grid-cols-2"><select name="product_id" className={field} required defaultValue=""><option value="" disabled>Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select><input className={field} name="quantity" type="number" min="1" max="100000" placeholder="Quantity received" required/><input className={`${field} sm:col-span-2`} name="note" placeholder="Supplier / receiving note (optional)" maxLength={240}/><button className="bp-button-primary sm:col-span-2">Receive stock</button></form> : <FulfillmentBulkUploadForm kind="stock"/>}</section>;
}
