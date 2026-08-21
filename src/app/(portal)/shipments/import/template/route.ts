import { NextResponse } from "next/server";
import { bulkShipmentHeaders } from "@/lib/bulk-shipments";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET() {
  const example = [
    "ORDER-1001",
    "standard",
    "cod",
    "Example Shipper",
    "+14165550100",
    "100 Warehouse Rd",
    "Unit 1",
    "Toronto",
    "ON",
    "M5V 2T6",
    "CA",
    "Jane Customer",
    "+16475550123",
    "",
    "1 Cardiff Rd",
    "Unit 606",
    "Toronto",
    "ON",
    "M4P 0G2",
    "CA",
    "",
    "",
    "1",
    "1.0",
    "Parcel",
    "49.99",
    "Call on arrival",
  ];

  const csv = [bulkShipmentHeaders.join(","), example.map(csvCell).join(",")].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="courieros-universal-bulk-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
