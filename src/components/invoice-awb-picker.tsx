"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createInvoiceFromAwbsAction } from "@/app/(portal)/finance/actions";
import { netBalance } from "@/lib/billing";
import { formatMoney } from "@/lib/currency";

type Row = { id: number; tracking_number: string; date: string; cod: number; delivery: number; fulfillment: number; charges: number };
function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button disabled={disabled || pending} className="bp-button-primary disabled:opacity-50">{pending ? "Generating draft…" : "Generate invoice draft"}</button>;
}

export function InvoiceAwbPicker({ shipperId, name, account, email, currency, rows }: {
  shipperId: string; name: string; account: string; email: string; currency: string; rows: Row[];
}) {
  const [selected, setSelected] = useState(() => new Set(rows.map(row => row.id)));
  const [taxRate, setTaxRate] = useState(0);
  const chosen = rows.filter(row => selected.has(row.id));
  const charges = chosen.reduce((sum, row) => sum + row.charges, 0);
  const cod = chosen.reduce((sum, row) => sum + row.cod, 0);
  const tax = Math.round(charges * taxRate) / 100;
  const balance = netBalance(cod, charges, tax);
  return <form action={createInvoiceFromAwbsAction} className="bp-panel overflow-hidden">
    <input type="hidden" name="shipper_id" value={shipperId} />
    <div className="border-b border-[#e6ece9] p-5"><h2 className="text-lg font-black">{name}</h2><p className="mt-1 text-xs text-[#74827b]">Account {account} · {chosen.length} / {rows.length} delivered AWBs selected · {currency}</p></div>
    <div aria-live="polite" className="grid gap-4 border-b border-[#e6ece9] bg-[#f7faf8] p-5 sm:grid-cols-5">{[["Charges", charges], ["Tax", tax], ["COD recorded", cod], ["Receivable", balance.receivable], ["Payable", balance.payable]].map(([label, value]) => <div key={String(label)}><p className="text-xs text-[#74827b]">{label}</p><p className="mt-1 font-black">{formatMoney(value, currency)}</p></div>)}</div>
    <div className="flex flex-wrap items-center gap-4 border-b border-[#e6ece9] px-5 py-3 text-xs font-bold"><button type="button" onClick={() => setSelected(new Set(rows.map(row => row.id)))} className="underline">Select all delivered AWBs</button><button type="button" onClick={() => setSelected(new Set())} className="underline">Clear selection</button></div>
    <div className="max-h-80 overflow-auto"><table className="w-full min-w-[750px] text-left text-xs"><thead className="sticky top-0 bg-[#f7faf8] text-[#65736c]"><tr>{["Select", "AWB", "Delivery date", "COD", "Delivery charge", "Fulfillment", "Total charges"].map(label => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1ef]">{rows.map(row => <tr key={row.id}><td className="px-4 py-3"><input type="checkbox" name="ledger_id" value={row.id} checked={selected.has(row.id)} onChange={event => { const next = new Set(selected); if (event.target.checked) next.add(row.id); else next.delete(row.id); setSelected(next); }} aria-label={`Include AWB ${row.tracking_number}`} /></td><td className="px-4 py-3 font-mono font-bold">{row.tracking_number}</td><td className="px-4 py-3">{row.date}</td>{[row.cod, row.delivery, row.fulfillment, row.charges].map((value, i) => <td key={i} className="px-4 py-3">{formatMoney(value, currency)}</td>)}</tr>)}</tbody></table></div>
    <div className="grid gap-4 border-t border-[#e6ece9] p-5 sm:grid-cols-3"><label className="text-xs font-bold">Due date (optional)<input type="date" name="due_date" className="bp-input mt-2 w-full" /></label><label className="text-xs font-bold">Tax %<input type="number" name="tax_rate" min="0" max="100" step="0.001" value={taxRate} onChange={event => setTaxRate(Number(event.target.value))} className="bp-input mt-2 w-full" /></label><label className="text-xs font-bold">Customer email<input type="email" name="recipient_email" defaultValue={email} maxLength={160} className="bp-input mt-2 w-full" /></label></div>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#e6ece9] p-5"><p className="text-xs text-[#74827b]">Draft only. No email or payment is sent. COD payout is recorded separately.</p><Submit disabled={chosen.length === 0 || chosen.length > 5000} /></div>
  </form>;
}
