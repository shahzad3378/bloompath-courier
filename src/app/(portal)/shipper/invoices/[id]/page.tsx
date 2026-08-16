import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileText,
  Printer,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Invoice",
};

function money(
  value: unknown,
  currency = "AED",
) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function relation<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function ShipperInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile(["shipper"]);

  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: invoice, error } = await supabase
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
      issued_at,
      paid_at,
      payment_reference,
      settlement:settlements!invoices_settlement_id_fkey(
        settlement_number,
        period_from,
        period_to
      )
    `)
    .eq("id", Number(id))
    .eq("shipper_id", profile.id)
    .in("status", [
      "issued",
      "sent",
      "paid",
      "overdue",
    ])
    .maybeSingle();

  if (error || !invoice) {
    notFound();
  }

  const settlement = relation(invoice.settlement);

  const { data: items, error: itemsError } =
    await supabase
      .from("invoice_items")
      .select(`
        id,
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
      .order("id");

  const rows = (items ?? []) as any[];

  return (
    <div className="bp-page">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Link
            href="/shipper/invoices"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#13734b] hover:underline"
          >
            <ArrowLeft className="size-4" />
            Back to My Invoices
          </Link>

          <p className="mt-5 bp-section-label">
            Shipper Invoice
          </p>

          <h1 className="bp-heading mt-1 text-3xl font-black">
            {invoice.invoice_number}
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Settlement{" "}
            <span className="font-bold text-[#34453c]">
              {settlement?.settlement_number || "—"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-2 text-[10px] font-black uppercase ${
              invoice.status === "paid"
                ? "bg-[#e8f7ef] text-[#13734b]"
                : "bg-[#fff3df] text-[#a66516]"
            }`}
          >
            {invoice.status.replaceAll("_", " ")}
          </span>

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
            <FileText className="size-4" />
            Excel
          </Link>

          <Link
            href={`/finance/invoices/${invoice.id}/pdf`}
            target="_blank"
            className="bp-button-secondary"
          >
            <Printer className="size-4" />
            Print
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bp-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            COD Collected
          </p>
          <p className="mt-2 text-xl font-black text-[#26372f]">
            {money(
              invoice.cod_collected,
              invoice.currency,
            )}
          </p>
        </div>

        <div className="bp-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Courier Charges
          </p>
          <p className="mt-2 text-xl font-black text-[#26372f]">
            {money(
              Number(invoice.total_delivery_charges || 0) +
                Number(invoice.total_return_charges || 0),
              invoice.currency,
            )}
          </p>
        </div>

        <div className="bp-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Invoice Total
          </p>
          <p className="mt-2 text-xl font-black text-[#26372f]">
            {money(
              invoice.total_amount,
              invoice.currency,
            )}
          </p>
        </div>

        <div className="bp-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Net COD Payable
          </p>
          <p className="mt-2 text-xl font-black text-[#13734b]">
            {money(
              invoice.net_settlement_payable,
              invoice.currency,
            )}
          </p>
        </div>
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header flex flex-col justify-between gap-4 sm:flex-row">
          <div>
            <h2 className="font-black text-[#26372f]">
              Invoice Details
            </h2>

            <p className="mt-1 text-xs text-[#87938d]">
              {rows.length} AWB
              {rows.length === 1 ? "" : "s"} included in
              this invoice.
            </p>
          </div>

          <div className="text-xs text-[#65736c] sm:text-right">
            <p>
              Invoice Date:{" "}
              <span className="font-bold">
                {invoice.invoice_date || "—"}
              </span>
            </p>

            <p className="mt-1">
              Due Date:{" "}
              <span className="font-bold">
                {invoice.due_date || "—"}
              </span>
            </p>
          </div>
        </div>

        {itemsError ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            Invoice AWBs could not be loaded.
          </p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No AWBs are attached to this invoice.
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
                  <th className="px-4 py-3">Delivery</th>
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3">Charges</th>
                  <th className="px-4 py-3">Net Payable</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="bp-table-row"
                  >
                    <td className="px-4 py-4 font-mono text-xs font-black text-[#13734b]">
                      {row.tracking_number}
                    </td>

                    <td className="px-4 py-4 text-xs">
                      {row.delivered_at
                        ? formatDubaiDate(
                            row.delivered_at,
                          )
                        : "—"}
                    </td>

                    <td className="px-4 py-4 font-semibold">
                      {row.consignee_name || "—"}
                    </td>

                    <td className="px-4 py-4">
                      {row.consignee_city || "—"}
                    </td>

                    <td className="px-4 py-4 font-bold">
                      {money(
                        row.cod_amount,
                        invoice.currency,
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {money(
                        row.delivery_charge,
                        invoice.currency,
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {money(
                        row.return_charge,
                        invoice.currency,
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {money(
                        row.total_charges,
                        invoice.currency,
                      )}
                    </td>

                    <td className="px-4 py-4 font-black text-[#13734b]">
                      {money(
                        row.net_payable,
                        invoice.currency,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="bp-card p-5">
          <h2 className="font-black text-[#26372f]">
            Payment Status
          </h2>

          {invoice.status === "paid" ? (
            <div className="mt-4 rounded-xl bg-[#edf8f2] p-4">
              <p className="font-black text-[#13734b]">
                Paid
              </p>

              <p className="mt-1 text-xs text-[#65736c]">
                {invoice.paid_at
                  ? `Paid on ${formatDubaiDate(
                      invoice.paid_at,
                    )}`
                  : "Payment completed."}
              </p>

              {invoice.payment_reference ? (
                <p className="mt-2 text-xs font-bold text-[#34453c]">
                  Payment Ref:{" "}
                  {invoice.payment_reference}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-[#fff8ec] p-4">
              <p className="font-black text-[#a66516]">
                Payment Pending
              </p>

              <p className="mt-1 text-xs text-[#7b6a52]">
                This invoice has not yet been marked
                as paid by finance.
              </p>
            </div>
          )}
        </div>

        <div className="bp-card p-5">
          <h2 className="font-black text-[#26372f]">
            Invoice Summary
          </h2>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[#74827b]">
                Delivery charges
              </span>
              <strong>
                {money(
                  invoice.total_delivery_charges,
                  invoice.currency,
                )}
              </strong>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-[#74827b]">
                Return charges
              </span>
              <strong>
                {money(
                  invoice.total_return_charges,
                  invoice.currency,
                )}
              </strong>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-[#74827b]">
                Subtotal
              </span>
              <strong>
                {money(
                  invoice.subtotal,
                  invoice.currency,
                )}
              </strong>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-[#74827b]">
                VAT ({Number(
                  invoice.tax_rate || 0,
                ).toFixed(2)}
                %)
              </span>
              <strong>
                {money(
                  invoice.tax_amount,
                  invoice.currency,
                )}
              </strong>
            </div>

            <div className="border-t border-[#e5ebe8] pt-3">
              <div className="flex justify-between gap-4">
                <span className="font-black">
                  Invoice Total
                </span>
                <strong className="text-[#13734b]">
                  {money(
                    invoice.total_amount,
                    invoice.currency,
                  )}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
