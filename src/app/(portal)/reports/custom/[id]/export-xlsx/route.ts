import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

const labels: Record<string, string> = {
  tracking_number: "AWB / Tracking No.",
  reference_number: "Reference No.",
  booked_at: "Booked Date",
  shipper: "Shipper",
  driver: "Driver",
  consignee_name: "Consignee",
  consignee_phone: "Consignee Phone",
  consignee_city: "City",
  status: "Status",
  delivery_attempt_count: "Attempt Count",
  last_undelivered_reason: "Undelivered Reason",
  payment_type: "Payment Type",
  cod_amount: "COD Amount",
  delivery_charge: "Delivery Charge",
  return_charge: "Return Charge",
  total_charges: "Total Charges",
  net_payable: "Net Payable",
  service_type: "Service Type",
  delivered_at: "Delivered Date",
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

function relationLabel(
  value: any,
  field: "shipper" | "driver",
) {
  const relation = value?.[field];

  if (Array.isArray(relation)) {
    return (
      relation[0]?.full_name ||
      relation[0]?.email ||
      ""
    );
  }

  return (
    relation?.full_name ||
    relation?.email ||
    ""
  );
}

function valueForColumn(
  column: string,
  row: any,
) {
  if (column === "shipper") {
    return relationLabel(row, "shipper");
  }

  if (column === "driver") {
    return relationLabel(row, "driver");
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
    return Number(row[column] || 0);
  }

  return row[column] ?? "";
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

  const { data: report } = await db
    .from("report_definitions")
    .select(`
      id,
      name,
      data_source,
      selected_columns
    `)
    .eq("id", Number(id))
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!report) {
    return new Response("Report not found.", {
      status: 404,
    });
  }

  const columns = Array.isArray(
    report.selected_columns,
  )
    ? report.selected_columns
    : ["tracking_number", "status"];

  let rows: any[] = [];

  const from = parseDateStart(
    url.searchParams.get("from"),
  );

  const to = parseDateStart(
    url.searchParams.get("to"),
  );

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
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .is("deleted_at", null)
      .order("booked_at", {
        ascending: false,
      })
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

    const shipper =
      url.searchParams.get("shipper");

    const driver =
      url.searchParams.get("driver");

    const status =
      url.searchParams.get("status");

    const city =
      url.searchParams.get("city");

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
  } else if (
    report.data_source === "finance"
  ) {
    let query = db
      .from("finance_ledger")
      .select(`
        id,
        tracking_number,
        cod_amount,
        delivery_charge,
        return_charge,
        total_charges,
        net_payable,
        transaction_at
      `)
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .order("transaction_at", {
        ascending: false,
      })
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
  } else if (
    report.data_source === "settlements"
  ) {
    let query = db
      .from("settlements")
      .select("*")
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .order("created_at", {
        ascending: false,
      })
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

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Custom Report");

  sheet.addRow([report.name]);
  sheet.addRow([]);
  sheet.addRow(
    columns.map(
      (column: string) =>
        labels[column] ||
        column.replaceAll("_", " "),
    ),
  );

  for (const row of rows) {
    sheet.addRow(
      columns.map((column: string) =>
        valueForColumn(column, row),
      ),
    );
  }

  sheet.columns.forEach((column) => {
    column.width = 20;
  });

  const buffer =
    await workbook.xlsx.writeBuffer();

  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="custom-report-${report.id}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
