import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { billingContext, billingDate, allBillingRows } from "@/lib/billing-workspace";
import { currencyTotals, netBalance } from "@/lib/billing";
import { formatMoney } from "@/lib/currency";
import { BillingFilters } from "@/components/billing-filters";
import { CurrencyTotals } from "@/components/currency-totals";

export const metadata = { title: "Billing & Statements" };

export default async function BillingReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireProfile(["super_admin", "operations_admin", "finance_staff"]);
  const params = await searchParams;
  const { db, directory, company, currency, timeZone } = await billingContext(profile.organization_id!);
  const [ledger, settled] = await Promise.all([
    allBillingRows((from, to) => db.from("finance_ledger")
      .select("id, shipper_id, currency, transaction_at, transaction_type, tracking_number, cod_amount, total_charges, shipment:shipments!inner(status, delivered_at)")
      .eq("organization_id", profile.organization_id!).order("id").range(from, to)),
    allBillingRows((from, to) => db.from("settlement_items")
      .select("ledger_id, settlement:settlements!inner(id, organization_id, status, invoices(id, status, tax_rate))")
      .eq("settlement.organization_id", profile.organization_id!).order("id").range(from, to)),
  ]);
  const currencies = [...new Set([currency, ...ledger.map(row => row.currency)])].sort();
  const links = new Map(settled.map(item => [item.ledger_id, Array.isArray(item.settlement) ? item.settlement[0] : item.settlement]));
  type Summary = { shipperId: string; name: string; currency: string; awbs: number; unbilled: number; charges: number; cod: number; receivable: number; payable: number; invoices: Set<number> };
  const groups = new Map<string, Summary>();
  const balances = new Map<string, { key: string; cod: number; charges: number; taxRate: number; receivablePaid: boolean }>();
  for (const row of ledger) {
    const shipment = Array.isArray(row.shipment) ? row.shipment[0] : row.shipment;
    if (shipment?.status !== row.transaction_type) continue;
    if (params.shipper && row.shipper_id !== params.shipper) continue;
    if (params.currency && row.currency !== params.currency) continue;
    const date = billingDate(shipment?.delivered_at || row.transaction_at, timeZone);
    if ((params.from && date < params.from) || (params.to && date > params.to)) continue;
    const key = `${row.shipper_id}:${row.currency}`;
    const summary = groups.get(key) ?? { shipperId: row.shipper_id, name: directory.get(row.shipper_id)?.name || "Shipper", currency: row.currency, awbs: 0, unbilled: 0, charges: 0, cod: 0, receivable: 0, payable: 0, invoices: new Set<number>() };
    const settlement = links.get(row.id);
    const invoiceRelation = settlement?.invoices as { id: number; status: string; tax_rate: number } | { id: number; status: string; tax_rate: number }[] | null | undefined;
    const invoice = Array.isArray(invoiceRelation) ? invoiceRelation.find(i => i.status !== "cancelled") : invoiceRelation?.status === "cancelled" ? null : invoiceRelation;
    const charges = Number(row.total_charges || 0), cod = Number(row.cod_amount || 0);

    summary.awbs++; summary.charges += charges; summary.cod += cod;
    if (!settlement) summary.unbilled++;
    if (invoice) summary.invoices.add(invoice.id);
    if (settlement?.status !== "paid" && settlement?.status !== "cancelled") {
      const balanceKey = `${key}:${settlement?.id || "unbilled"}`;
      const bucket = balances.get(balanceKey) ?? { key, cod: 0, charges: 0, taxRate: Number(invoice?.tax_rate || 0), receivablePaid: invoice?.status === "paid" };
      bucket.cod += cod; bucket.charges += charges; balances.set(balanceKey, bucket);
    }
    groups.set(key, summary);
  }
  for (const bucket of balances.values()) {
    const balance = netBalance(bucket.cod, bucket.charges, Math.round(bucket.charges * bucket.taxRate) / 100);
    const summary = groups.get(bucket.key)!;
    summary.payable += balance.payable;
    if (!bucket.receivablePaid) summary.receivable += balance.receivable;
  }
  const all = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  const rows = all.filter(row => params.view === "receivables" ? row.receivable > 0 : params.view === "payables" ? row.payable > 0 : true);
  const qs = new URLSearchParams(Object.entries(params).filter((pair): pair is [string, string] => Boolean(pair[1])));
  const viewHref = (view: string) => { const q = new URLSearchParams(qs); q.set("view", view); return `/reports/finance?${q}`; };
  return <div className="bp-page">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="bp-section-label">{company}</p><h1 className="bp-heading mt-2 text-3xl font-black">Billing & Statements</h1><p className="mt-2 text-sm text-[#74827b]">Delivered shipments, customer invoices and COD balances in one place.</p></div><div className="flex flex-wrap gap-2"><Link href="/finance/invoices/new" className="bp-button-primary">Generate customer invoice</Link><Link href="/finance/invoices" className="bp-button-secondary">Invoice register</Link></div></div>
    <BillingFilters pathname="/reports/finance" params={params} shippers={[...directory.values()]} currencies={currencies} deliveryDates />
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Link href={viewHref("all")} className="bp-card p-5"><p className="text-xs font-bold text-[#74827b]">Completed AWBs</p><p className="mt-3 text-3xl font-black">{all.reduce((sum, row) => sum + row.awbs, 0)}</p><p className="mt-2 text-xs text-[#74827b]">{all.reduce((sum, row) => sum + row.unbilled, 0)} ready for billing</p></Link>
      <Link href={viewHref("receivables")} className="bp-card p-5"><p className="text-xs font-bold text-[#74827b]">Receivables · collect from shippers</p><div className="mt-3 text-xl font-black text-[#13734b]"><CurrencyTotals totals={currencyTotals(all, row => row.receivable)} emptyCurrency={currency} /></div></Link>
      <Link href={viewHref("payables")} className="bp-card p-5"><p className="text-xs font-bold text-[#74827b]">Payables · COD due to shippers</p><div className="mt-3 text-xl font-black text-[#a66516]"><CurrencyTotals totals={currencyTotals(all, row => row.payable)} emptyCurrency={currency} /></div></Link>
      <Link href="/finance/cod" className="bp-card p-5"><p className="text-xs font-bold text-[#74827b]">COD recorded on completed AWBs</p><div className="mt-3 text-xl font-black"><CurrencyTotals totals={currencyTotals(all, row => row.cod)} emptyCurrency={currency} /></div><p className="mt-2 text-xs text-[#74827b]">Reconcile cash received from drivers</p></Link>
    </div>
    <nav className="mt-6 flex flex-wrap gap-2">{[["all", "All accounts"], ["receivables", "Receivables"], ["payables", "Payables"]].map(([view, label]) => <Link key={view} href={viewHref(view)} className={(!params.view && view === "all") || params.view === view ? "bp-button-primary" : "bp-button-secondary"}>{label}</Link>)}<Link href="/finance/settlements" className="bp-button-secondary">COD settlements</Link></nav>
    <section className="bp-panel mt-5 overflow-hidden"><div className="bp-panel-header"><h2 className="font-black">Shipper statements</h2><p className="mt-1 text-xs text-[#74827b]">One row per shipper and currency. Invoice receipts and COD payouts are tracked separately.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-[#f7faf8] text-xs text-[#74827b]"><tr>{["Shipper", "Currency", "AWBs", "Charges", "COD recorded", "Receivable", "Payable", "Unbilled", "Actions"].map(label => <th key={label} className="px-5 py-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1ef]">{rows.map(row => {
      const query = new URLSearchParams({ shipper: row.shipperId, currency: row.currency });
      if (params.from) query.set("from", params.from); if (params.to) query.set("to", params.to);
      return <tr key={`${row.shipperId}:${row.currency}`}><td className="px-5 py-5 font-bold">{row.name}</td><td className="px-5 py-5">{row.currency}</td><td className="px-5 py-5">{row.awbs}</td><td className="px-5 py-5">{formatMoney(row.charges, row.currency)}</td><td className="px-5 py-5">{formatMoney(row.cod, row.currency)}</td><td className="px-5 py-5 font-bold">{formatMoney(row.receivable, row.currency)}</td><td className="px-5 py-5 font-bold">{formatMoney(row.payable, row.currency)}</td><td className="px-5 py-5">{row.unbilled}</td><td className="px-5 py-5"><div className="flex flex-wrap gap-3"><Link href={`/finance/invoices/new?${query}`} className="font-bold text-[#13734b] underline">Generate invoice</Link><Link href={`/finance/invoices?shipper=${row.shipperId}&currency=${row.currency}`} className="font-bold underline">Invoices ({row.invoices.size})</Link></div></td></tr>;
    })}</tbody></table>{rows.length === 0 ? <p className="p-10 text-center text-sm text-[#74827b]">No accounts match these filters.</p> : null}</div></section>
    <p className="mt-4 text-xs leading-6 text-[#74827b]">Unbilled balances are estimates from recorded charges before invoice tax. COD payable is the recorded COD less charges and invoice tax; confirm cash receipt before payout. Amounts in different currencies are never added together. Dates use {timeZone}.</p>
  </div>;
}
