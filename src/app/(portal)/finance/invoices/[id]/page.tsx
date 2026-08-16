import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Printer,
  ReceiptText,
  Send,
} from "lucide-react";
import { updateInvoiceStatusAction } from "@/app/(portal)/finance/actions";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Invoice Detail",
};

const financeRoles = [
  "super_admin",
  "operations_admin",
  "finance_staff",
] as const;

type InvoiceRelation = {
  settlement_number: string;
  status: string;
  period_from: string | null;
  period_to: string | null;
};

type ShipperRelation = {
  full_name: string;
  email: string | null;
  phone: string | null;
};

type InvoiceRow = {
  id: number;
  invoice_number: string;
  settlement_id: number;
  shipper_id: string;
  status: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  cod_collected: number;
  total_delivery_charges: number;
  total_return_charges: number;
  net_settlement_payable: number;
  invoice_date: string;
  due_date: string | null;
  recipient_email: string | null;
  issued_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  notes: string | null;
  settlement: InvoiceRelation | InvoiceRelation[] | null;
  shipper: ShipperRelation | ShipperRelation[] | null;
};

function money(
  value: number,
  currency = "AED",
) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireProfile(financeRoles);

  const { id } = await params;
  const { created } = await searchParams;

  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_number,
      settlement_id,
      shipper_id,
      status,
      currency,
      subtotal,
      tax_rate,
      tax_amount,
      total_amount,
      cod_collected,
      total_delivery_charges,
      total_return_charges,
      net_settlement_payable,
      invoice_date,
      due_date,
      recipient_email,
      issued_at,
      sent_at,
      paid_at,
      payment_reference,
      notes,
      settlement:settlements!invoices_settlement_id_fkey(
        settlement_number,
        status,
        period_from,
        period_to
      ),
      shipper:profiles!invoices_shipper_id_fkey(
        full_name,
        email,
        phone
      )
    `)
    .eq("id", Number(id))
    .maybeSingle();

  if (!invoice) {
    notFound();
  }

  const invoiceRow = invoice as unknown as InvoiceRow;

  const settlement = Array.isArray(invoiceRow.settlement)
    ? invoiceRow.settlement[0] ?? null
    : invoiceRow.settlement;

  const shipper = Array.isArray(invoiceRow.shipper)
    ? invoiceRow.shipper[0] ?? null
    : invoiceRow.shipper;

  const { data: itemData } = await supabase
    .from("invoice_items")
    .select(`
      id,
      shipment_id,
      tracking_number,
      delivered_at,
      consignee_name,
      consignee_city,
      cod_amount,
      delivery_charge,
      return_charge,
      total_charges,
      net_payable
    `)
    .eq("invoice_id", invoice.id)
    .order("id", { ascending: true });

  const items = itemData ?? [];

  const currency =
    invoice.currency || "AED";

  return (
    <div className="bp-page">
      {created === "1" ? (
        <div className="mb-5 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          Invoice generated successfully with {items.length} AWB
          {items.length === 1 ? "" : "s"}.
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Link
            href="/finance/invoices"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#13734b]"
          >
            <ArrowLeft className="size-4" />
            Back to Invoices
          </Link>

          <p className="mt-5 bp-section-label">
            Finance
          </p>

          <h1 className="bp-heading mt-1 text-3xl font-black">
            {invoice.invoice_number}
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Settlement{" "}
            {settlement?.settlement_number || "—"} ·{" "}
            {shipper?.full_name ||
              shipper?.email ||
              "Shipper"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#eef4ff] px-3 py-1.5 text-[10px] font-black uppercase text-[#46639b]">
            {invoice.status.replaceAll("_", " ")}
          </span>

          <Link
            href={`/finance/invoices/${invoice.id}/print`}
            target="_blank"
            className="bp-button-secondary"
          >
            <Printer className="size-4" />
            Print
          </Link>

          <Link
            href={`/finance/invoices/${invoice.id}/pdf`}
            className="bp-button-secondary"
          >
            <Download className="size-4" />
            PDF
          </Link>

          <Link
            href={`/finance/invoices/${invoice.id}/excel`}
            className="bp-button-secondary"
          >
            <Download className="size-4" />
            Excel
          </Link>

          {invoice.status === "draft" ? (
            <form action={updateInvoiceStatusAction}>
              <input
                type="hidden"
                name="invoice_id"
                value={invoice.id}
              />
              <input
                type="hidden"
                name="invoice_action"
                value="issue"
              />

              <button className="bp-button-primary">
                <Send className="size-4" />
                Issue Invoice
              </button>
            </form>
          ) : null}

          {["issued", "sent", "overdue"].includes(invoice.status) ? (
            <form
              action={updateInvoiceStatusAction}
              className="flex items-center gap-2"
            >
              <input
                type="hidden"
                name="invoice_id"
                value={invoice.id}
              />
              <input
                type="hidden"
                name="invoice_action"
                value="mark_paid"
              />

              <input
                name="payment_reference"
                placeholder="Payment reference"
                className="h-10 rounded-xl border border-[#dbe5e0] bg-white px-3 text-xs"
              />

              <button className="bp-button-primary">
                <CheckCircle2 className="size-4" />
                Mark Paid
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bp-card p-5">
          <ReceiptText className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {money(invoice.cod_collected, currency)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            COD Collected
          </p>
        </div>

        <div className="bp-card p-5">
          <FileText className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {money(invoice.subtotal, currency)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Courier Charges
          </p>
        </div>

        <div className="bp-card p-5">
          <FileText className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {money(invoice.tax_amount, currency)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Tax ({Number(invoice.tax_rate).toFixed(3)}%)
          </p>
        </div>

        <div className="bp-card p-5">
          <ReceiptText className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {money(invoice.net_settlement_payable, currency)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Net Payable to Shipper
          </p>
        </div>
      </section>

      <section className="bp-panel mt-6 p-5">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-[#87938d]">
              Settlement
            </p>
            <p className="mt-1 font-mono text-sm font-black text-[#13734b]">
              {settlement?.settlement_number || "—"}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase text-[#87938d]">
              Invoice Date
            </p>
            <p className="mt-1 text-sm font-bold">
              {invoice.invoice_date}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase text-[#87938d]">
              Due Date
            </p>
            <p className="mt-1 text-sm font-bold">
              {invoice.due_date || "—"}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase text-[#87938d]">
              Recipient
            </p>
            <p className="mt-1 text-sm font-bold">
              {invoice.recipient_email ||
                shipper?.email ||
                "—"}
            </p>
          </div>
        </div>
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header flex items-center justify-between">
          <div>
            <h2 className="font-black text-[#26372f]">
              Invoice AWB Details
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Every shipment included in this invoice.
            </p>
          </div>

          <p className="text-xs font-bold text-[#13734b]">
            {items.length} AWBs
          </p>
        </div>

        {items.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No AWB lines found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-4 py-3">AWB</th>
                  <th className="px-4 py-3">Delivered</th>
                  <th className="px-4 py-3">Consignee</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">COD</th>
                  <th className="px-4 py-3">Delivery Charge</th>
                  <th className="px-4 py-3">Return Charge</th>
                  <th className="px-4 py-3">Total Charges</th>
                  <th className="px-4 py-3">Net Payable</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {items.map((item) => (
                  <tr key={item.id} className="bp-table-row">
                    <td className="px-4 py-4">
                      <Link
                        href={`/shipments/${item.shipment_id}`}
                        className="font-mono text-xs font-black text-[#13734b]"
                      >
                        {item.tracking_number}
                      </Link>
                    </td>

                    <td className="px-4 py-4 text-xs">
                      {item.delivered_at
                        ? formatDubaiDate(item.delivered_at)
                        : "—"}
                    </td>

                    <td className="px-4 py-4 font-semibold">
                      {item.consignee_name || "—"}
                    </td>

                    <td className="px-4 py-4">
                      {item.consignee_city || "—"}
                    </td>

                    <td className="px-4 py-4 font-bold">
                      {money(item.cod_amount, currency)}
                    </td>

                    <td className="px-4 py-4">
                      {money(item.delivery_charge, currency)}
                    </td>

                    <td className="px-4 py-4">
                      {money(item.return_charge, currency)}
                    </td>

                    <td className="px-4 py-4 font-bold">
                      {money(item.total_charges, currency)}
                    </td>

                    <td className="px-4 py-4 font-black text-[#13734b]">
                      {money(item.net_payable, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bp-panel mt-6 p-5">
        <div className="ml-auto max-w-sm space-y-3">
          <div className="flex justify-between text-sm">
            <span>Delivery charges</span>
            <strong>
              {money(
                invoice.total_delivery_charges,
                currency,
              )}
            </strong>
          </div>

          <div className="flex justify-between text-sm">
            <span>Return charges</span>
            <strong>
              {money(
                invoice.total_return_charges,
                currency,
              )}
            </strong>
          </div>

          <div className="flex justify-between text-sm">
            <span>Service subtotal</span>
            <strong>
              {money(invoice.subtotal, currency)}
            </strong>
          </div>

          <div className="flex justify-between text-sm">
            <span>Tax</span>
            <strong>
              {money(invoice.tax_amount, currency)}
            </strong>
          </div>

          <div className="border-t border-[#e1e8e4] pt-3">
            <div className="flex justify-between text-base">
              <span className="font-black">
                Invoice Total
              </span>
              <strong className="text-[#13734b]">
                {money(invoice.total_amount, currency)}
              </strong>
            </div>
          </div>

          <div className="border-t border-[#e1e8e4] pt-3">
            <div className="flex justify-between text-base">
              <span className="font-black">
                Net COD Payable
              </span>
              <strong>
                {money(
                  invoice.net_settlement_payable,
                  currency,
                )}
              </strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
