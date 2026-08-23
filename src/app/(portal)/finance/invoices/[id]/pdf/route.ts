import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const financeRoles = [
  "super_admin",
  "operations_admin",
  "finance_staff",
] as const;

function money(value: unknown, currency: string) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function date(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
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
      organization_id,
      settlement_id,
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
      net_settlement_payable,
      invoice_date,
      due_date,
      issued_at,
      paid_at,
      payment_reference,
      settlement:settlements!invoices_settlement_id_fkey(
        settlement_number,
        period_from,
        period_to
      ),
      shipper:profiles!invoices_shipper_id_fkey(
        full_name,
        email,
        phone
      )
    `)
    .eq("id", Number(id))
    .eq("organization_id", profile.organization_id);

  if (profile.role === "shipper") {
    invoiceQuery = invoiceQuery.eq(
      "shipper_id",
      profile.id,
    );
  }

  const { data: invoice, error: invoiceError } =
    await invoiceQuery.maybeSingle();

  if (invoiceError || !invoice) {
    return new Response("Invoice not found.", {
      status: 404,
    });
  }

  const settlement = relation(invoice.settlement);
  const shipper = relation(invoice.shipper);
  const currency = invoice.currency || "AED";

  const [
    { data: items, error: itemsError },
    { data: shipperBusiness },
  ] = await Promise.all([
    supabase
      .from("invoice_items")
      .select(`
        id,
        tracking_number,
        delivered_at,
        consignee_name,
        consignee_city,
        cod_amount,
        delivery_charge,
        return_charge,
        total_charges,
        net_payable
      `)
      .eq("invoice_id", invoice.id)
      .order("id"),
    supabase
      .from("shipper_business_profiles")
      .select("account_number")
      .eq("shipper_id", invoice.shipper_id)
      .maybeSingle(),
  ]);

  if (itemsError) {
    return new Response(
      "Invoice items could not be loaded.",
      { status: 500 },
    );
  }

  const { data: settings } = await supabase
    .from("organization_settings")
    .select(`
      legal_name,
      display_name,
      contact_email,
      contact_phone,
      website,
      address,
      city,
      trn,
      awb_brand_name,
      logo_url
    `)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  const companyName =
    settings?.display_name ||
    settings?.awb_brand_name ||
    settings?.legal_name ||
    "BloomPath Courier";

  const pdf = await PDFDocument.create();

  const regular = await pdf.embedFont(
    StandardFonts.Helvetica,
  );

  const bold = await pdf.embedFont(
    StandardFonts.HelveticaBold,
  );

  const green = rgb(0.075, 0.45, 0.294);
  const dark = rgb(0.10, 0.14, 0.12);
  const grey = rgb(0.43, 0.49, 0.46);
  const light = rgb(0.95, 0.98, 0.96);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;

  let page = pdf.addPage([
    pageWidth,
    pageHeight,
  ]);

  let y = pageHeight - 45;

  function text(
    value: unknown,
    x: number,
    yPosition: number,
    options?: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
    },
  ) {
    const content = String(value ?? "");

    page.drawText(content, {
      x,
      y: yPosition,
      size: options?.size ?? 9,
      font: options?.bold ? bold : regular,
      color: options?.color ?? dark,
      maxWidth: options?.maxWidth,
    });
  }

  function newPage() {
    page = pdf.addPage([
      pageWidth,
      pageHeight,
    ]);

    y = pageHeight - 45;

    text(companyName, margin, y, {
      size: 13,
      bold: true,
      color: green,
    });

    text(
      `Invoice ${invoice!.invoice_number}`,
      390,
      y,
      {
        size: 9,
        bold: true,
      },
    );

    y -= 30;
  }

  text(companyName, margin, y, {
    size: 19,
    bold: true,
    color: green,
  });

  text("TAX INVOICE", 420, y, {
    size: 16,
    bold: true,
    color: dark,
  });

  y -= 22;

  if (settings?.legal_name) {
    text(settings.legal_name, margin, y, {
      size: 9,
      color: grey,
    });

    y -= 14;
  }

  if (settings?.address || settings?.city) {
    text(
      [settings.address, settings.city]
        .filter(Boolean)
        .join(", "),
      margin,
      y,
      {
        size: 8,
        color: grey,
        maxWidth: 300,
      },
    );

    y -= 13;
  }

  if (settings?.trn) {
    text(`TRN: ${settings.trn}`, margin, y, {
      size: 8,
      color: grey,
    });
  }

  text(
    `Invoice No: ${invoice.invoice_number}`,
    370,
    y + 35,
    {
      size: 9,
      bold: true,
    },
  );

  text(
    `Invoice Date: ${date(invoice.invoice_date)}`,
    370,
    y + 20,
    {
      size: 8,
      color: grey,
    },
  );

  text(
    `Due Date: ${date(invoice.due_date)}`,
    370,
    y + 5,
    {
      size: 8,
      color: grey,
    },
  );

  text(
    `Status: ${String(invoice.status).toUpperCase()}`,
    370,
    y - 10,
    {
      size: 8,
      bold: true,
      color:
        invoice.status === "paid"
          ? green
          : dark,
    },
  );

  y -= 55;

  page.drawRectangle({
    x: margin,
    y: y - 65,
    width: pageWidth - margin * 2,
    height: 70,
    color: light,
  });

  text("BILL TO", margin + 12, y - 13, {
    size: 8,
    bold: true,
    color: green,
  });

  text(
    shipper?.full_name || "Shipper",
    margin + 12,
    y - 30,
    {
      size: 11,
      bold: true,
    },
  );

  text(
    shipper?.email || "-",
    margin + 12,
    y - 45,
    {
      size: 8,
      color: grey,
    },
  );

  text(
    `Account: ${shipperBusiness?.account_number || "Pending"}`,
    margin + 12,
    y - 59,
    {
      size: 8,
      bold: true,
      color: grey,
    },
  );

  text(
    `Settlement: ${
      settlement?.settlement_number || "-"
    }`,
    330,
    y - 15,
    {
      size: 8,
      bold: true,
    },
  );

  text(
    `Period: ${date(
      settlement?.period_from,
    )} - ${date(settlement?.period_to)}`,
    330,
    y - 32,
    {
      size: 8,
      color: grey,
    },
  );

  y -= 95;

  const columns = [
    { label: "AWB", x: 40 },
    { label: "Delivered", x: 130 },
    { label: "COD", x: 215 },
    { label: "Delivery", x: 290 },
    { label: "Return", x: 365 },
    { label: "Charges", x: 430 },
    { label: "Net", x: 500 },
  ];

  function drawTableHeader() {
    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: pageWidth - margin * 2,
      height: 24,
      color: green,
    });

    for (const column of columns) {
      text(
        column.label,
        column.x + 4,
        y - 9,
        {
          size: 7,
          bold: true,
          color: rgb(1, 1, 1),
        },
      );
    }

    y -= 28;
  }

  drawTableHeader();

  for (const item of items ?? []) {
    if (y < 105) {
      newPage();
      drawTableHeader();
    }

    text(
      item.tracking_number,
      44,
      y,
      {
        size: 7,
        bold: true,
        color: green,
        maxWidth: 82,
      },
    );

    text(
      date(item.delivered_at),
      134,
      y,
      {
        size: 7,
      },
    );

    text(
      Number(item.cod_amount || 0).toFixed(2),
      219,
      y,
      {
        size: 7,
      },
    );

    text(
      Number(
        item.delivery_charge || 0,
      ).toFixed(2),
      294,
      y,
      {
        size: 7,
      },
    );

    text(
      Number(
        item.return_charge || 0,
      ).toFixed(2),
      369,
      y,
      {
        size: 7,
      },
    );

    text(
      Number(
        item.total_charges || 0,
      ).toFixed(2),
      434,
      y,
      {
        size: 7,
      },
    );

    text(
      Number(item.net_payable || 0).toFixed(2),
      504,
      y,
      {
        size: 7,
        bold: true,
      },
    );

    page.drawLine({
      start: {
        x: margin,
        y: y - 7,
      },
      end: {
        x: pageWidth - margin,
        y: y - 7,
      },
      thickness: 0.4,
      color: rgb(0.88, 0.91, 0.89),
    });

    y -= 21;
  }

  if (y < 235) {
    newPage();
  }

  y -= 15;

  const totalsX = 340;

  text(
    `AWBs: ${(items ?? []).length}`,
    margin,
    y,
    {
      size: 8,
      bold: true,
      color: grey,
    },
  );

  text(
    "COD Collected",
    totalsX,
    y,
    {
      size: 8,
      color: grey,
    },
  );

  text(
    money(invoice.cod_collected, currency),
    475,
    y,
    {
      size: 8,
      bold: true,
    },
  );

  y -= 18;

  text(
    "Delivery Charges",
    totalsX,
    y,
    {
      size: 8,
      color: grey,
    },
  );

  text(
    money(invoice.total_delivery_charges, currency),
    475,
    y,
    {
      size: 8,
    },
  );

  y -= 18;

  text(
    "Return Charges",
    totalsX,
    y,
    {
      size: 8,
      color: grey,
    },
  );

  text(
    money(invoice.total_return_charges, currency),
    475,
    y,
    {
      size: 8,
    },
  );

  y -= 18;

  text(
    `VAT (${Number(invoice.tax_rate || 0).toFixed(2)}%)`,
    totalsX,
    y,
    {
      size: 8,
      color: grey,
    },
  );

  text(
    money(invoice.tax_amount, currency),
    475,
    y,
    {
      size: 8,
    },
  );

  y -= 22;

  page.drawLine({
    start: { x: totalsX, y: y + 8 },
    end: {
      x: pageWidth - margin,
      y: y + 8,
    },
    thickness: 1,
    color: green,
  });

  text(
    "INVOICE TOTAL",
    totalsX,
    y - 3,
    {
      size: 10,
      bold: true,
    },
  );

  text(
    money(invoice.total_amount, currency),
    465,
    y - 3,
    {
      size: 10,
      bold: true,
      color: green,
    },
  );

  y -= 30;

  text(
    "NET COD PAYABLE",
    totalsX,
    y,
    {
      size: 10,
      bold: true,
    },
  );

  text(
    money(invoice.net_settlement_payable, currency),
    465,
    y,
    {
      size: 10,
      bold: true,
      color: green,
    },
  );

  y -= 45;

  if (invoice.status === "paid") {
    page.drawRectangle({
      x: margin,
      y: y - 30,
      width: pageWidth - margin * 2,
      height: 40,
      color: light,
    });

    text(
      "PAID",
      margin + 12,
      y - 7,
      {
        size: 12,
        bold: true,
        color: green,
      },
    );

    text(
      `Paid: ${date(invoice.paid_at)}${
        invoice.payment_reference
          ? ` | Ref: ${invoice.payment_reference}`
          : ""
      }`,
      margin + 80,
      y - 5,
      {
        size: 8,
        color: grey,
      },
    );

    y -= 55;
  }

  text(
    "This invoice contains the AWB-level shipment and courier charge details included in this settlement.",
    margin,
    Math.max(y, 45),
    {
      size: 7,
      color: grey,
      maxWidth: 500,
    },
  );

  const bytes = await pdf.save();

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        `attachment; filename="${invoice.invoice_number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
