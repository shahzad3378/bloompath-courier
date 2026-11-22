import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { bulkShipmentHeaders, uaeLocalShipmentHeaders } from "@/lib/bulk-shipments";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET() {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const supabase = await createClient();
  const { data: primaryCountry } = profile.organization_id
    ? await supabase.from("organization_countries").select("country_code").eq("organization_id", profile.organization_id).eq("is_primary", true).maybeSingle()
    : { data: null };
  const isUae = (primaryCountry?.country_code ?? "AE") === "AE";
  const headers = isUae ? uaeLocalShipmentHeaders : bulkShipmentHeaders;
  const example = isUae ? [
    "ORDER-1001","standard","cod","Example Shipper","0500000000","Warehouse 4, Al Quoz","Dubai",
    "Example Customer","0500000001","Building 8, Apartment 12, Al Majaz","Sharjah","1","1.0","Parcel","49.99","Call on arrival",
  ] : [
    "ORDER-1001","standard","cod","Example Shipper","+14165550100","100 Warehouse Rd","Unit 1","Toronto","ON","M5V 2T6","CA",
    "Jane Customer","+16475550123","","1 Cardiff Rd","Unit 606","Toronto","ON","M4P 0G2","CA","","","1","1.0","Parcel","49.99","49.99","Call on arrival",
  ];

  const csv = [headers.join(","), example.map(csvCell).join(",")].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="local-bulk-upload-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
