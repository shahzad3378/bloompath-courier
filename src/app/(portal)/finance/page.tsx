import {
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Truck,
  WalletCards,
} from "lucide-react";
import { ReceiveDriverCodForm } from "@/components/finance-forms";
import {
  createSettlementAction,
  updateSettlementStatusAction,
} from "@/app/(portal)/finance/actions";
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
  shipment_id: number;
  shipper_id: string;
  tracking_number: string;
  cod_amount: number;
  delivery_charge: number;
  return_charge: number;
  total_charges: number;
  net_payable: number;
  transaction_type: string;
  transaction_at: string;
  profiles: {
    full_name: string;
    email: string | null;
  } | null;
};

type SettlementRow = {
  id: number;
  settlement_number: string;
  shipper_id: string;
  status: string;
  total_cod: number;
  total_delivery_charges: number;
  total_return_charges: number;
  total_charges: number;
  net_payable: number;
  period_from: string | null;
  period_to: string | null;
  created_at: string;
  profiles: {
    full_name: string;
    email: string | null;
  } | null;
};

type SettlementItemRow = {
  id: number;
  settlement_id: number;
  ledger_id: number;
  shipment_id: number;
  tracking_number: string;
  cod_amount: number;
  delivery_charge: number;
  return_charge: number;
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
    { data: settlementItemData },
  ] = await Promise.all([
    supabase
      .from("driver_cod_entries")
      .select(
        "id, tracking_number, cod_amount, received_amount, outstanding_amount, delivered_at, cleared_at, driver_id, profiles!driver_cod_entries_driver_id_fkey(full_name, employee_code)",
      )
      .order("delivered_at", { ascending: false }),

    supabase
      .from("finance_ledger")
      .select(
        "id, shipment_id, shipper_id, tracking_number, cod_amount, delivery_charge, return_charge, total_charges, net_payable, transaction_type, transaction_at, profiles!finance_ledger_shipper_id_fkey(full_name, email)",
      )
      .order("transaction_at", { ascending: false }),

    supabase
      .from("settlements")
      .select(
        "id, settlement_number, shipper_id, status, total_cod, total_delivery_charges, total_return_charges, total_charges, net_payable, period_from, period_to, created_at, profiles!settlements_shipper_id_fkey(full_name, email)",
      )
      .order("created_at", { ascending: false }),

    supabase
      .from("settlement_items")
      .select(
        "id, settlement_id, ledger_id, shipment_id, tracking_number, cod_amount, delivery_charge, return_charge, total_charges, net_payable",
      ),
  ]);

  const codRows = (codData ?? []) as unknown as DriverCodRow[];
  const ledgerRows = (ledgerData ?? []) as unknown as FinanceLedgerRow[];
  const settlements = (settlementData ?? []) as unknown as SettlementRow[];
  const settlementItems =
    (settlementItemData ?? []) as unknown as SettlementItemRow[];

  const settledLedgerIds = new Set(
    settlementItems.map((item) => item.ledger_id),
  );

  const unsettledLedgerRows = ledgerRows.filter(
    (row) => !settledLedgerIds.has(row.id),
  );

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

  const totalPayable = unsettledLedgerRows.reduce(
    (sum, row) => sum + Number(row.net_payable),
    0,
  );

  const totalPaid = settlements
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + Number(row.net_payable), 0);

  const shipperSummary = new Map<
    string,
    {
      name: string;
      email: string | null;
      rows: FinanceLedgerRow[];
      totalCod: number;
      deliveryCharges: number;
      returnCharges: number;
      totalCharges: number;
      netPayable: number;
    }
  >();

  for (const row of unsettledLedgerRows) {
    const current = shipperSummary.get(row.shipper_id) ?? {
      name: row.profiles?.full_name ?? "Shipper",
      email: row.profiles?.email ?? null,
      rows: [],
      totalCod: 0,
      deliveryCharges: 0,
      returnCharges: 0,
      totalCharges: 0,
      netPayable: 0,
    };

    current.rows.push(row);
    current.totalCod += Number(row.cod_amount);
    current.deliveryCharges += Number(row.delivery_charge);
    current.returnCharges += Number(row.return_charge);
    current.totalCharges += Number(row.total_charges);
    current.netPayable += Number(row.net_payable);

    shipperSummary.set(row.shipper_id, current);
  }

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

      <section className="mt-7 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
        <div className="border-b border-[#e8eeeb] px-5 py-4">
          <h2 className="font-bold text-[#26372f]">
            Shipper settlements
          </h2>
          <p className="mt-1 text-xs text-[#87938d]">
            Generate seller settlements from unsettled AWBs, then approve and mark them paid.
          </p>
        </div>

        {shipperSummary.size === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center">
            <p className="text-sm text-[#87938d]">
              No unsettled shipper AWBs available.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#edf1ef]">
            {[...shipperSummary.entries()].map(([shipperId, shipper]) => (
              <form
                key={shipperId}
                action={createSettlementAction}
                className="p-5"
              >
                <input
                  type="hidden"
                  name="shipper_id"
                  value={shipperId}
                />

                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div>
                    <h3 className="text-lg font-bold text-[#26372f]">
                      {shipper.name}
                    </h3>
                    <p className="mt-1 text-xs text-[#87938d]">
                      {shipper.email || "No email"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                        AWBs
                      </p>
                      <p className="mt-1 font-black text-[#26372f]">
                        {shipper.rows.length}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                        COD
                      </p>
                      <p className="mt-1 font-black text-[#26372f]">
                        {money(shipper.totalCod)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                        Delivery
                      </p>
                      <p className="mt-1 font-black text-[#26372f]">
                        {money(shipper.deliveryCharges)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                        Return
                      </p>
                      <p className="mt-1 font-black text-[#26372f]">
                        {money(shipper.returnCharges)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                        Net payable
                      </p>
                      <p className="mt-1 font-black text-[#13734b]">
                        {money(shipper.netPayable)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto rounded-xl border border-[#e4ebe7]">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-wide text-[#77847e]">
                      <tr>
                        <th className="px-4 py-3">
                          Select
                        </th>
                        <th className="px-4 py-3">
                          AWB
                        </th>
                        <th className="px-4 py-3">
                          Type
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
                          Net payable
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#edf1ef]">
                      {shipper.rows.map((row) => (
                        <tr key={row.id} className="text-sm">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              name="ledger_id"
                              value={row.id}
                              defaultChecked
                              className="size-4"
                            />
                          </td>

                          <td className="px-4 py-3">
                            <p className="font-mono font-black text-[#13734b]">
                              {row.tracking_number}
                            </p>
                            <p className="mt-1 text-[11px] text-[#87938d]">
                              {formatDubaiDate(row.transaction_at)}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-xs font-semibold capitalize text-[#68766f]">
                            {row.transaction_type.replaceAll("_", " ")}
                          </td>

                          <td className="px-4 py-3 font-bold">
                            {money(row.cod_amount)}
                          </td>

                          <td className="px-4 py-3 font-bold">
                            {money(row.delivery_charge)}
                          </td>

                          <td className="px-4 py-3 font-bold">
                            {money(row.return_charge)}
                          </td>

                          <td className="px-4 py-3 font-bold text-[#b76223]">
                            {money(row.total_charges)}
                          </td>

                          <td className="px-4 py-3 font-black text-[#13734b]">
                            {money(row.net_payable)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex justify-end">
                  <button className="h-10 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white">
                    Generate settlement
                  </button>
                </div>
              </form>
            ))}
          </div>
        )}
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
        <div className="border-b border-[#e8eeeb] px-5 py-4">
          <h2 className="font-bold text-[#26372f]">
            Settlement history
          </h2>
          <p className="mt-1 text-xs text-[#87938d]">
            Draft, approved, paid and cancelled shipper settlements.
          </p>
        </div>

        {settlements.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center">
            <p className="text-sm text-[#87938d]">
              No settlements generated yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#edf1ef]">
            {settlements.map((settlement) => {
              const items = settlementItems.filter(
                (item) => item.settlement_id === settlement.id,
              );

              return (
                <div key={settlement.id} className="p-5">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div>
                      <p className="font-mono text-sm font-black text-[#13734b]">
                        {settlement.settlement_number}
                      </p>
                      <p className="mt-1 font-bold text-[#26372f]">
                        {settlement.profiles?.full_name ?? "Shipper"}
                      </p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        Created {formatDubaiDate(settlement.created_at)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                          AWBs
                        </p>
                        <p className="mt-1 font-black">
                          {items.length}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                          COD
                        </p>
                        <p className="mt-1 font-black">
                          {money(settlement.total_cod)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                          Charges
                        </p>
                        <p className="mt-1 font-black text-[#b76223]">
                          {money(settlement.total_charges)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                          Net payable
                        </p>
                        <p className="mt-1 font-black text-[#13734b]">
                          {money(settlement.net_payable)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                          Status
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                            settlement.status === "paid"
                              ? "bg-[#e5f3eb] text-[#16724b]"
                              : settlement.status === "approved"
                                ? "bg-[#e7effb] text-[#356aa6]"
                                : settlement.status === "cancelled"
                                  ? "bg-[#f8eeee] text-[#a34b4b]"
                                  : "bg-[#fff0d8] text-[#976019]"
                          }`}
                        >
                          {settlement.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {items.length > 0 ? (
                    <details className="mt-4 rounded-xl border border-[#e4ebe7]">
                      <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-[#526159]">
                        View AWB details
                      </summary>

                      <div className="overflow-x-auto border-t border-[#e8eeeb]">
                        <table className="w-full min-w-[800px] text-left">
                          <thead className="bg-[#f8faf9] text-[11px] uppercase tracking-wide text-[#77847e]">
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
                                Net
                              </th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-[#edf1ef]">
                            {items.map((item) => (
                              <tr key={item.id} className="text-sm">
                                <td className="px-4 py-3 font-mono font-black text-[#13734b]">
                                  {item.tracking_number}
                                </td>
                                <td className="px-4 py-3">
                                  {money(item.cod_amount)}
                                </td>
                                <td className="px-4 py-3">
                                  {money(item.delivery_charge)}
                                </td>
                                <td className="px-4 py-3">
                                  {money(item.return_charge)}
                                </td>
                                <td className="px-4 py-3">
                                  {money(item.total_charges)}
                                </td>
                                <td className="px-4 py-3 font-black">
                                  {money(item.net_payable)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {settlement.status === "draft" ? (
                      <>
                        <form action={updateSettlementStatusAction}>
                          <input
                            type="hidden"
                            name="settlement_id"
                            value={settlement.id}
                          />
                          <input
                            type="hidden"
                            name="status"
                            value="approved"
                          />
                          <button className="h-9 rounded-lg bg-[#376eb1] px-4 text-xs font-bold text-white">
                            Approve
                          </button>
                        </form>

                        <form action={updateSettlementStatusAction}>
                          <input
                            type="hidden"
                            name="settlement_id"
                            value={settlement.id}
                          />
                          <input
                            type="hidden"
                            name="status"
                            value="cancelled"
                          />
                          <button className="h-9 rounded-lg border border-[#e2c8c8] bg-white px-4 text-xs font-bold text-[#a13f3f]">
                            Cancel
                          </button>
                        </form>
                      </>
                    ) : null}

                    {settlement.status === "approved" ? (
                      <>
                        <form action={updateSettlementStatusAction}>
                          <input
                            type="hidden"
                            name="settlement_id"
                            value={settlement.id}
                          />
                          <input
                            type="hidden"
                            name="status"
                            value="paid"
                          />
                          <button className="h-9 rounded-lg bg-[#13734b] px-4 text-xs font-bold text-white">
                            Mark Paid
                          </button>
                        </form>

                        <form action={updateSettlementStatusAction}>
                          <input
                            type="hidden"
                            name="settlement_id"
                            value={settlement.id}
                          />
                          <input
                            type="hidden"
                            name="status"
                            value="cancelled"
                          />
                          <button className="h-9 rounded-lg border border-[#e2c8c8] bg-white px-4 text-xs font-bold text-[#a13f3f]">
                            Cancel
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
