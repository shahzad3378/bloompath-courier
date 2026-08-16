import {
  Banknote,
  CircleDollarSign,
  Truck,
} from "lucide-react";
import { ReceiveDriverCodForm } from "@/components/finance-forms";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "COD Management" };

const financeRoles = [
  "super_admin",
  "operations_admin",
  "finance_staff",
] as const;

function money(value: number) {
  return `AED ${Number(value || 0).toFixed(2)}`;
}

export default async function CodManagementPage() {
  await requireProfile(financeRoles);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("driver_cod_entries")
    .select(`
      id,
      tracking_number,
      cod_amount,
      received_amount,
      outstanding_amount,
      delivered_at,
      cleared_at,
      driver_id,
      profiles!driver_cod_entries_driver_id_fkey(
        full_name,
        employee_code
      )
    `)
    .order("delivered_at", { ascending: false });

  const rows = (data ?? []) as any[];

  const totalCod = rows.reduce(
    (sum, row) => sum + Number(row.cod_amount || 0),
    0,
  );

  const totalReceived = rows.reduce(
    (sum, row) => sum + Number(row.received_amount || 0),
    0,
  );

  const totalOutstanding = rows.reduce(
    (sum, row) => sum + Number(row.outstanding_amount || 0),
    0,
  );

  return (
    <div className="bp-page">
      <div>
        <p className="bp-section-label">Finance</p>

        <h1 className="bp-heading mt-1 text-3xl font-black">
          COD Management
        </h1>

        <p className="mt-2 text-sm text-[#74827b]">
          Track cash collected by drivers and receive full or partial COD.
        </p>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "COD Delivered",
            value: money(totalCod),
            icon: CircleDollarSign,
          },
          {
            label: "Received",
            value: money(totalReceived),
            icon: Banknote,
          },
          {
            label: "With Drivers",
            value: money(totalOutstanding),
            icon: Truck,
          },
        ].map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.label} className="bp-card p-5">
              <Icon className="size-5 text-[#15905c]" />

              <p className="mt-4 text-2xl font-black text-[#26372f]">
                {card.value}
              </p>

              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                {card.label}
              </p>
            </div>
          );
        })}
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header">
          <h2 className="font-black text-[#26372f]">
            Driver COD Transactions
          </h2>

          <p className="mt-1 text-xs text-[#87938d]">
            AWB-wise cash custody and reconciliation.
          </p>
        </div>

        {error ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            COD transactions could not be loaded.
          </p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No COD transactions available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-5 py-3">AWB</th>
                  <th className="px-5 py-3">Driver</th>
                  <th className="px-5 py-3">Delivered</th>
                  <th className="px-5 py-3">COD</th>
                  <th className="px-5 py-3">Received</th>
                  <th className="px-5 py-3">Outstanding</th>
                  <th className="px-5 py-3">Receive</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row) => (
                  <tr key={row.id} className="bp-table-row">
                    <td className="px-5 py-4 font-mono text-xs font-black text-[#15905c]">
                      {row.tracking_number}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-bold text-[#34453c]">
                        {row.profiles?.full_name || "Driver"}
                      </p>

                      <p className="mt-1 text-[10px] text-[#87938d]">
                        {row.profiles?.employee_code || "—"}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-xs text-[#65736c]">
                      {formatDubaiDate(row.delivered_at)}
                    </td>

                    <td className="px-5 py-4 font-bold">
                      {money(row.cod_amount)}
                    </td>

                    <td className="px-5 py-4 font-bold text-[#15905c]">
                      {money(row.received_amount)}
                    </td>

                    <td className="px-5 py-4 font-black text-[#b76223]">
                      {money(row.outstanding_amount)}
                    </td>

                    <td className="px-5 py-4">
                      {Number(row.outstanding_amount) > 0 ? (
                        <ReceiveDriverCodForm
                          entryId={row.id}
                          outstanding={Number(
                            row.outstanding_amount,
                          )}
                        />
                      ) : (
                        <span className="rounded-full bg-[#e8f7ef] px-2.5 py-1 text-[10px] font-black text-[#13734b]">
                          CLEARED
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
