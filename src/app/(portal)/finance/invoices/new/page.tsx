import Link from "next/link";
import { FilePlus2, ArrowLeft } from "lucide-react";
import { InvoiceAwbPicker } from "@/components/invoice-awb-picker";
import { requireProfile } from "@/lib/auth";
import { BillingFilters } from "@/components/billing-filters";
import { allBillingRows, billingContext, billingDate } from "@/lib/billing-workspace";


export const metadata = { title: "Create Invoice" };

export default async function NewInvoicePage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const profile = await requireProfile(["super_admin", "operations_admin", "finance_staff"]);
  const params = await searchParams;
  const { db: supabase, directory, currency, company, timeZone } = await billingContext(profile.organization_id!);
  const ledger = await allBillingRows((from, to) => supabase.from("finance_ledger")
    .select("id, shipment_id, shipper_id, tracking_number, currency, transaction_type, transaction_at, cod_amount, delivery_charge, return_charge, fulfillment_charge, total_charges, shipment:shipments!inner(status, delivered_at)")
    .eq("organization_id", profile.organization_id!).eq("transaction_type", "delivered")
    .eq("shipment.status", "delivered").order("id", { ascending: false }).range(from, to));
  const settled = await allBillingRows((from, to) => supabase.from("settlement_items")
    .select("ledger_id, settlement:settlements!inner(organization_id)")
    .eq("settlement.organization_id", profile.organization_id!).order("id").range(from, to));
  const settledIds = new Set(settled.map(row => row.ledger_id));
  const currencies = [...new Set([currency, ...ledger.map(row => row.currency)])].sort();
  const groups = new Map<string, NonNullable<typeof ledger>>();
  for (const row of ledger ?? []) {
    if (settledIds.has(row.id)) continue;
    if (params.shipper && row.shipper_id !== params.shipper) continue;
    if (params.currency && row.currency !== params.currency) continue;
    const shipment = Array.isArray(row.shipment) ? row.shipment[0] : row.shipment;
    const date = billingDate(shipment?.delivered_at || row.transaction_at, timeZone);
    if ((params.from && date < params.from) || (params.to && date > params.to)) continue;
    const key = `${row.shipper_id}:${row.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const errorMessages: Record<string, string> = {
    invalid: "Select valid AWBs for one customer and review the invoice details.",
    already_settled: "One or more AWBs were already included in another settlement. Refresh and select again.",
    save: "Invoice could not be started. Please retry.",
  };

  return <div className="bp-page max-w-6xl">
    <Link href="/finance/invoices" className="inline-flex items-center gap-2 text-sm font-bold text-[#13734b] hover:underline"><ArrowLeft className="size-4" /> Invoices</Link>
    <div className="mt-5 flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]"><FilePlus2 className="size-6" /></span>
      <div><p className="bp-section-label">Finance</p><h1 className="bp-heading mt-1 text-3xl font-black">Create customer invoice</h1><p className="mt-2 text-sm text-[#74827b]">Choose a shipper and delivery dates. Delivered shipments and their charges are prepared automatically; generate a draft to review before sharing.</p></div>
    </div>
    <p className="mt-4 text-sm font-bold">{company} · Billing currency follows each shipment</p>
    <BillingFilters pathname="/finance/invoices/new" params={params} shippers={[...directory.values()]} currencies={currencies} deliveryDates />
    {params.error ? <p role="alert" className="mt-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">{errorMessages[params.error] ?? "Could not create the invoice."}</p> : null}
    {groups.size === 0 ? <div className="bp-panel mt-6 p-8 text-center"><p className="font-bold text-[#26372f]">No uninvoiced AWBs available</p><p className="mt-2 text-sm text-[#74827b]">No uninvoiced delivered AWBs match these filters. Existing settled AWBs cannot be invoiced twice.</p><Link href="/finance/settlements" className="mt-4 inline-flex text-sm font-bold text-[#13734b] underline">View existing settlements</Link></div> :
      <div className="mt-6 space-y-5">{[...groups.entries()].map(([key, rows]) => {
        const customer = directory.get(rows[0].shipper_id);
        return <InvoiceAwbPicker key={key} shipperId={rows[0].shipper_id} name={customer?.name || "Customer"} account={customer?.accountNumber || "Pending"} email={customer?.email || ""} currency={rows[0].currency} rows={rows.map(row => {
          const shipment = Array.isArray(row.shipment) ? row.shipment[0] : row.shipment;
          return { id: row.id, tracking_number: row.tracking_number, date: billingDate(shipment?.delivered_at || row.transaction_at, timeZone), cod: Number(row.cod_amount), delivery: Number(row.delivery_charge), fulfillment: Number(row.fulfillment_charge), charges: Number(row.total_charges) };
        })} />;
      })}</div>}
  </div>;
}
