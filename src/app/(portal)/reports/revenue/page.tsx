import Link from "next/link";
import {
  BadgeDollarSign,
  CircleDollarSign,
  Download,
  FileText,
  WalletCards,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Revenue Reports",
};

function money(
  value: unknown,
  currency = "AED",
) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

export default async function RevenueReportsPage() {
  const profile = await requireProfile(internalRoles);

  const supabase = await createClient();

  const [
    { data: ledgerData },
    { data: settlementData },
  ] = await Promise.all([
    supabase
      .from("finance_ledger")
      .select(`
        id,
        tracking_number,
        currency,
        cod_amount,
        delivery_charge,
        return_charge,
        total_charges,
        net_payable,
        transaction_at
      `)
      .eq("organization_id", profile.organization_id)
      .order("transaction_at", {
        ascending: false,
      }),

    supabase
      .from("settlements")
      .select(`
        id,
        status,
        currency,
        net_payable
      `)
      .eq("organization_id", profile.organization_id),
  ]);

  const rows = ledgerData ?? [];

  const currency =
    rows[0]?.currency ||
    settlementData?.[0]?.currency ||
    "AED";

  const totalCod = rows.reduce(
    (sum, row) =>
      sum + Number(row.cod_amount || 0),
    0,
  );

  const deliveryCharges = rows.reduce(
    (sum, row) =>
      sum + Number(row.delivery_charge || 0),
    0,
  );

  const returnCharges = rows.reduce(
    (sum, row) =>
      sum + Number(row.return_charge || 0),
    0,
  );

  const totalCharges = rows.reduce(
    (sum, row) =>
      sum + Number(row.total_charges || 0),
    0,
  );

  const netPayable = rows.reduce(
    (sum, row) =>
      sum + Number(row.net_payable || 0),
    0,
  );

  const paid = (settlementData ?? [])
    .filter(
      (row) => row.status === "paid",
    )
    .reduce(
      (sum, row) =>
        sum + Number(row.net_payable || 0),
      0,
    );

  return (
    <div className="bp-page">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="bp-section-label">
            Reports
          </p>

          <h1 className="bp-heading mt-1 text-3xl font-black">
            Revenue Reports
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            COD movement, courier revenue and shipper payable
            at AWB level.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/reports/revenue/export-pdf"
            className="bp-button-secondary"
          >
            <FileText className="size-4" />
            PDF
          </Link>

          <Link
            href="/reports/revenue/export-xlsx"
            className="bp-button-secondary"
          >
            <Download className="size-4" />
            Excel
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bp-card p-5">
          <CircleDollarSign className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {money(totalCod, currency)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            COD Value
          </p>
        </div>

        <div className="bp-card p-5">
          <BadgeDollarSign className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {money(totalCharges, currency)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Courier Charges
          </p>
        </div>

        <div className="bp-card p-5">
          <WalletCards className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {money(netPayable, currency)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Shipper Payable
          </p>
        </div>

        <div className="bp-card p-5">
          <WalletCards className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {money(paid, currency)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Paid
          </p>
        </div>
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header">
          <h2 className="font-black text-[#26372f]">
            AWB Revenue Detail
          </h2>

          <p className="mt-1 text-xs text-[#87938d]">
            Delivery and return charge breakdown per finance ledger
            transaction.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No revenue transactions available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-4 py-3">
                    AWB
                  </th>
                  <th className="px-4 py-3">
                    COD
                  </th>
                  <th className="px-4 py-3">
                    Delivery
                  </th>
                  <th className="px-4 py-3">
                    Return
                  </th>
                  <th className="px-4 py-3">
                    Charges
                  </th>
                  <th className="px-4 py-3">
                    Net Payable
                  </th>
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

                    <td className="px-4 py-4">
                      {money(
                        row.cod_amount,
                        row.currency,
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {money(
                        row.delivery_charge,
                        row.currency,
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {money(
                        row.return_charge,
                        row.currency,
                      )}
                    </td>

                    <td className="px-4 py-4 font-bold">
                      {money(
                        row.total_charges,
                        row.currency,
                      )}
                    </td>

                    <td className="px-4 py-4 font-black text-[#13734b]">
                      {money(
                        row.net_payable,
                        row.currency,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-[#edf1ef] bg-[#fafcfb] p-5">
          <div className="ml-auto grid max-w-lg gap-2 text-sm">
            <div className="flex justify-between">
              <span>
                Delivery charges
              </span>
              <strong>
                {money(
                  deliveryCharges,
                  currency,
                )}
              </strong>
            </div>

            <div className="flex justify-between">
              <span>
                Return charges
              </span>
              <strong>
                {money(
                  returnCharges,
                  currency,
                )}
              </strong>
            </div>

            <div className="flex justify-between border-t border-[#dfe7e3] pt-2">
              <span className="font-black">
                Total Charges
              </span>
              <strong className="text-[#13734b]">
                {money(
                  totalCharges,
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
