import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";

function money(value: unknown, currency: string) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

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
          fulfillment_charge,
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
  const currency =
    rows[0]?.currency ||
    (await resolveOrganizationCurrency(
      supabase,
      profile.organization_id!,
    ));

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
    ["COD", 170],
    ["Delivery", 250],
    ["Return", 305],
    ["Fulfill", 370],
    ["Charges", 430],
    ["Net", 510],
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

    drawText(row.tracking_number, 40, y, 7, true);
    drawText(Number(row.cod_amount || 0).toFixed(2), 170, y, 7);
    drawText(Number(row.delivery_charge || 0).toFixed(2), 250, y, 7);
    drawText(Number(row.return_charge || 0).toFixed(2), 305, y, 7);
    drawText(Number(row.fulfillment_charge || 0).toFixed(2), 370, y, 7);
    drawText(Number(row.total_charges || 0).toFixed(2), 430, y, 7);
    drawText(Number(row.net_payable || 0).toFixed(2), 510, y, 7, true);

    y -= 18;
  }

  if (y < 170) newPage();

  y -= 20;

  const totalCod = rows.reduce(
    (sum, row) => sum + Number(row.cod_amount || 0),
    0,
  );

  const fulfillmentCharges = rows.reduce((sum,row)=>sum+Number(row.fulfillment_charge||0),0);

  const totalCharges = rows.reduce(
    (sum, row) => sum + Number(row.total_charges || 0),
    0,
  );

  const netPayable = rows.reduce(
    (sum, row) => sum + Number(row.net_payable || 0),
    0,
  );

  drawText("Total COD", 350, y, 9, true);
  drawText(money(totalCod, currency), 455, y, 9, true);
  y -= 18;

  drawText("Fulfillment Charges", 350, y, 9, true);
  drawText(money(fulfillmentCharges, currency), 455, y, 9, true);
  y -= 18;

  drawText("Courier Charges", 350, y, 9, true);
  drawText(money(totalCharges, currency), 455, y, 9, true);
  y -= 18;

  drawText("Net Payable", 350, y, 10, true);
  page.drawText(money(netPayable, currency), {
    x: 455,
    y,
    size: 10,
    font: bold,
    color: green,
  });

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
