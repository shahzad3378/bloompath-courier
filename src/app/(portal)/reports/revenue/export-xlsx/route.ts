import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import {
  rowCurrency,
  sumByCurrency,
  type CurrencyAmount,
} from "@/lib/currency";
import { internalRoles } from "@/lib/roles";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const profile = await requireProfile(internalRoles);
  const supabase = await createClient();

  const { data } = await supabase
    .from("finance_ledger")
    .select(`
      tracking_number,
      currency,
      cod_amount,
      delivery_charge,
      return_charge,
      total_charges,
      net_payable,
      transaction_type,
      transaction_at
    `)
    .eq("organization_id", profile.organization_id)
    .order("transaction_at", { ascending: false });

  const rows = data ?? [];
  const organizationCurrency = await resolveOrganizationCurrency(
    supabase,
    profile.organization_id!,
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Revenue Report");

  sheet.addRow(["Revenue Report"]);
  sheet.addRow([
    "Organization currency",
    rowCurrency(null, organizationCurrency),
  ]);
  sheet.addRow([]);

  sheet.addRow([
    "AWB",
    "Transaction",
    "Date",
    "Currency",
    "COD",
    "Delivery Charge",
    "Return Charge",
    "Total Charges",
    "Net Payable",
  ]);

  for (const row of rows) {
    sheet.addRow([
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

  sheet.addRow([]);

  const grouped = [
    ["Total COD", sumByCurrency(rows, (row) => row.cod_amount, (row) => row.currency, organizationCurrency)],
    ["Delivery Charges", sumByCurrency(rows, (row) => row.delivery_charge, (row) => row.currency, organizationCurrency)],
    ["Return Charges", sumByCurrency(rows, (row) => row.return_charge, (row) => row.currency, organizationCurrency)],
    ["Total Charges", sumByCurrency(rows, (row) => row.total_charges, (row) => row.currency, organizationCurrency)],
    ["Net Payable", sumByCurrency(rows, (row) => row.net_payable, (row) => row.currency, organizationCurrency)],
  ] as const;

  sheet.addRow(["Metric", "Currency", "Amount"]);

  for (const [label, totals] of grouped) {
    const lines: CurrencyAmount[] = totals.length
      ? [...totals]
      : [{
          currency: rowCurrency(null, organizationCurrency),
          amount: 0,
        }];

    for (const total of lines) {
      sheet.addRow([label, total.currency, total.amount]);
    }
  }

  sheet.columns.forEach((column) => {
    column.width = 20;
  });

  sheet.getColumn(1).width = 24;

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="revenue-report.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
