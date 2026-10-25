import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";

export async function GET(request: Request) {
  await requireProfile(["super_admin", "operations_admin", "warehouse_staff"]);
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "products" && kind !== "stock") return new Response("Choose products or stock template.", { status: 400 });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BloomPath Courier";
  const sheet = workbook.addWorksheet("Bulk Upload");
  sheet.columns = kind === "products"
    ? [{ header: "sku", key: "sku", width: 24 }, { header: "name", key: "name", width: 36 }, { header: "location", key: "location", width: 24 }, { header: "unit_cost", key: "unit_cost", width: 18 }, { header: "fulfillment_group", key: "fulfillment_group", width: 28 }]
    : [{ header: "sku", key: "sku", width: 24 }, { header: "quantity", key: "quantity", width: 18 }, { header: "note", key: "note", width: 42 }];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: kind === "products" ? "E2" : "C2" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174EA6" } };
  const bytes = await workbook.xlsx.writeBuffer();
  const filename = kind === "products" ? "fulfillment-products-template.xlsx" : "fulfillment-stock-template.xlsx";
  return new Response(bytes as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename=${filename}`, "Cache-Control": "no-store" } });
}
