import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { requireProfile } from "@/lib/auth";
import {
  formatMoney,
  formatMoneyTotals,
  rowCurrency,
  sumByCurrency,
} from "@/lib/currency";
import { internalRoles } from "@/lib/roles";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";
import { resolveReportDateRange } from "@/lib/report-date-range";

function shortDate(
  value: string | null | undefined,
) {
  if (!value) return "-";

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(new Date(value));
}

function relation(value: unknown) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function GET(
  request: Request,
) {
  const profile =
    await requireProfile(
      internalRoles,
    );

  const url =
    new URL(request.url);

  const { start, endExclusive, error: rangeError } = resolveReportDateRange({
    range: url.searchParams.get("range"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (rangeError) return new Response(rangeError, { status: 400 });

  const supabase =
    await createClient();

  let query = supabase
    .from("shipments")
    .select(`
      id,
      tracking_number,
      shipper_id,
      assigned_driver_id,
      consignee_name,
      consignee_city,
      payment_type,
      cod_amount,
      currency,
      service_type,
      status,
      delivery_attempt_count,
      booked_at,
      delivered_at,
      last_undelivered_reason,
      shipper:profiles!shipments_shipper_id_fkey(
        full_name,
        email
      ),
      driver:profiles!shipments_assigned_driver_id_fkey(
        full_name,
        email
      )
    `)
    .eq("organization_id", profile.organization_id!)
    .is("deleted_at", null)
    .gte(
      "booked_at",
      start.toISOString(),
    )
    .lt(
      "booked_at",
      endExclusive.toISOString(),
    )
    .order("booked_at", {
      ascending: false,
    });

  const shipper =
    url.searchParams.get(
      "shipper",
    );

  const driver =
    url.searchParams.get(
      "driver",
    );

  const status =
    url.searchParams.get(
      "status",
    );

  if (shipper) {
    query = query.eq(
      "shipper_id",
      shipper,
    );
  }

  if (driver) {
    query = query.eq(
      "assigned_driver_id",
      driver,
    );
  }

  if (status) {
    query = query.eq(
      "status",
      status,
    );
  }

  const [{ data: settings }, organizationCurrency] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("display_name, legal_name")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    resolveOrganizationCurrency(
      supabase,
      profile.organization_id!,
    ),
  ]);

  const rows: Awaited<ReturnType<typeof query.range>>["data"] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) return new Response("Report export could not be generated.", { status: 500 });
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const company =
    settings?.display_name ||
    settings?.legal_name ||
    "Courier Company";

  const pdf =
    await PDFDocument.create();

  const regular =
    await pdf.embedFont(
      StandardFonts.Helvetica,
    );

  const bold =
    await pdf.embedFont(
      StandardFonts.HelveticaBold,
    );

  const green =
    rgb(0.075, 0.45, 0.294);

  const dark =
    rgb(0.12, 0.16, 0.14);

  const grey =
    rgb(0.46, 0.50, 0.48);

  const width = 841.89;
  const height = 595.28;

  let page =
    pdf.addPage([
      width,
      height,
    ]);

  let y = height - 42;

  function draw(
    value: unknown,
    x: number,
    yy: number,
    size = 7,
    isBold = false,
  ) {
    page.drawText(
      String(value ?? ""),
      {
        x,
        y: yy,
        size,
        font: isBold
          ? bold
          : regular,
        color: dark,
        maxWidth: 125,
      },
    );
  }

  function newPage() {
    page =
      pdf.addPage([
        width,
        height,
      ]);

    y = height - 42;

    draw(
      company,
      35,
      y,
      11,
      true,
    );

    draw(
      "Delivery Report",
      650,
      y,
      10,
      true,
    );

    y -= 32;
  }

  draw(
    company,
    35,
    y,
    16,
    true,
  );

  page.drawText(
    "DELIVERY REPORT",
    {
      x: 650,
      y,
      size: 13,
      font: bold,
      color: green,
    },
  );

  y -= 18;

  page.drawText(
    `${shortDate(
      start.toISOString(),
    )} - ${shortDate(
      new Date(
        endExclusive.getTime() -
          1,
      ).toISOString(),
    )}`,
    {
      x: 35,
      y,
      size: 8,
      font: regular,
      color: grey,
    },
  );

  y -= 32;

  const headers = [
    ["AWB", 35],
    ["Booked", 140],
    ["Shipper", 210],
    ["Driver", 325],
    ["City", 435],
    ["Status", 510],
    ["Attempts", 600],
    ["COD", 640],
    ["Delivered", 745],
  ] as const;

  function header() {
    page.drawRectangle({
      x: 35,
      y: y - 15,
      width: 771,
      height: 22,
      color: green,
    });

    for (
      const [
        label,
        x,
      ] of headers
    ) {
      page.drawText(
        label,
        {
          x,
          y: y - 8,
          size: 6.5,
          font: bold,
          color: rgb(
            1,
            1,
            1,
          ),
        },
      );
    }

    y -= 27;
  }

  header();

  for (const row of rows) {
    if (y < 55) {
      newPage();
      header();
    }

    const shipperRelation =
      relation(row.shipper);

    const driverRelation =
      relation(row.driver);

    draw(
      row.tracking_number,
      35,
      y,
      6.5,
      true,
    );

    draw(
      shortDate(
        row.booked_at,
      ),
      140,
      y,
      6.5,
    );

    draw(
      shipperRelation?.full_name ||
        shipperRelation?.email ||
        "-",
      210,
      y,
      6.5,
    );

    draw(
      driverRelation?.full_name ||
        driverRelation?.email ||
        "-",
      325,
      y,
      6.5,
    );

    draw(
      row.consignee_city ||
        "-",
      435,
      y,
      6.5,
    );

    draw(
      String(
        row.status,
      )
        .replaceAll(
          "_",
          " ",
        )
        .slice(0, 18),
      510,
      y,
      6.5,
    );

    draw(
      row.delivery_attempt_count,
      610,
      y,
      6.5,
    );

    draw(
      formatMoney(
        row.cod_amount,
        rowCurrency(
          row.currency,
          organizationCurrency,
        ),
      ),
      640,
      y,
      6,
    );

    draw(
      shortDate(
        row.delivered_at,
      ),
      745,
      y,
      6.5,
    );

    y -= 18;
  }

  if (y < 120) {
    newPage();
  }

  y -= 15;

  const delivered =
    rows.filter(
      (row) =>
        row.status ===
        "delivered",
    ).length;

  const undelivered =
    rows.filter(
      (row) =>
        row.status ===
        "undelivered",
    ).length;

  const totalCod = sumByCurrency(
    rows,
    (row) => row.cod_amount,
    (row) => row.currency,
    organizationCurrency,
  );

  draw(
    `Total AWBs: ${rows.length}`,
    35,
    y,
    9,
    true,
  );

  draw(
    `Delivered: ${delivered}`,
    170,
    y,
    9,
    true,
  );

  draw(
    `Undelivered: ${undelivered}`,
    310,
    y,
    9,
    true,
  );

  page.drawText(
    `COD: ${formatMoneyTotals(totalCod, organizationCurrency)}`,
    {
      x: 460,
      y: y - 16,
      size: 9,
      font: bold,
      color: green,
      maxWidth: 340,
    },
  );

  const bytes =
    await pdf.save();

  return new Response(
    bytes as BodyInit,
    {
      headers: {
        "Content-Type":
          "application/pdf",
        "Content-Disposition":
          'attachment; filename="delivery-report.pdf"',
        "Cache-Control":
          "no-store",
      },
    },
  );
}
