import {
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Truck,
  WalletCards,
} from "lucide-react";
import { ReceiveDriverCodForm } from "@/components/finance-forms";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "COD & Finance" };

const financeRoles = ["super_admin", "operations_admin", "finance_staff"] as const;

type DriverCodRow = {
  id: number;
  tracking_number: string;
  cod_amount: number;
  received_amount: number;
  outstanding_amount: number;
  delivered_at: string;
  cleared_at: string | null;
  driver_id: string;
  profiles: {
    full_name: string;
    employee_code: string | null;
  } | null;
};

type FinanceLedgerRow = {
  id: number;
  cod_amount: number;
  total_charges: number;
  net_payable: number;
  transaction_type: string;
};

type SettlementRow = {
  id: number;
  status: string;
  total_cod: number;
  total_charges: number;
  net_payable: number;
};

function money(value: number) {
  return `AED ${Number(value || 0).toFixed(2)}`;
}

export default async function FinancePage() {
  await requireProfile(financeRoles);

  const supabase = await createClient();

  const [
    { data: codData, error: codError },
    { data: ledgerData },
    { data: settlementData },
  ] = await Promise.all([
    supabase
      .from("driver_cod_entries")
      .select(
        "id, tracking_number, cod_amount, received_amount, outstanding_amount, delivered_at, cleared_at, driver_id, profiles!driver_cod_entries_driver_id_fkey(full_name, employee_code)",
      )
      .order("delivered_at", { ascending: false }),

    supabase
      .from("finance_ledger")
      .select("id, cod_amount, total_charges, net_payable, transaction_type")
      .order("transaction_at", { ascending: false }),

    supabase
      .from("settlements")
      .select("id, status, total_cod, total_charges, net_payable"),
  ]);

  const codRows = (codData ?? []) as unknown as DriverCodRow[];
  const ledgerRows = (ledgerData ?? []) as FinanceLedgerRow[];
  const settlements = (settlementData ?? []) as SettlementRow[];

  const totalCodDelivered = codRows.reduce(
    (sum, row) => sum + Number(row.cod_amount),
    0,
  );

  const totalReceived = codRows.reduce(
    (sum, row) => sum + Number(row.received_amount),
    0,
  );

  const totalOutstanding = codRows.reduce(
    (sum, row) => sum + Number(row.outstanding_amount),
    0,
  );

  const totalCharges = ledgerRows.reduce(
    (sum, row) => sum + Number(row.total_charges),
    0,
  );

  const totalPayable = ledgerRows.reduce(
    (sum, row) => sum + Number(row.net_payable),
    0,
  );

  const totalPaid = settlements
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + Number(row.net_payable), 0);

  const driverSummary = new Map<
    string,
    {
      name: string;
      employeeCode: string | null;
      total: number;
      received: number;
      outstanding: number;
      count: number;
    }
  >();

  for (const row of codRows) {
    const current = driverSummary.get(row.driver_id) ?? {
      name: row.profiles?.full_name ?? "Driver",
      employeeCode: row.profiles?.employee_code ?? null,
      total: 0,
      received: 0,
      outstanding: 0,
      count: 0,
    };

    current.total += Number(row.cod_amount);
    current.received += Number(row.received_amount);
    current.outstanding += Number(row.outstanding_amount);
    current.count += 1;

    driverSummary.set(row.driver_id, current);
  }

  return (
    <div className="mx-auto max-w-[1450px]">
      <div>
        <p className="text-sm font-semibold text-[#188459]">
          Cash operations
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
          COD & Finance
        </h1>
        <p className="mt-2 text-sm text-[#74827b]">
          Track COD from customer delivery through driver custody and shipper settlement.
        </p>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {([
          { label: "Total COD Delivered", value: money(totalCodDelivered), icon: CircleDollarSign },
          { label: "COD With Drivers", value: money(totalOutstanding), icon: Truck },
          { label: "COD Received", value: money(totalReceived), icon: Banknote },
          { label: "Courier Charges", value: money(totalCharges), icon: BadgeDollarSign },
          { label: "Shipper Payable", value: money(totalPayable), icon: WalletCards },
          { label: "Shipper Paid", value: money(totalPaid), icon: CheckCircle2 },
        ] as const).map((card) => {
          const CardIcon = card.icon;

          return (
            <div
              key={card.label}
              className="rounded-2xl border border-[#e0e8e4] bg-white p-4"
            >
              <div className="flex items-center gap-2">
                <CardIcon className="size-4 text-[#13734b]" />
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                  {card.label}
                </p>
              </div>
              <p className="mt-3 text-xl font-black text-[#26372f]">
                {card.value}
              </p>
            </div>
          );
        })}
      </div>

      <section className="mt-7 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
        <div className="border-b border-[#e8eeeb] px-5 py-4">
          <h2 className="font-bold text-[#26372f]">
            Driver COD summary
          </h2>
          <p className="mt-1 text-xs text-[#87938d]">
            Driver-wise COD collected, received and still outstanding.
          </p>
        </div>

        {driverSummary.size === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center">
            <p className="text-sm text-[#87938d]">
              No driver COD activity yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-wide text-[#77847e]">
                <tr>
                  <th className="px-5 py-3.5">Driver</th>
                  <th className="px-5 py-3.5">AWBs</th>
                  <th className="px-5 py-3.5">Collected</th>
                  <th className="px-5 py-3.5">Received</th>
                  <th className="px-5 py-3.5">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ef]">
                {[...driverSummary.entries()].map(([driverId, row]) => (
                  <tr key={driverId} className="text-sm">
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#26372f]">{row.name}</p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        {row.employeeCode || "No employee code"}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-bold">{row.count}</td>
                    <td className="px-5 py-4 font-bold text-[#405048]">
                      {money(row.total)}
                    </td>
                    <td className="px-5 py-4 font-bold text-[#13734b]">
                      {money(row.received)}
                    </td>
                    <td className="px-5 py-4 font-black text-[#b76223]">
                      {money(row.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
        <div className="border-b border-[#e8eeeb] px-5 py-4">
          <h2 className="font-bold text-[#26372f]">
            AWB-wise Driver COD
          </h2>
          <p className="mt-1 text-xs text-[#87938d]">
            Receive full or partial COD against each delivered AWB.
          </p>
        </div>

        {codError ? (
          <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
            Driver COD could not be loaded.
          </p>
        ) : codRows.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center">
            <p className="text-sm text-[#87938d]">
              No COD AWBs available.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#edf1ef]">
            {codRows.map((row) => (
              <div
                key={row.id}
                className="grid gap-5 p-5 xl:grid-cols-[1.4fr_1fr_360px]"
              >
                <div>
                  <p className="font-mono text-sm font-black text-[#13734b]">
                    {row.tracking_number}
                  </p>
                  <p className="mt-2 font-bold text-[#26372f]">
                    {row.profiles?.full_name ?? "Driver"}
                  </p>
                  <p className="mt-1 text-xs text-[#87938d]">
                    Delivered {formatDubaiDate(row.delivered_at)}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-[#87938d]">COD</p>
                    <p className="mt-1 font-black">{money(row.cod_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#87938d]">Received</p>
                    <p className="mt-1 font-black text-[#13734b]">
                      {money(row.received_amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#87938d]">Outstanding</p>
                    <p className="mt-1 font-black text-[#b76223]">
                      {money(row.outstanding_amount)}
                    </p>
                  </div>
                </div>

                <div>
                  {Number(row.outstanding_amount) > 0 ? (
                    <ReceiveDriverCodForm
                      entryId={row.id}
                      outstanding={Number(row.outstanding_amount)}
                    />
                  ) : (
                    <div className="flex h-full min-h-28 items-center justify-center rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] p-4 text-sm font-bold text-[#176a47]">
                      COD Cleared
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
