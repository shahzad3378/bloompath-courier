import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { resolveReportDateRange } from "@/lib/report-date-range";
import { createClient } from "@/lib/supabase/server";
import { hasCanadaPrimaryMarket } from "@/lib/market-access";

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const profile = await requireProfile(internalRoles);
  if (!profile.organization_id || !(await hasCanadaPrimaryMarket(profile.organization_id))) return new Response("This report is only available in the Canada portal.", { status: 403 });
  const url = new URL(request.url);
  const { start, endExclusive, error: rangeError } = resolveReportDateRange({
    range: url.searchParams.get("range"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (rangeError) return new Response(rangeError, { status: 400 });
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const supabase = await createClient();
  const search=(url.searchParams.get("q")??"").trim().slice(0,100);
  let shipmentQuery=supabase.from("shipments").select("id,tracking_number,reference_number,consignee_name,consignee_address,consignee_address_2,consignee_city,consignee_state_province,consignee_postal_code,consignee_country_code,weight_kg").eq("organization_id",profile.organization_id).is("deleted_at",null);
  if(!search)shipmentQuery=shipmentQuery.gte("booked_at",start.toISOString()).lt("booked_at",endExclusive.toISOString());
  const shipments:NonNullable<Awaited<ReturnType<typeof shipmentQuery.range>>["data"]>=[];
  for(let offset=0;;offset+=1000){const {data,error}=await shipmentQuery.range(offset,offset+999);if(error)return new Response("Report unavailable",{status:500});shipments.push(...(data??[]));if((data??[]).length<1000)break;}
  const ids=shipments.map(x=>Number(x.id));
  const partners:{shipment_id:number;carrier:string;tracking:string;status:string}[]=[];
  for(let offset=0;offset<ids.length;offset+=500){
    const batch=ids.slice(offset,offset+500);
    const [b,g,l]=await Promise.all([
      supabase.from("broadreach_bookings").select("shipment_id,partner_tracking_number,status").eq("organization_id",profile.organization_id).eq("is_test",false).in("shipment_id",batch),
      supabase.from("gta_airskip_bookings").select("shipment_id,partner_tracking_number,status").eq("organization_id",profile.organization_id).eq("is_test",false).in("shipment_id",batch),
      supabase.from("third_party_shipment_links").select("shipment_id,partner_tracking_number,partner_status,third_party_carriers(name,code)").eq("organization_id",profile.organization_id).in("shipment_id",batch)
    ]);
    partners.push(...(b.data??[]).map(x=>({shipment_id:Number(x.shipment_id),carrier:"BroadReach",tracking:x.partner_tracking_number??"",status:x.status??"pending"})));
    partners.push(...(g.data??[]).map(x=>({shipment_id:Number(x.shipment_id),carrier:"GTA/GSM",tracking:x.partner_tracking_number??"",status:x.status??"pending"})));
    partners.push(...(l.data??[]).map(x=>({shipment_id:Number(x.shipment_id),carrier:relation(x.third_party_carriers)?.name??"3PL",tracking:x.partner_tracking_number??"",status:x.partner_status??"pending"})));
  }
  const headers=["Customer Reference Number","FastDrop AWB","3PL Provider","Consignee Name","Address 1","Address 2","City","State / Province","Postal Code","Country","Weight (kg)","3PL AWB","3PL Status"];
  const rows=shipments.flatMap(shipment=>{
    const matched=partners.filter(x=>x.shipment_id===Number(shipment.id));
    const unique=new Map<string,(typeof matched)[number]>();
    for(const p of matched){const key=p.carrier.toLowerCase().includes("broad")?"broad":p.carrier.toLowerCase().includes("gta")?"gta":p.carrier;if(!unique.get(key)?.tracking||p.tracking)unique.set(key,p);}
    return [...unique.values()].filter(p=>!search||[shipment.reference_number,shipment.tracking_number,shipment.consignee_name,p.tracking].some(x=>String(x??"").toLowerCase().includes(search.toLowerCase()))).map(p=>[shipment.reference_number??"",shipment.tracking_number??"",p.carrier,shipment.consignee_name??"",shipment.consignee_address??"",shipment.consignee_address_2??"",shipment.consignee_city??"",shipment.consignee_state_province??"",shipment.consignee_postal_code??"",shipment.consignee_country_code??"",shipment.weight_kg??"",p.tracking,p.status]);
  });
  const dateStamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  const filename = `bloompath-fastdrop-${dateStamp}.${format === "csv" ? "csv" : "xlsx"}`;

  if (format === "csv") {
    const body = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    return new Response(body, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    } });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("BloomPath FastDrop", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = headers.map((header) => ({ header, width: Math.max(18, Math.min(34, header.length + 5)) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13734B" } };
  for (const row of rows) sheet.addRow(row);
  sheet.autoFilter = { from: "A1", to: "M1" };
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(bytes, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  } });
}
