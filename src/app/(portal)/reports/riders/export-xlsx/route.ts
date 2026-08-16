import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const profile = await requireProfile(internalRoles);
  const supabase = await createClient();

  const [
    { data: drivers },
    { data: shipments },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, employee_code")
      .eq("organization_id", profile.organization_id)
      .eq("role", "driver")
      .eq("status", "active")
      .order("full_name"),

    supabase
      .from("shipments")
      .select("assigned_driver_id, status")
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null),
  ]);

  const shipmentRows = shipments ?? [];

  const rows = (drivers ?? []).map((driver) => {
    const assigned = shipmentRows.filter(
      (row) => row.assigned_driver_id === driver.id,
    );

    const delivered = assigned.filter(
      (row) => row.status === "delivered",
    ).length;

    const undelivered = assigned.filter(
      (row) => row.status === "undelivered",
    ).length;

    const returns = assigned.filter(
      (row) =>
        row.status === "return_initiated" ||
        row.status === "returned_to_shipper",
    ).length;

    return {
      rider: driver.full_name || driver.email,
      employeeCode: driver.employee_code || "",
      assigned: assigned.length,
      delivered,
      undelivered,
      returns,
      deliveryRate:
        assigned.length > 0
          ? Math.round(
              (delivered / assigned.length) * 100,
            )
          : 0,
    };
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rider Report");

  sheet.addRow(["Rider Performance Report"]);
  sheet.addRow([]);

  sheet.addRow([
    "Rider",
    "Employee Code",
    "Assigned",
    "Delivered",
    "Undelivered",
    "RTO",
    "Delivery Rate %",
  ]);

  for (const row of rows) {
    sheet.addRow([
      row.rider,
      row.employeeCode,
      row.assigned,
      row.delivered,
      row.undelivered,
      row.returns,
      row.deliveryRate,
    ]);
  }

  sheet.columns.forEach((column) => {
    column.width = 18;
  });

  sheet.getColumn(1).width = 28;

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="rider-report.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
