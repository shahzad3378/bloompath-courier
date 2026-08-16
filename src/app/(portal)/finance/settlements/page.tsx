import {
  CheckCircle2,
  Clock3,
  FilePlus2,
  WalletCards,
} from "lucide-react";
import { createInvoiceFromSettlementAction } from "@/app/(portal)/finance/actions";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settlements" };

const financeRoles = [
  "super_admin",
  "operations_admin",
  "finance_staff",
] as const;

function money(value: number) {
  return `AED ${Number(value || 0).toFixed(2)}`;
}

export default async function SettlementsPage() {
  await requireProfile(financeRoles);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("settlements")
    .select(`
      id,
      settlement_number,
      shipper_id,
      status,
      total_cod,
      total_delivery_charges,
      total_return_charges,
      total_charges,
      net_payable,
      period_from,
      period_to,
      created_at,
      profiles!settlements_shipper_id_fkey(
        full_name,
        email
      )
    `)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as any[];

  const pending = rows.filter(
    (row) => row.status !== "paid",
  );

  const paid = rows.filter(
    (row) => row.status === "paid",
  );

  const pendingValue = pending.reduce(
    (sum, row) => sum + Number(row.net_payable || 0),
    0,
  );

  const paidValue = paid.reduce(
    (sum, row) => sum + Number(row.net_payable || 0),
    0,
  );

  return (
    <div className="bp-page">
      <div>
        <p className="bp-section-label">Finance</p>

        <h1 className="bp-heading mt-1 text-3xl font-black">
          Settlements
        </h1>

        <p className="mt-2 text-sm text-[#74827b]">
          Review shipper settlement batches and payable amounts.
        </p>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="bp-card p-5">
          <WalletCards className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {rows.length}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Total Settlements
          </p>
        </div>

        <div className="bp-card p-5">
          <Clock3 className="size-5 text-[#d58a27]" />
          <p className="mt-4 text-2xl font-black">
            {money(pendingValue)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Pending Payable
          </p>
        </div>

        <div className="bp-card p-5">
          <CheckCircle2 className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {money(paidValue)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Paid
          </p>
        </div>
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header">
          <h2 className="font-black text-[#26372f]">
            Settlement History
          </h2>

          <p className="mt-1 text-xs text-[#87938d]">
            Shipper-wise payment batches.
          </p>
        </div>

        {error ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            Settlements could not be loaded.
          </p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No settlements created yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-5 py-3">Settlement</th>
                  <th className="px-5 py-3">Shipper</th>
                  <th className="px-5 py-3">Period</th>
                  <th className="px-5 py-3">COD</th>
                  <th className="px-5 py-3">Charges</th>
                  <th className="px-5 py-3">Net Payable</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Invoice</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row) => (
                  <tr key={row.id} className="bp-table-row">
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs font-black text-[#15905c]">
                        {row.settlement_number}
                      </p>

                      <p className="mt-1 text-[10px] text-[#87938d]">
                        {formatDubaiDate(row.created_at)}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-bold text-[#34453c]">
                        {row.profiles?.full_name || "Shipper"}
                      </p>

                      <p className="mt-1 text-[10px] text-[#87938d]">
                        {row.profiles?.email || "—"}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-xs text-[#65736c]">
                      {row.period_from
                        ? formatDubaiDate(row.period_from)
                        : "—"}
                      {" → "}
                      {row.period_to
                        ? formatDubaiDate(row.period_to)
                        : "—"}
                    </td>

                    <td className="px-5 py-4 font-bold">
                      {money(row.total_cod)}
                    </td>

                    <td className="px-5 py-4">
                      {money(row.total_charges)}
                    </td>

                    <td className="px-5 py-4 font-black text-[#13734b]">
                      {money(row.net_payable)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                          row.status === "paid"
                            ? "bg-[#e8f7ef] text-[#13734b]"
                            : row.status === "approved"
                              ? "bg-[#eef4ff] text-[#46639b]"
                              : "bg-[#fff3df] text-[#a66516]"
                        }`}
                      >
                        {row.status.replaceAll("_", " ")}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {row.status === "approved" ? (
                        <form
                          action={createInvoiceFromSettlementAction}
                          className="flex min-w-[330px] items-center gap-2"
                        >
                          <input
                            type="hidden"
                            name="settlement_id"
                            value={row.id}
                          />

                          <input
                            type="date"
                            name="due_date"
                            className="h-9 rounded-lg border border-[#dbe5e0] px-2 text-[11px]"
                          />

                          <input
                            type="number"
                            name="tax_rate"
                            min="0"
                            max="100"
                            step="0.001"
                            defaultValue="0"
                            placeholder="Tax %"
                            className="h-9 w-20 rounded-lg border border-[#dbe5e0] px-2 text-[11px]"
                          />

                          <input
                            type="email"
                            name="recipient_email"
                            defaultValue={row.profiles?.email || ""}
                            placeholder="Email"
                            className="h-9 min-w-40 rounded-lg border border-[#dbe5e0] px-2 text-[11px]"
                          />

                          <button
                            type="submit"
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#13734b] px-3 text-[11px] font-bold text-white"
                          >
                            <FilePlus2 className="size-3.5" />
                            Generate
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-[#9aa49f]">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
