"use client";

import { useMemo, useState } from "react";

type InventoryProduct = { id: string; sku: string; name: string; location: string; quantity_on_hand: number; quantity_reserved: number };

export function FulfillmentInventoryTable({ products }: { products: InventoryProduct[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const selectedProducts = useMemo(() => products.filter((product) => selected.includes(product.id)), [products, selected]);
  const allSelected = products.length > 0 && selected.length === products.length;

  function downloadCsv() {
    const rows = [["sku", "product_name", "location", "on_hand", "reserved", "available"], ...selectedProducts.map((product) => [product.sku, product.name, product.location, String(product.quantity_on_hand), String(product.quantity_reserved), String(product.quantity_on_hand - product.quantity_reserved)])];
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "fulfillment-inventory.csv"; anchor.click();
    URL.revokeObjectURL(url);
  }

  return <section className="bp-panel overflow-hidden">
    <div className="bp-panel-header flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Storage inventory</h2><p className="mt-1 text-xs text-[#78858f]">Shippers can see available units when selecting products.</p></div><button type="button" onClick={downloadCsv} disabled={!selected.length} className="rounded-lg border border-[#c7d5e5] bg-white px-3 py-2 text-xs font-bold text-[#174ea6] disabled:cursor-not-allowed disabled:opacity-40">Download selected CSV</button></div>
    <div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="sticky top-0 bg-[#f8fafc] text-[10px] uppercase tracking-wide text-[#78858f]"><tr><th className="px-5 py-3"><input aria-label="Select all inventory products" type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? products.map((product) => product.id) : [])}/></th>{["SKU","Product","Location","On hand","Reserved","Available"].map((label)=><th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1ef]">{products.map((product)=><tr key={product.id}><td className="px-5 py-4"><input aria-label={`Select ${product.name}`} type="checkbox" checked={selected.includes(product.id)} onChange={(event)=>setSelected((current)=>event.target.checked?[...current,product.id]:current.filter((id)=>id!==product.id))}/></td><td className="px-5 py-4 font-mono text-xs font-bold">{product.sku}</td><td className="px-5 py-4 font-semibold">{product.name}</td><td className="px-5 py-4">{product.location}</td><td className="px-5 py-4">{product.quantity_on_hand}</td><td className="px-5 py-4">{product.quantity_reserved}</td><td className="px-5 py-4 font-black text-[#174ea6]">{product.quantity_on_hand-product.quantity_reserved}</td></tr>)}{!products.length?<tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-[#78858f]">No products yet. Add a product to begin managing stock.</td></tr>:null}</tbody></table></div>
  </section>;
}
