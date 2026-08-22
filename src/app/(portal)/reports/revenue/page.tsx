import Link from "next/link";
import { BadgeDollarSign, CircleDollarSign, Download, FileText, WalletCards } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { formatMoney } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Revenue Reports" };

export default async function RevenueReportsPage() {
  const profile = await requireProfile(internalRoles);
  const supabase = await createClient();
  const [{ data: ledgerData }, { data: settlementData }, { data: settings }] = await Promise.all([
    supabase.from("finance_ledger").select("id,tracking_number,currency,cod_amount,delivery_charge,return_charge,total_charges,net_payable,transaction_at").eq("organization_id", profile.organization_id).order("transaction_at", { ascending: false }),
    supabase.from("settlements").select("id,status,currency,net_payable").eq("organization_id", profile.organization_id),
    supabase.from("organization_settings").select("currency").eq("organization_id", profile.organization_id).maybeSingle(),
  ]);

  const rows = ledgerData ?? [];
  const configured = String(settings?.currency ?? "").trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(configured) ? configured : (rows[0]?.currency || settlementData?.[0]?.currency || "USD");
  const money = (value: unknown, rowCurrency?: string | null) => formatMoney(Number(value || 0), rowCurrency || currency);

  const totalCod = rows.reduce((s, r) => s + Number(r.cod_amount || 0), 0);
  const deliveryCharges = rows.reduce((s, r) => s + Number(r.delivery_charge || 0), 0);
  const returnCharges = rows.reduce((s, r) => s + Number(r.return_charge || 0), 0);
  const totalCharges = rows.reduce((s, r) => s + Number(r.total_charges || 0), 0);
  const netPayable = rows.reduce((s, r) => s + Number(r.net_payable || 0), 0);
  const paid = (settlementData ?? []).filter(r => r.status === "paid").reduce((s, r) => s + Number(r.net_payable || 0), 0);

  return <div className="bp-page">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="bp-section-label">Reports</p><h1 className="bp-heading mt-1 text-3xl font-black">Revenue Reports</h1><p className="mt-2 text-sm text-[#74827b]">COD movement, courier revenue and shipper payable at AWB level.</p></div>
      <div className="flex gap-2"><Link href="/reports/revenue/export-pdf" className="bp-button-secondary"><FileText className="size-4"/>PDF</Link><Link href="/reports/revenue/export-xlsx" className="bp-button-secondary"><Download className="size-4"/>Excel</Link></div>
    </div>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["COD Value",totalCod,CircleDollarSign],["Courier Charges",totalCharges,BadgeDollarSign],["Shipper Payable",netPayable,WalletCards],["Paid",paid,WalletCards]].map(([label,value,Icon])=>{const CardIcon=Icon as typeof CircleDollarSign;return <div key={String(label)} className="bp-card p-5"><CardIcon className="size-5 text-[#15905c]"/><p className="mt-4 text-2xl font-black">{money(value)}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">{String(label)}</p></div>})}
    </section>

    <section className="bp-panel mt-6 overflow-hidden">
      <div className="bp-panel-header"><h2 className="font-black text-[#26372f]">AWB Revenue Detail</h2><p className="mt-1 text-xs text-[#87938d]">Delivery and return charge breakdown per finance ledger transaction.</p></div>
      {rows.length===0?<p className="p-10 text-center text-sm text-[#87938d]">No revenue transactions available.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]"><tr><th className="px-4 py-3">AWB</th><th className="px-4 py-3">COD</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Return</th><th className="px-4 py-3">Charges</th><th className="px-4 py-3">Net Payable</th></tr></thead><tbody className="divide-y divide-[#edf1ef]">{rows.map(row=><tr key={row.id} className="bp-table-row"><td className="px-4 py-4 font-mono text-xs font-black text-[#13734b]">{row.tracking_number}</td><td className="px-4 py-4">{money(row.cod_amount,row.currency)}</td><td className="px-4 py-4">{money(row.delivery_charge,row.currency)}</td><td className="px-4 py-4">{money(row.return_charge,row.currency)}</td><td className="px-4 py-4 font-bold">{money(row.total_charges,row.currency)}</td><td className="px-4 py-4 font-black text-[#13734b]">{money(row.net_payable,row.currency)}</td></tr>)}</tbody></table></div>}
      <div className="border-t border-[#edf1ef] bg-[#fafcfb] p-5"><div className="ml-auto grid max-w-lg gap-2 text-sm"><div className="flex justify-between"><span>Delivery charges</span><strong>{money(deliveryCharges)}</strong></div><div className="flex justify-between"><span>Return charges</span><strong>{money(returnCharges)}</strong></div><div className="flex justify-between border-t border-[#dfe7e3] pt-2"><span className="font-black">Total Charges</span><strong className="text-[#13734b]">{money(totalCharges)}</strong></div></div></div>
    </section>
  </div>;
}
