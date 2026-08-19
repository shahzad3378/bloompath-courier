import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  FileText,
  ReceiptText,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Invoices",
};

const financeRoles = [
  "super_admin",
  "operations_admin",
  "finance_staff",
] as const;

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

export default async function FinanceInvoicesPage() {
  await requireProfile(financeRoles);

  const supabase = await createClient();

  const { data, error } = await supabase
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
      net_settlement_payable,
      invoice_date,
      due_date,
      paid_at,
      payment_reference,
      settlement:settlements!invoices_settlement_id_fkey(
        settlement_number
      ),
      shipper:profiles!invoices_shipper_id_fkey(
        full_name,
        email
      ),
      invoice_items(
        id,
        delivery_charge,
        return_charge
      )
    `)
    .order("invoice_date", {
      ascending: false,
    })
    .order("id", {
      ascending: false,
    });

  const rows = (data ?? []) as any[];

  const draftCount = rows.filter(
    (row) => row.status === "draft",
  ).length;

  const openRows = rows.filter(
    (row) =>
      row.status === "issued" ||
      row.status === "sent" ||
      row.status === "overdue",
  );

  const paidRows = rows.filter(
    (row) => row.status === "paid",
  );

  const openValue = openRows.reduce(
    (sum, row) =>
      sum + Number(row.total_amount || 0),
    0,
  );

  return (
    <div className="bp-page">
      <div>
        <p className="bp-section-label">
          Finance
        </p>

        <h1 className="bp-heading mt-1 text-3xl font-black">
          Invoices
        </h1>

        <p className="mt-2 text-sm text-[#74827b]">
          Customer-facing invoices generated from approved
          shipper settlements.
        </p>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bp-card p-5">
          <FileText className="size-5 text-[#15905c]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {rows.length}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Total Invoices
          </p>
        </div>

        <div className="bp-card p-5">
          <ReceiptText className="size-5 text-[#65758c]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {draftCount}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Draft
          </p>
        </div>

        <div className="bp-card p-5">
          <Clock3 className="size-5 text-[#d58a27]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {openRows.length}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Open
          </p>

          <p className="mt-2 text-xs font-bold text-[#a66516]">
            {money(
              openValue,
              rows[0]?.currency || "AED",
            )}
          </p>
        </div>

        <div className="bp-card p-5">
          <CheckCircle2 className="size-5 text-[#15905c]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {paidRows.length}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Paid
          </p>
        </div>
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header">
          <h2 className="font-black text-[#26372f]">
            Invoice Register
          </h2>

          <p className="mt-1 text-xs text-[#87938d]">
            Every invoice remains linked to its settlement and
            AWB-level finance records.
          </p>
        </div>

        {error ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            Invoices could not be loaded.
          </p>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto size-8 text-[#a2aea8]" />

            <p className="mt-4 text-sm font-bold text-[#53645c]">
              No invoices yet
            </p>

            <p className="mt-1 text-xs text-[#87938d]">
              Approve a settlement and generate its invoice.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Settlement</th>
                  <th className="px-4 py-3">Shipper</th>
                  <th className="px-4 py-3">AWBs</th>
                  <th className="px-4 py-3">Invoice Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">COD</th>
                  <th className="px-4 py-3">Charges</th>
                  <th className="px-4 py-3">Tax</th>
                  <th className="px-4 py-3">Invoice Total</th>
                  <th className="px-4 py-3">Net Payable</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row) => {
                  const settlement = relation(
                    row.settlement,
                  );

                  const shipper = relation(
                    row.shipper,
                  );

                  const itemCount = Array.isArray(
                    row.invoice_items,
                  )
                    ? row.invoice_items.length
                    : 0;

                  return (
                    <tr
                      key={row.id}
                      className="bp-table-row"
                    >
                      <td className="px-4 py-4">
                        <Link
                          href={`/finance/invoices/${row.id}`}
                          className="font-mono text-xs font-black text-[#13734b]"
                        >
                          {row.invoice_number}
                        </Link>
                      </td>

                      <td className="px-4 py-4 font-mono text-xs">
                        {settlement?.settlement_number ||
                          "—"}
                      </td>

                      <td className="px-4 py-4">
                        <p className="font-bold text-[#34453c]">
                          {shipper?.full_name ||
                            "Shipper"}
                        </p>

                        <p className="mt-1 text-[10px] text-[#87938d]">
                          {shipper?.email || "—"}
                        </p>
                      </td>

                      <td className="px-4 py-4 font-black">
                        {itemCount}
                      </td>

                      <td className="px-4 py-4 text-xs">
                        {row.invoice_date || "—"}
                      </td>

                      <td className="px-4 py-4 text-xs">
                        {row.due_date || "—"}
                      </td>

                      <td className="px-4 py-4 font-bold">
                        {money(
                          row.cod_collected,
                          row.currency,
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {money(
                          (Array.isArray(row.invoice_items)
                            ? row.invoice_items.reduce(
                                (
                                  sum: number,
                                  item: {
                                    delivery_charge?: number | string | null;
                                    return_charge?: number | string | null;
                                  },
                                ) =>
                                  sum +
                                  Number(item.delivery_charge || 0) +
                                  Number(item.return_charge || 0),
                                0,
                              )
                            : 0),
                          row.currency,
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {money(
                          row.tax_amount,
                          row.currency,
                        )}
                      </td>

                      <td className="px-4 py-4 font-black">
                        {money(
                          row.total_amount,
                          row.currency,
                        )}
                      </td>

                      <td className="px-4 py-4 font-black text-[#13734b]">
                        {money(
                          row.net_settlement_payable,
                          row.currency,
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                            row.status === "paid"
                              ? "bg-[#e8f7ef] text-[#13734b]"
                              : row.status === "draft"
                                ? "bg-[#f1f3f2] text-[#69756f]"
                                : row.status === "overdue"
                                  ? "bg-[#fff0f0] text-[#b74646]"
                                  : "bg-[#fff3df] text-[#a66516]"
                          }`}
                        >
                          {String(
                            row.status,
                          ).replaceAll("_", " ")}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <Link
                          href={`/finance/invoices/${row.id}`}
                          className="inline-flex h-9 items-center rounded-lg border border-[#cfe1d7] bg-white px-3 text-[11px] font-bold text-[#13734b] transition hover:bg-[#f2faf6]"
                        >
                          View Invoice
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
