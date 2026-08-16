import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  FileText,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "My Invoices",
};

function money(
  value: number,
  currency = "AED",
) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

export default async function ShipperInvoicesPage() {
  const profile = await requireProfile(["shipper"]);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_number,
      status,
      currency,
      cod_collected,
      total_amount,
      net_settlement_payable,
      invoice_date,
      due_date,
      paid_at,
      payment_reference,
      settlement:settlements!invoices_settlement_id_fkey(
        settlement_number
      )
    `)
    .eq("shipper_id", profile.id)
    .in("status", [
      "issued",
      "sent",
      "paid",
      "overdue",
    ])
    .order("invoice_date", {
      ascending: false,
    });

  const rows = (data ?? []) as any[];

  const openRows = rows.filter(
    (row) => row.status !== "paid",
  );

  const paidRows = rows.filter(
    (row) => row.status === "paid",
  );

  return (
    <div className="bp-page">
      <div>
        <p className="bp-section-label">
          Shipper Portal
        </p>

        <h1 className="bp-heading mt-1 text-3xl font-black">
          My Invoices
        </h1>

        <p className="mt-2 text-sm text-[#74827b]">
          View the same invoices issued by your courier company,
          including AWB-level charges and payment status.
        </p>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="bp-card p-5">
          <FileText className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {rows.length}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Total Invoices
          </p>
        </div>

        <div className="bp-card p-5">
          <Clock3 className="size-5 text-[#d58a27]" />
          <p className="mt-4 text-2xl font-black">
            {openRows.length}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Open
          </p>
        </div>

        <div className="bp-card p-5">
          <CheckCircle2 className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
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
            Invoice History
          </h2>
          <p className="mt-1 text-xs text-[#87938d]">
            Open an invoice to view all included AWBs.
          </p>
        </div>

        {error ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            Invoices could not be loaded.
          </p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No issued invoices available yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Settlement</th>
                  <th className="px-5 py-3">Invoice Date</th>
                  <th className="px-5 py-3">Due Date</th>
                  <th className="px-5 py-3">COD</th>
                  <th className="px-5 py-3">Invoice Total</th>
                  <th className="px-5 py-3">Net Payable</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row) => {
                  const settlement = Array.isArray(row.settlement)
                    ? row.settlement[0] ?? null
                    : row.settlement;

                  return (
                    <tr
                      key={row.id}
                      className="bp-table-row"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/shipper/invoices/${row.id}`}
                          className="font-mono text-xs font-black text-[#13734b]"
                        >
                          {row.invoice_number}
                        </Link>
                      </td>

                      <td className="px-5 py-4 font-mono text-xs">
                        {settlement?.settlement_number || "—"}
                      </td>

                      <td className="px-5 py-4 text-xs">
                        {row.invoice_date}
                      </td>

                      <td className="px-5 py-4 text-xs">
                        {row.due_date || "—"}
                      </td>

                      <td className="px-5 py-4 font-bold">
                        {money(
                          row.cod_collected,
                          row.currency,
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {money(
                          row.total_amount,
                          row.currency,
                        )}
                      </td>

                      <td className="px-5 py-4 font-black text-[#13734b]">
                        {money(
                          row.net_settlement_payable,
                          row.currency,
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                            row.status === "paid"
                              ? "bg-[#e8f7ef] text-[#13734b]"
                              : "bg-[#fff3df] text-[#a66516]"
                          }`}
                        >
                          {row.status.replaceAll("_", " ")}
                        </span>
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
