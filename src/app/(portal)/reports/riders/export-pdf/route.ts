import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const profile = await requireProfile(internalRoles);
  const supabase = await createClient();

  const [
    { data: drivers },
    { data: shipments },
    { data: settings },
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

    supabase
      .from("organization_settings")
      .select("display_name, legal_name")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
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
      name: driver.full_name || driver.email,
      employeeCode: driver.employee_code || "-",
      assigned: assigned.length,
      delivered,
      undelivered,
      returns,
      rate:
        assigned.length > 0
          ? Math.round(
              (delivered / assigned.length) * 100,
            )
          : 0,
    };
  });

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const green = rgb(0.075, 0.45, 0.294);
  const dark = rgb(0.12, 0.16, 0.14);

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
    drawText("Rider Performance", 410, y, 10, true);
    y -= 35;
  }

  drawText(company, 40, y, 18, true);

  page.drawText("RIDER PERFORMANCE REPORT", {
    x: 350,
    y,
    size: 12,
    font: bold,
    color: green,
  });

  y -= 45;

  const headers = [
    ["Rider", 40],
    ["Code", 200],
    ["Assigned", 285],
    ["Delivered", 350],
    ["Failed", 420],
    ["RTO", 475],
    ["Rate", 520],
  ] as const;

  function header() {
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
        size: 6.5,
        font: bold,
        color: rgb(1, 1, 1),
      });
    }

    y -= 27;
  }

  header();

  for (const row of rows) {
    if (y < 80) {
      newPage();
      header();
    }

    drawText(row.name, 40, y, 7, true);
    drawText(row.employeeCode, 200, y, 7);
    drawText(row.assigned, 295, y, 7);
    drawText(row.delivered, 365, y, 7);
    drawText(row.undelivered, 435, y, 7);
    drawText(row.returns, 485, y, 7);
    drawText(`${row.rate}%`, 525, y, 7, true);

    y -= 19;
  }

  const bytes = await pdf.save();

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="rider-report.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
