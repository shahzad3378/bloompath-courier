import { requireProfile } from "@/lib/auth";
import { bulkShipmentHeaders } from "@/lib/bulk-shipments";

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function GET() {
  await requireProfile(["super_admin", "operations_admin", "dispatcher", "customer_service", "shipper"]);
  const headers = [...bulkShipmentHeaders, "transport_mode", "length_cm", "width_cm", "height_cm", "hscode"];
  const sample: Record<string, string | number> = {
    reference_number: "INT-0001",
    service_type: "standard",
    payment_type: "prepaid",
    sender_name: "Sample Sender",
    sender_phone: "+971500000000",
    sender_address: "Business Bay, Dubai",
    sender_address_2: "",
    sender_city: "Dubai",
    sender_state_province: "Dubai",
    sender_postal_code: "",
    sender_country_code: "AE",
    consignee_name: "Sample Receiver",
    consignee_phone: "+14165550123",
    consignee_alt_phone: "",
    consignee_address: "100 Queen Street",
    consignee_address_2: "",
    consignee_city: "Toronto",
    consignee_state_province: "ON",
    consignee_postal_code: "M5H 2N2",
    consignee_country_code: "CA",
    consignee_area: "",
    consignee_landmark: "",
    pieces: 1,
    weight_kg: 2,
    description: "Sample goods",
    value: 49.99,
    cod_amount: 0,
    delivery_instructions: "",
    transport_mode: "air",
    length_cm: 30,
    width_cm: 20,
    height_cm: 10,
    hscode: "123456",
  };
  const body = [headers, headers.map((header) => sample[header] ?? "")]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="international-shipments-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
