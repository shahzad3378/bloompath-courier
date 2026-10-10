import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import {
  rowCurrency,
  sumByCurrency,
  type CurrencyAmount,
} from "@/lib/currency";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";

const roles = [
  "super_admin",
  "operations_admin",
  "finance_staff",
] as const;

function linesFor(
  totals: CurrencyAmount[],
  organizationCurrency: string,
) {
  return totals.length
    ? totals
    : [{
        currency: rowCurrency(null, organizationCurrency),
        amount: 0,
      }];
}

export async function GET() {
  const profile = await requireProfile(roles);
  const supabase = await createClient();

  const [
    { data: ledger },
    { data: settlements },
    organizationCurrency,
  ] = await Promise.all([
    supabase
      .from("finance_ledger")
      .select("tracking_number,transaction_type,transaction_at,currency,cod_amount,delivery_charge,return_charge,total_charges,net_payable")
      .eq("organization_id", profile.organization_id)
      .order("transaction_at", { ascending: false }),
    supabase
      .from("settlements")
      .select("settlement_number,status,currency,total_cod,total_charges,net_payable,created_at")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false }),
    resolveOrganizationCurrency(
      supabase,
      profile.organization_id!,
    ),
  ]);

  const transactions = ledger ?? [];
  const settlementRows = settlements ?? [];
  const workbook = new ExcelJS.Workbook();
  const tx = workbook.addWorksheet("Transactions");

  tx.addRow(["Finance Transactions"]);
  tx.addRow([
    "Organization currency",
    rowCurrency(null, organizationCurrency),
  ]);
  tx.addRow([]);
  tx.addRow([
    "AWB",
    "Type",
    "Date",
    "Currency",
    "COD",
    "Delivery Charge",
    "Return Charge",
    "Total Charges",
    "Net Payable",
  ]);

  for (const row of transactions) {
    tx.addRow([
      row.tracking_number,
      row.transaction_type,
      row.transaction_at,
      rowCurrency(row.currency, organizationCurrency),
      Number(row.cod_amount || 0),
      Number(row.delivery_charge || 0),
      Number(row.return_charge || 0),
      Number(row.total_charges || 0),
      Number(row.net_payable || 0),
    ]);
  }

  const transactionTotals = [
    ["COD", sumByCurrency(transactions, (row) => row.cod_amount, (row) => row.currency, organizationCurrency)],
    ["Delivery Charge", sumByCurrency(transactions, (row) => row.delivery_charge, (row) => row.currency, organizationCurrency)],
    ["Return Charge", sumByCurrency(transactions, (row) => row.return_charge, (row) => row.currency, organizationCurrency)],
    ["Total Charges", sumByCurrency(transactions, (row) => row.total_charges, (row) => row.currency, organizationCurrency)],
    ["Net Payable", sumByCurrency(transactions, (row) => row.net_payable, (row) => row.currency, organizationCurrency)],
  ] as const;

  tx.addRow([]);
  tx.addRow(["Totals by currency"]);
  tx.addRow(["Metric", "Currency", "Amount"]);

  for (const [label, totals] of transactionTotals) {
    for (const total of linesFor(totals, organizationCurrency)) {
      tx.addRow([label, total.currency, total.amount]);
    }
  }

  tx.columns.forEach((column) => {
    column.width = 20;
  });
  tx.getColumn(1).width = 24;

  const st = workbook.addWorksheet("Settlements");
  st.addRow(["Settlement History"]);
  st.addRow([
    "Organization currency",
    rowCurrency(null, organizationCurrency),
  ]);
  st.addRow([]);
  st.addRow([
    "Settlement",
    "Status",
    "Created",
    "Currency",
    "Total COD",
    "Charges",
    "Net Payable",
  ]);

  for (const row of settlementRows) {
    st.addRow([
      row.settlement_number,
      row.status,
      row.created_at,
      rowCurrency(row.currency, organizationCurrency),
      Number(row.total_cod || 0),
      Number(row.total_charges || 0),
      Number(row.net_payable || 0),
    ]);
  }

  const settlementTotals = [
    ["Total COD", sumByCurrency(settlementRows, (row) => row.total_cod, (row) => row.currency, organizationCurrency)],
    ["Charges", sumByCurrency(settlementRows, (row) => row.total_charges, (row) => row.currency, organizationCurrency)],
    ["Net Payable", sumByCurrency(settlementRows, (row) => row.net_payable, (row) => row.currency, organizationCurrency)],
  ] as const;

  st.addRow([]);
  st.addRow(["Totals by currency"]);
  st.addRow(["Metric", "Currency", "Amount"]);

  for (const [label, totals] of settlementTotals) {
    for (const total of linesFor(totals, organizationCurrency)) {
      st.addRow([label, total.currency, total.amount]);
    }
  }

  st.columns.forEach((column) => {
    column.width = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);

  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="finance-transactions-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
