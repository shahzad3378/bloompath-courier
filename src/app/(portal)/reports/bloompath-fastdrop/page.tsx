import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileSpreadsheet, PackageCheck } from "lucide-react";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { ReportDateFields } from "@/components/report-date-fields";
import { SelectableTable } from "@/components/selectable-table";
import { RefreshStatusButton } from "./refresh-status-button";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { resolveReportDateRange } from "@/lib/report-date-range";
import { parseTablePagination, type TableSearchParams } from "@/lib/table-pagination";
import { createClient } from "@/lib/supabase/server";
import { hasCanadaPrimaryMarket } from "@/lib/market-access";

export const metadata = { title: "BloomPath FastDrop Report" };

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function BloomPathFastDropReportPage({ searchParams }: {
  searchParams: Promise<TableSearchParams>;
}) {
  const profile = await requireProfile(internalRoles);
  if (!profile.organization_id || !(await hasCanadaPrimaryMarket(profile.organization_id))) redirect("/dashboard");
  const params = await searchParams;
  const pagination = parseTablePagination(params);
  const { range, start, endExclusive, error: rangeError } = resolveReportDateRange(params);
  const supabase = await createClient();

  const search = String(params.q ?? "").trim().slice(0,100);
  // Shipments are the source of truth: BroadReach bookings may not have a third_party_shipment_links row.
  let shipmentsQuery = supabase.from("shipments").select("id, tracking_number, reference_number, consignee_name, consignee_address, consignee_address_2, consignee_city, consignee_state_province, consignee_postal_code, consignee_country_code, weight_kg, booked_at")
    .eq("organization_id", profile.organization_id).is("deleted_at", null).order("booked_at", {ascending:false});
  if (!search) shipmentsQuery = shipmentsQuery.gte("booked_at",start.toISOString()).lt("booked_at",endExclusive.toISOString());
  if (search) shipmentsQuery = shipmentsQuery.or(`tracking_number.ilike.%${search.replaceAll(",","").replaceAll("%","")}%,reference_number.ilike.%${search.replaceAll(",","").replaceAll("%","")}%,consignee_name.ilike.%${search.replaceAll(",","").replaceAll("%")}%`);
  const { data: shipmentData, error } = rangeError ? {data:null,error:{message:rangeError}} : await shipmentsQuery.limit(5000);
  const shipmentIds = (shipmentData ?? []).map(x=>Number(x.id));
  const [linkResult, broadreachResult, gtaResult] = await Promise.all([
    shipmentIds.length ? supabase.from("third_party_shipment_links").select("shipment_id, partner_tracking_number, partner_status, third_party_carriers(code,name)").eq("organization_id",profile.organization_id).in("shipment_id",shipmentIds) : Promise.resolve({data:[]}),
    shipmentIds.length ? supabase.from("broadreach_bookings").select("shipment_id, partner_tracking_number, status").eq("organization_id",profile.organization_id).eq("is_test",false).in("shipment_id",shipmentIds) : Promise.resolve({data:[]}),
    shipmentIds.length ? supabase.from("gta_airskip_bookings").select("shipment_id, partner_tracking_number, status").eq("organization_id",profile.organization_id).eq("is_test",false).in("shipment_id",shipmentIds) : Promise.resolve({data:[]}),
  ]);
  type Partner = {shipment_id:number;carrier:string;partner_tracking_number:string|null;partner_status:string|null};
  const partners:Partner[] = [
    ...(linkResult.data??[]).map(x=>({shipment_id:Number(x.shipment_id),carrier:relation(x.third_party_carriers)?.name??"3PL",partner_tracking_number:x.partner_tracking_number,partner_status:x.partner_status})),
    ...(broadreachResult.data??[]).map(x=>({shipment_id:Number(x.shipment_id),carrier:"BroadReach",partner_tracking_number:x.partner_tracking_number,partner_status:x.status})),
    ...(gtaResult.data??[]).map(x=>({shipment_id:Number(x.shipment_id),carrier:"GTA/GSM",partner_tracking_number:x.partner_tracking_number,partner_status:x.status})),
  ];
  const rows = (shipmentData??[]).flatMap(shipment=>{
    const matches=partners.filter(x=>x.shipment_id===Number(shipment.id));
    const unique=new Map<string,Partner>();
    for(const partner of matches){const key=partner.carrier.toLowerCase().includes("broad")?"broadreach":partner.carrier.toLowerCase().includes("gta")?"gta":partner.carrier;const previous=unique.get(key);if(!previous?.partner_tracking_number||partner.partner_tracking_number)unique.set(key,partner);}
    return [...unique.values()].map(partner=>({
      customerReference:shipment.reference_number??"",fastDropAwb:shipment.tracking_number??"",shipmentId:shipment.id,
      carrier:partner.carrier,threePlAwb:partner.partner_tracking_number??"",threePlStatus:partner.partner_status??"pending",
      consigneeName:shipment.consignee_name??"",address1:shipment.consignee_address??"",address2:shipment.consignee_address_2??"",city:shipment.consignee_city??"",stateProvince:shipment.consignee_state_province??"",postalCode:shipment.consignee_postal_code??"",country:shipment.consignee_country_code??"",weightKg:shipment.weight_kg??"",
    }));
  });
  const allRows=rows.filter(row=>!search||[row.customerReference,row.fastDropAwb,row.threePlAwb,row.consigneeName].some(value=>String(value).toLowerCase().includes(search.toLowerCase())));
  const count=allRows.length;
  const pagedRows=allRows.slice(pagination.from,pagination.to+1);
  const exportParams = new URLSearchParams();
  exportParams.set("range", range);
  if (params.from) exportParams.set("from", params.from);
  if (params.to) exportParams.set("to", params.to);
  if (search) exportParams.set("q", search);
  const csvHref = `/reports/bloompath-fastdrop/export?${new URLSearchParams([...exportParams, ["format", "csv"]]).toString()}`;
  const excelHref = `/reports/bloompath-fastdrop/export?${exportParams.toString()}`;

  return <div className="bp-page">
    <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div>
        <p className="bp-section-label">Reports</p>
        <h1 className="bp-heading mt-1 text-3xl font-black">BloomPath FastDrop</h1>
        <p className="mt-2 text-sm text-[#74827b]">Match each customer reference and FastDrop AWB with its 3PL AWB.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RefreshStatusButton range={range} from={params.from ?? ""} to={params.to ?? ""} page={pagination.page} pageSize={pagination.pageSize} />
        <a href={csvHref} className="bp-button-secondary"><Download className="size-4" />CSV</a>
        <a href={excelHref} className="bp-button-primary"><FileSpreadsheet className="size-4" />Excel</a>
      </div>
    </header>

    <form action="/reports/bloompath-fastdrop" method="get" className="bp-panel mt-6 grid gap-3 p-4 md:grid-cols-4 xl:grid-cols-5"><label className="col-span-full text-xs font-bold">Search customer reference, FastDrop AWB, 3PL tracking or consignee<input name="q" defaultValue={search} placeholder="Enter reference or tracking number" className="mt-2 w-full rounded-xl border border-[#dcd5c8] bg-white px-4 py-3 text-sm" /></label>
      <ReportDateFields range={range} from={params.from ?? ""} to={params.to ?? ""} />
      <button className="bp-button-primary self-end">Apply date filter</button>
    </form>

    <section className="bp-panel mt-5 overflow-hidden">
      <div className="bp-panel-header flex items-center justify-between gap-3">
        <div><h2 className="font-black text-[#26372f]">Shipment AWB mapping</h2><p className="mt-1 text-xs text-[#87938d]">Customer reference · FastDrop AWB · consignee · address · weight · 3PL AWB/status</p></div>
        <p className="inline-flex items-center gap-2 text-xs font-bold text-[#15905c]"><PackageCheck className="size-4" />{allRows.length.toLocaleString()} matched shipments</p>
      </div>
      <DataTableToolbar pathname="/reports/bloompath-fastdrop" params={params} page={pagination.page} pageSize={pagination.pageSize} total={count ?? 0} showDates={false} />
      {error ? <p role="alert" className="p-8 text-center text-sm font-semibold text-[#b74646]">Report could not be loaded. Check the date range and try again.</p> : allRows.length === 0 ? <p className="p-10 text-center text-sm text-[#87938d]">No 3PL-linked shipments found for this period.</p> : <SelectableTable visibleCount={pagedRows.length}>
        <table className="w-full min-w-[1480px] text-left text-sm"><thead className="sticky top-0 bg-[#f8faf9] text-[11px] uppercase text-[#77847e]"><tr>
          <th className="px-4 py-3">Select</th><th className="px-4 py-3">Customer Reference Number</th><th className="px-4 py-3">FastDrop AWB</th><th className="px-4 py-3">Consignee Name</th><th className="px-4 py-3">Address 1</th><th className="px-4 py-3">Address 2</th><th className="px-4 py-3">City</th><th className="px-4 py-3">State / Province</th><th className="px-4 py-3">Postal Code</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Weight (kg)</th><th className="px-4 py-3">3PL Provider</th><th className="px-4 py-3">3PL AWB</th><th className="px-4 py-3">3PL Status</th>
        </tr></thead><tbody>{pagedRows.map((row, index) => <tr key={`${row.fastDropAwb}-${index}`} className="border-t border-[#edf1ef]">
          <td className="px-4 py-3.5"><input type="checkbox" data-table-row-select value={row.fastDropAwb} aria-label={`Select ${row.fastDropAwb}`} className="size-4 accent-[#13734b]" /></td>
          <td className="px-4 py-3.5">{row.customerReference || "—"}</td><td className="px-4 py-3.5 font-mono font-bold">{row.fastDropAwb}</td><td className="px-4 py-3.5 font-semibold">{row.consigneeName}</td><td className="px-4 py-3.5">{row.address1}</td><td className="px-4 py-3.5">{row.address2}</td><td className="px-4 py-3.5">{row.city}</td><td className="px-4 py-3.5">{row.stateProvince}</td><td className="px-4 py-3.5">{row.postalCode}</td><td className="px-4 py-3.5">{row.country}</td><td className="px-4 py-3.5">{row.weightKg}</td><td className="px-4 py-3.5 font-semibold">{row.carrier}</td><td className="px-4 py-3.5 font-mono">{row.threePlAwb || "—"}</td><td className="px-4 py-3.5 capitalize">{row.threePlStatus.replaceAll("_", " ")}</td>
        </tr>)}</tbody></table>
      </SelectableTable>}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#e8eeeb] px-4 py-3 text-xs text-[#68766f]"><Link href="/reports" className="font-bold text-[#13734b] hover:underline">Back to Delivery Reports</Link></div>
    </section>
  </div>;
}
