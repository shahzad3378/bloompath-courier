import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import {
  formatMoney,
  formatMoneyTotals,
  rowCurrency,
  sumByCurrency,
} from "@/lib/currency";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const profile = await requireProfile(internalRoles);
  const supabase = await createClient();

  const [{ data: rowsData }, { data: settings }] =
    await Promise.all([
      supabase
        .from("finance_ledger")
        .select(`
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
        .order("transaction_at", { ascending: false }),

      supabase
        .from("organization_settings")
        .select("display_name, legal_name, trn")
        .eq("organization_id", profile.organization_id)
        .maybeSingle(),
    ]);

  const rows = rowsData ?? [];
  const organizationCurrency = await resolveOrganizationCurrency(
    supabase,
    profile.organization_id!,
  );

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const green = rgb(0.075, 0.45, 0.294);
  const dark = rgb(0.12, 0.16, 0.14);
  const grey = rgb(0.45, 0.49, 0.47);

  let page = pdf.addPage([595.28, 841.89]);
  let y = 795;

  const company =
    settings?.display_name ||
    settings?.legal_name ||
    "Courier Company";

  function drawText(
    value: unknown,
    x: number,
    yy: number,
    size = 8,
    isBold = false,
  ) {
    page.drawText(String(value ?? ""), {
      x,
      y: yy,
      size,
      font: isBold ? bold : regular,
      color: dark,
    });
  }

  function newPage() {
    page = pdf.addPage([595.28, 841.89]);
    y = 795;

    drawText(company, 40, y, 12, true);
    drawText("Revenue Report", 420, y, 10, true);
    y -= 35;
  }

  drawText(company, 40, y, 18, true);
  page.drawText("REVENUE REPORT", {
    x: 390,
    y,
    size: 13,
    font: bold,
    color: green,
  });

  y -= 20;

  if (settings?.trn) {
    page.drawText(`TRN: ${settings.trn}`, {
      x: 40,
      y,
      size: 8,
      font: regular,
      color: grey,
    });
  }

  y -= 35;

  const headers = [
    ["AWB", 40],
    ["COD", 145],
    ["Delivery", 230],
    ["Return", 315],
    ["Charges", 400],
    ["Net", 485],
  ] as const;

  function tableHeader() {
    page.drawRectangle({
      x: 40,
      y: y - 16,
      width: 515,
      height: 22,
      color: green,
    });

    for (const [label, x] of headers) {
      page.drawText(label, {
        x,
        y: y - 8,
        size: 7,
        font: bold,
        color: rgb(1, 1, 1),
      });
    }

    y -= 27;
  }

  tableHeader();

  for (const row of rows) {
    if (y < 90) {
      newPage();
      tableHeader();
    }

    const amountCurrency = rowCurrency(
      row.currency,
      organizationCurrency,
    );

    drawText(row.tracking_number, 40, y, 7, true);
    drawText(formatMoney(row.cod_amount, amountCurrency), 145, y, 6);
    drawText(formatMoney(row.delivery_charge, amountCurrency), 230, y, 6);
    drawText(formatMoney(row.return_charge, amountCurrency), 315, y, 6);
    drawText(formatMoney(row.total_charges, amountCurrency), 400, y, 6);
    drawText(formatMoney(row.net_payable, amountCurrency), 485, y, 6, true);

    y -= 18;
  }

  if (y < 170) newPage();

  y -= 20;

  const totals = [
    ["Total COD", sumByCurrency(rows, (row) => row.cod_amount, (row) => row.currency, organizationCurrency)],
    ["Courier Charges", sumByCurrency(rows, (row) => row.total_charges, (row) => row.currency, organizationCurrency)],
    ["Net Payable", sumByCurrency(rows, (row) => row.net_payable, (row) => row.currency, organizationCurrency)],
  ] as const;

  for (const [label, amounts] of totals) {
    if (y < 70) newPage();

    drawText(label, 300, y, 9, true);
    drawText(
      formatMoneyTotals(amounts, organizationCurrency),
      400,
      y,
      9,
      true,
    );
    y -= 18;
  }

  const bytes = await pdf.save();

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="revenue-report.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
