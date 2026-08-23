import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
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
  const currency =
    rows[0]?.currency ||
    (await resolveOrganizationCurrency(
      supabase,
      profile.organization_id!,
    ));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Revenue Report");

  sheet.addRow(["Revenue Report"]);
  sheet.addRow(["Currency", currency]);
  sheet.addRow([]);

  sheet.addRow([
    "AWB",
    "Transaction",
    "Date",
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
      Number(row.cod_amount || 0),
      Number(row.delivery_charge || 0),
      Number(row.return_charge || 0),
      Number(row.total_charges || 0),
      Number(row.net_payable || 0),
    ]);
  }

  sheet.addRow([]);

  const totalCod = rows.reduce(
    (sum, row) => sum + Number(row.cod_amount || 0),
    0,
  );

  const delivery = rows.reduce(
    (sum, row) => sum + Number(row.delivery_charge || 0),
    0,
  );

  const returns = rows.reduce(
    (sum, row) => sum + Number(row.return_charge || 0),
    0,
  );

  const charges = rows.reduce(
    (sum, row) => sum + Number(row.total_charges || 0),
    0,
  );

  const net = rows.reduce(
    (sum, row) => sum + Number(row.net_payable || 0),
    0,
  );

  sheet.addRow(["", "", "Total COD", totalCod]);
  sheet.addRow(["", "", "Delivery Charges", delivery]);
  sheet.addRow(["", "", "Return Charges", returns]);
  sheet.addRow(["", "", "Total Charges", charges]);
  sheet.addRow(["", "", "Net Payable", net]);

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
