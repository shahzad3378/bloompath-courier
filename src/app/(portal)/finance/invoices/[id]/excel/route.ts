import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const financeRoles = [
  "super_admin",
  "operations_admin",
  "finance_staff",
] as const;

function relation<T>(
  value: T | T[] | null | undefined,
): T | null {
  return Array.isArray(value)
    ? value[0] ?? null
    : value ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile([
    ...financeRoles,
    "shipper",
  ]);
  const { id } = await context.params;

  if (!/^\d+$/.test(id)) {
    return new Response("Invalid invoice.", {
      status: 400,
    });
  }

  const supabase = await createClient();
  let invoiceQuery = supabase
    .from("invoices")
    .select(`
      id,
      shipper_id,
      invoice_number,
      status,
      currency,
      subtotal,
      tax_rate,
      tax_amount,
      total_amount,
      cod_collected,
      total_delivery_charges,
      total_return_charges,
      total_fulfillment_charges,
      net_settlement_payable,
      invoice_date,
      due_date,
      settlement:settlements!invoices_settlement_id_fkey(settlement_number),
      shipper:profiles!invoices_shipper_id_fkey(full_name, email)
    `)
    .eq("id", Number(id))
    .eq("organization_id", profile.organization_id);

  if (profile.role === "shipper") {
    invoiceQuery = invoiceQuery.eq("shipper_id", profile.id);
  }

  const { data: invoice } = await invoiceQuery.maybeSingle();

  if (!invoice) {
    return new Response("Invoice not found.", {
      status: 404,
    });
  }

  const [
    { data: items },
    { data: business },
  ] = await Promise.all([
    supabase
      .from("invoice_items")
      .select(`
        tracking_number,
        delivered_at,
        consignee_name,
        consignee_city,
        cod_amount,
        delivery_charge,
        return_charge,
        fulfillment_charge,
        total_charges,
        net_payable
      `)
      .eq("invoice_id", invoice.id)
      .order("id"),
    supabase
      .from("shipper_business_profiles")
      .select("company_name, account_number")
      .eq("shipper_id", invoice.shipper_id)
      .maybeSingle(),
  ]);

  const shipper = relation(invoice.shipper);
  const settlement = relation(invoice.settlement);
  const currency = invoice.currency || "AED";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Invoice");

  sheet.addRow(["Invoice", invoice.invoice_number]);
  sheet.addRow(["Settlement", settlement?.settlement_number || ""]);
  sheet.addRow([
    "Shipper",
    business?.company_name || shipper?.full_name || "Shipper",
  ]);
  sheet.addRow(["System Account", business?.account_number || "Pending"]);
  sheet.addRow(["Shipper Email", shipper?.email || ""]);
  sheet.addRow(["Status", invoice.status]);
  sheet.addRow(["Invoice Date", invoice.invoice_date]);
  sheet.addRow(["Due Date", invoice.due_date || ""]);
  sheet.addRow(["Currency", currency]);
  sheet.addRow([]);
  sheet.addRow([
    "AWB",
    "Delivered",
    "Consignee",
    "City",
    "COD",
    "Delivery Charge",
    "Return Charge",
    "Fulfillment Fee",
    "Total Charges",
    "Net Payable",
  ]);

  for (const item of items ?? []) {
    sheet.addRow([
      item.tracking_number,
      item.delivered_at,
      item.consignee_name,
      item.consignee_city,
      Number(item.cod_amount || 0),
      Number(item.delivery_charge || 0),
      Number(item.return_charge || 0),
      Number(item.fulfillment_charge || 0),
      Number(item.total_charges || 0),
      Number(item.net_payable || 0),
    ]);
  }

  sheet.addRow([]);
  sheet.addRow(["COD Collected", Number(invoice.cod_collected || 0)]);
  sheet.addRow(["Fulfillment Charges", Number(invoice.total_fulfillment_charges || 0)]);
  sheet.addRow(["Subtotal", Number(invoice.subtotal || 0)]);
  sheet.addRow(["Tax Rate", `${Number(invoice.tax_rate || 0).toFixed(3)}%`]);
  sheet.addRow(["Tax", Number(invoice.tax_amount || 0)]);
  sheet.addRow(["Invoice Total", Number(invoice.total_amount || 0)]);
  sheet.addRow([
    "Net Settlement Payable",
    Number(invoice.net_settlement_payable || 0),
  ]);

  sheet.columns.forEach((column) => {
    column.width = 20;
  });
  sheet.getColumn(1).width = 24;
  sheet.getColumn(3).width = 24;
  for (let column = 5; column <= 10; column += 1) {
    sheet.getColumn(column).numFmt = "#,##0.00";
  }
  sheet.getRow(11).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  sheet.getRow(11).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF13734B" },
  };

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="${invoice.invoice_number}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
