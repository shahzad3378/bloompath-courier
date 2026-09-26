import Link from "next/link";
import { FilePlus2, ArrowLeft } from "lucide-react";
import { createInvoiceFromAwbsAction } from "@/app/(portal)/finance/actions";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { getShipperDirectory } from "@/lib/organization-finance";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Create Invoice" };

export default async function NewInvoicePage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requireProfile(["super_admin", "operations_admin", "finance_staff"]);
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: ledger, error }, directory] = await Promise.all([
    supabase.from("finance_ledger")
      .select("id, shipment_id, shipper_id, tracking_number, currency, transaction_type, transaction_at, cod_amount, delivery_charge, return_charge, total_charges")
      .eq("organization_id", profile.organization_id!)
      .order("transaction_at", { ascending: false })
      .limit(500),
    getShipperDirectory(supabase, profile.organization_id!),
  ]);

  const { data: settled, error: settledError } = ledger?.length
    ? await supabase.from("settlement_items").select("ledger_id").in("ledger_id", ledger.map((row) => row.id))
    : { data: [], error: null };
  const settledIds = new Set((settled ?? []).map((row) => row.ledger_id));
  const groups = new Map<string, NonNullable<typeof ledger>>();
  for (const row of ledger ?? []) {
    if (settledIds.has(row.id)) continue;
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
      <div><p className="bp-section-label">Finance</p><h1 className="bp-heading mt-1 text-3xl font-black">Create customer invoice</h1><p className="mt-2 text-sm text-[#74827b]">Select one customer&apos;s completed AWBs. The system creates an approved settlement and an invoice draft linked to every selected AWB.</p></div>
    </div>
    {params.error ? <p role="alert" className="mt-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">{errorMessages[params.error] ?? "Could not create the invoice."}</p> : null}
    {error || settledError ? <p role="alert" className="mt-6 text-sm font-semibold text-[#a13f3f]">Eligible AWBs could not be loaded.</p> : groups.size === 0 ? <div className="bp-panel mt-6 p-8 text-center"><p className="font-bold text-[#26372f]">No uninvoiced AWBs available</p><p className="mt-2 text-sm text-[#74827b]">Delivered or returned shipments create finance entries here. Existing settled AWBs cannot be invoiced twice.</p><Link href="/finance/settlements" className="mt-4 inline-flex text-sm font-bold text-[#13734b] underline">View existing settlements</Link></div> :
      <div className="mt-6 space-y-5">{[...groups.entries()].map(([key, rows]) => {
        const customer = directory.get(rows[0].shipper_id);
        return <form key={key} action={createInvoiceFromAwbsAction} className="bp-panel overflow-hidden">
          <input type="hidden" name="shipper_id" value={rows[0].shipper_id} />
          <div className="border-b border-[#e6ece9] p-5"><h2 className="text-lg font-black text-[#26372f]">{customer?.name || "Customer"}</h2><p className="mt-1 text-xs text-[#74827b]">Account {customer?.accountNumber || "Pending"} · {rows.length} eligible AWB{rows.length === 1 ? "" : "s"} · {rows[0].currency}</p></div>
          <div className="max-h-80 overflow-auto"><table className="w-full min-w-[750px] text-left text-xs"><thead className="sticky top-0 bg-[#f7faf8] text-[#65736c]"><tr><th className="px-4 py-3">Select</th><th className="px-4 py-3">AWB</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">COD</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Return</th></tr></thead>
            <tbody className="divide-y divide-[#edf1ef]">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3"><input type="checkbox" name="ledger_id" value={row.id} defaultChecked className="size-4 accent-[#13734b]" aria-label={`Include AWB ${row.tracking_number}`} /></td><td className="px-4 py-3 font-mono font-bold text-[#13734b]">{row.tracking_number}</td><td className="px-4 py-3">{formatDubaiDate(row.transaction_at)}</td><td className="px-4 py-3">{row.transaction_type}</td><td className="px-4 py-3">{formatMoney(row.cod_amount, row.currency)}</td><td className="px-4 py-3">{formatMoney(row.delivery_charge, row.currency)}</td><td className="px-4 py-3">{formatMoney(row.return_charge, row.currency)}</td></tr>)}</tbody></table></div>
          <div className="grid gap-4 border-t border-[#e6ece9] p-5 sm:grid-cols-3"><label className="text-xs font-bold text-[#516159]">Due date (optional)<input type="date" name="due_date" className="bp-input mt-1.5 w-full" /></label><label className="text-xs font-bold text-[#516159]">Tax %<input type="number" name="tax_rate" min="0" max="100" step="0.001" defaultValue="0" className="bp-input mt-1.5 w-full" /></label><label className="text-xs font-bold text-[#516159]">Customer email<input type="email" name="recipient_email" maxLength={160} defaultValue={customer?.email ?? ""} className="bp-input mt-1.5 w-full" /></label></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ece9] p-5"><p className="text-xs text-[#74827b]">Invoice starts as a draft. Review it before issuing or sharing the PDF.</p><button className="bp-button-primary"><FilePlus2 className="size-4" /> Create invoice draft</button></div>
        </form>;
      })}</div>}
  </div>;
}
