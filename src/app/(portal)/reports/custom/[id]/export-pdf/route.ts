import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { requireProfile } from "@/lib/auth";
import { formatMoney, rowCurrency } from "@/lib/currency";
import { internalRoles } from "@/lib/roles";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";

const labels: Record<string, string> = {
  tracking_number: "AWB",
  reference_number: "Reference",
  booked_at: "Booked",
  shipper: "Shipper",
  driver: "Driver",
  consignee_name: "Consignee",
  consignee_phone: "Phone",
  consignee_city: "City",
  status: "Status",
  delivery_attempt_count: "Attempts",
  last_undelivered_reason: "Undelivered Reason",
  payment_type: "Payment",
  cod_amount: "COD",
  delivery_charge: "Delivery",
  return_charge: "Return",
  total_charges: "Charges",
  net_payable: "Net Payable",
  service_type: "Service",
  delivered_at: "Delivered",
};

function parseDateStart(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day) -
      4 * 60 * 60 * 1000,
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

function relation(value: any) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function cell(
  column: string,
  row: any,
  organizationCurrency: string,
) {
  if (column === "shipper") {
    const value = relation(row.shipper);

    return value?.full_name || value?.email || "-";
  }

  if (column === "driver") {
    const value = relation(row.driver);

    return value?.full_name || value?.email || "-";
  }

  if (column === "currency") {
    return rowCurrency(row.currency, organizationCurrency);
  }

  if (
    [
      "cod_amount",
      "delivery_charge",
      "return_charge",
      "total_charges",
      "net_payable",
    ].includes(column)
  ) {
    return formatMoney(
      row[column],
      rowCurrency(row.currency, organizationCurrency),
    );
  }

  const value = row[column];

  if (value === null || value === undefined) {
    return "-";
  }

  return String(value)
    .replaceAll("_", " ")
    .slice(0, 28);
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const profile = await requireProfile(internalRoles);
  const { id } = await context.params;

  if (!/^\d+$/.test(id)) {
    return new Response("Invalid report.", {
      status: 400,
    });
  }

  const url = new URL(request.url);

  const supabase = await createClient();
  const db = supabase as any;

  const [
    { data: report },
    { data: settings },
    organizationCurrency,
  ] = await Promise.all([
    db
      .from("report_definitions")
      .select(`
        id,
        name,
        data_source,
        selected_columns
      `)
      .eq("id", Number(id))
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),

    db
      .from("organization_settings")
      .select("display_name, legal_name")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    resolveOrganizationCurrency(
      supabase,
      profile.organization_id!,
    ),
  ]);

  if (!report) {
    return new Response("Report not found.", {
      status: 404,
    });
  }

  const selectedColumns = Array.isArray(
    report.selected_columns,
  )
    ? report.selected_columns
    : ["tracking_number", "status"];

  // Keep A4 landscape readable.
  const columns = selectedColumns.slice(0, 9);

  const from = parseDateStart(
    url.searchParams.get("from"),
  );

  const to = parseDateStart(
    url.searchParams.get("to"),
  );

  let rows: any[] = [];

  if (report.data_source === "shipments") {
    let query = db
      .from("shipments")
      .select(`
        id,
        tracking_number,
        reference_number,
        booked_at,
        consignee_name,
        consignee_phone,
        consignee_city,
        status,
        delivery_attempt_count,
        last_undelivered_reason,
        payment_type,
        cod_amount,
        currency,
        service_type,
        delivered_at,
        shipper_id,
        assigned_driver_id,
        shipper:profiles!shipments_shipper_id_fkey(
          full_name,
          email
        ),
        driver:profiles!shipments_assigned_driver_id_fkey(
          full_name,
          email
        )
      `)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .order("booked_at", { ascending: false })
      .limit(500);

    if (from) {
      query = query.gte(
        "booked_at",
        from.toISOString(),
      );
    }

    if (to) {
      query = query.lt(
        "booked_at",
        addDays(to, 1).toISOString(),
      );
    }

    const shipper = url.searchParams.get("shipper");
    const driver = url.searchParams.get("driver");
    const status = url.searchParams.get("status");
    const city = url.searchParams.get("city");
    const paymentType =
      url.searchParams.get("payment_type");

    if (shipper) {
      query = query.eq("shipper_id", shipper);
    }

    if (driver) {
      query = query.eq(
        "assigned_driver_id",
        driver,
      );
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (city) {
      query = query.ilike(
        "consignee_city",
        `%${city.trim()}%`,
      );
    }

    if (paymentType) {
      query = query.eq(
        "payment_type",
        paymentType,
      );
    }

    const { data } = await query;
    rows = data ?? [];
  } else if (report.data_source === "finance") {
    let query = db
      .from("finance_ledger")
      .select(`
        id,
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
      .order("transaction_at", { ascending: false })
      .limit(500);

    if (from) {
      query = query.gte(
        "transaction_at",
        from.toISOString(),
      );
    }

    if (to) {
      query = query.lt(
        "transaction_at",
        addDays(to, 1).toISOString(),
      );
    }

    const { data } = await query;
    rows = data ?? [];
  } else if (report.data_source === "settlements") {
    let query = db
      .from("settlements")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (from) {
      query = query.gte(
        "created_at",
        from.toISOString(),
      );
    }

    if (to) {
      query = query.lt(
        "created_at",
        addDays(to, 1).toISOString(),
      );
    }

    const { data } = await query;
    rows = data ?? [];
  }

  const pdf = await PDFDocument.create();

  const regular = await pdf.embedFont(
    StandardFonts.Helvetica,
  );

  const bold = await pdf.embedFont(
    StandardFonts.HelveticaBold,
  );

  const green = rgb(0.075, 0.45, 0.294);
  const dark = rgb(0.12, 0.16, 0.14);

  const width = 841.89;
  const height = 595.28;

  const company =
    settings?.display_name ||
    settings?.legal_name ||
    "Courier Company";

  let page = pdf.addPage([width, height]);
  let y = height - 42;

  function newPage() {
    page = pdf.addPage([width, height]);

    y = height - 42;

    page.drawText(company, {
      x: 35,
      y,
      size: 11,
      font: bold,
      color: dark,
    });

    page.drawText(report.name, {
      x: 600,
      y,
      size: 10,
      font: bold,
      color: green,
      maxWidth: 205,
    });

    y -= 34;
  }

  page.drawText(company, {
    x: 35,
    y,
    size: 16,
    font: bold,
    color: dark,
  });

  page.drawText(report.name, {
    x: 570,
    y,
    size: 13,
    font: bold,
    color: green,
    maxWidth: 235,
  });

  y -= 42;

  const usableWidth = width - 70;

  const columnWidth =
    usableWidth / Math.max(columns.length, 1);

  function drawHeader() {
    page.drawRectangle({
      x: 35,
      y: y - 15,
      width: usableWidth,
      height: 22,
      color: green,
    });

    columns.forEach(
      (column: string, index: number) => {
        page.drawText(
          labels[column] ||
            column.replaceAll("_", " "),
          {
            x: 38 + index * columnWidth,
            y: y - 8,
            size: 6,
            font: bold,
            color: rgb(1, 1, 1),
            maxWidth: columnWidth - 5,
          },
        );
      },
    );

    y -= 27;
  }

  drawHeader();

  for (const row of rows) {
    if (y < 55) {
      newPage();
      drawHeader();
    }

    columns.forEach(
      (column: string, index: number) => {
        page.drawText(
          cell(column, row, organizationCurrency),
          {
            x: 38 + index * columnWidth,
            y,
            size: 6,
            font: regular,
            color: dark,
            maxWidth: columnWidth - 5,
          },
        );
      },
    );

    y -= 17;
  }

  const bytes = await pdf.save();

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        `attachment; filename="custom-report-${report.id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
