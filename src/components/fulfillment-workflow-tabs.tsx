"use client";

import { useState } from "react";
import { FulfillmentBulkUploadForm } from "@/components/fulfillment-bulk-upload-form";
import { createFulfillmentProductAction, receiveFulfillmentStockAction } from "@/app/(portal)/fulfillment/actions";

type Product = { id: string; sku: string; name: string; quantity_on_hand: number; quantity_reserved: number };
const field = "bp-input w-full";
function Tabs({ names, active, onChange }: { names: string[]; active: string; onChange: (value: string) => void }) {
  return <div className="flex flex-wrap gap-2 border-b border-[#e8edf3] pb-3">{names.map(name => <button type="button" key={name} onClick={() => onChange(name)} className={`rounded-lg px-4 py-2 text-sm font-bold ${active === name ? "bg-[#174ea6] text-white" : "bg-[#f2f5f9] text-[#526159]"}`}>{name}</button>)}</div>;
}
type ShipperOption = { id: string; label: string };
type GroupOption = { group_code: string; group_name: string; order_charge: number; currency: string };
export function FulfillmentProductTabs({ defaultTab = "Add Product", shippers = [], groups = [] }: { defaultTab?: string; shippers?: ShipperOption[]; groups?: GroupOption[] }) {
  const [tab, setTab] = useState(defaultTab === "bulk" ? "Bulk Upload" : "Add Product");
  const shipperPicker = <select name="shipper_id" className={field} defaultValue="" required><option value="" disabled>Select shipper</option>{shippers.map(shipper=><option key={shipper.id} value={shipper.id}>{shipper.label}</option>)}</select>;
  const groupPicker = <select name="fulfillment_group" className={field} required defaultValue="GENERAL"><option value="" disabled>Select product group</option>{groups.map(group=><option key={group.group_code} value={group.group_code}>{group.group_name} · {group.currency} {Number(group.order_charge).toFixed(2)} / order</option>)}</select>;
  const currencyPicker = <input className={field} name="currency" placeholder="Currency (e.g. AED)" defaultValue="AED" required maxLength={3} pattern="[A-Za-z]{3}"/>;
  return <section className="bp-panel space-y-5 p-5"><Tabs names={["Add Product", "Bulk Upload"]} active={tab} onChange={setTab}/>{tab === "Add Product" ? <form action={createFulfillmentProductAction} className="grid gap-3 sm:grid-cols-2">{shipperPicker}{groupPicker}<input className={field} name="sku" placeholder="SKU / product code" required maxLength={80}/><input className={field} name="name" placeholder="Product name" required maxLength={180}/><input className={field} name="unit_cost" type="number" min="0" step="0.01" placeholder="Product rate for this shipper" required/><div className="flex gap-2">{currencyPicker}<span className="grid min-w-16 place-items-center rounded-xl bg-[#f2f5f9] px-3 text-xs font-bold text-[#526159]">per unit</span></div><input className={`${field} sm:col-span-2`} name="location" placeholder="Storage location (e.g. A-01)" maxLength={80}/><button className="bp-button-primary sm:col-span-2">Add product and shipper rate</button></form> : <FulfillmentBulkUploadForm kind="products" shippers={shippers} groups={groups}/>}</section>;
}
export function FulfillmentStockTabs({ products, defaultTab = "Receive Stock" }: { products: Product[]; defaultTab?: string }) {
  const [tab, setTab] = useState(defaultTab === "bulk" ? "Bulk Upload" : "Receive Stock");
  return <section className="bp-panel space-y-5 p-5"><Tabs names={["Receive Stock", "Bulk Upload"]} active={tab} onChange={setTab}/>{tab === "Receive Stock" ? <form action={receiveFulfillmentStockAction} className="grid gap-3 sm:grid-cols-2"><select name="product_id" className={field} required defaultValue=""><option value="" disabled>Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select><input className={field} name="quantity" type="number" min="1" max="100000" placeholder="Quantity received" required/><input className={`${field} sm:col-span-2`} name="note" placeholder="Supplier / receiving note (optional)" maxLength={240}/><button className="bp-button-primary sm:col-span-2">Receive stock</button></form> : <FulfillmentBulkUploadForm kind="stock"/>}</section>;
}
