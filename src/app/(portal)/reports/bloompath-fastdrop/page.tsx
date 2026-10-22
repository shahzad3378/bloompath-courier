import Link from "next/link";
import { Download, FileSpreadsheet, PackageCheck } from "lucide-react";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { ReportDateFields } from "@/components/report-date-fields";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { resolveReportDateRange } from "@/lib/report-date-range";
import { parseTablePagination, type TableSearchParams } from "@/lib/table-pagination";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "BloomPath FastDrop Report" };

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function BloomPathFastDropReportPage({ searchParams }: {
  searchParams: Promise<TableSearchParams>;
}) {
  const profile = await requireProfile(internalRoles);
  if (!profile.organization_id) throw new Error("Organization is not configured.");
  const params = await searchParams;
  const pagination = parseTablePagination(params);
  const { range, start, endExclusive, error: rangeError } = resolveReportDateRange(params);
  const supabase = await createClient();

  const query = supabase.from("third_party_shipment_links").select(`
    shipment_id,
    partner_tracking_number,
    shipments!inner(organization_id, tracking_number, reference_number, booked_at, deleted_at)
  `, { count: "exact" })
    .eq("organization_id", profile.organization_id)
    .eq("shipments.organization_id", profile.organization_id)
    .is("shipments.deleted_at", null)
    .gte("shipments.booked_at", start.toISOString())
    .lt("shipments.booked_at", endExclusive.toISOString())
    .order("created_at", { ascending: false });

  const { data, error, count } = rangeError
    ? { data: null, error: { message: rangeError }, count: 0 }
    : await query.range(pagination.from, pagination.to);
  const rows = (data ?? []).flatMap((item) => {
    const shipment = relation(item.shipments);
    return shipment ? [{
      customerReference: shipment.reference_number ?? "",
      fastDropAwb: shipment.tracking_number ?? "",
      threePlAwb: item.partner_tracking_number ?? "",
    }] : [];
  });

  const exportParams = new URLSearchParams();
  exportParams.set("range", range);
  if (params.from) exportParams.set("from", params.from);
  if (params.to) exportParams.set("to", params.to);
  const csvHref = `/reports/bloompath-fastdrop/export?${new URLSearchParams([...exportParams, ["format", "csv"]]).toString()}`;
  const excelHref = `/reports/bloompath-fastdrop/export?${exportParams.toString()}`;

  return <div className="bp-page">
    <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div>
        <p className="bp-section-label">Reports</p>
        <h1 className="bp-heading mt-1 text-3xl font-black">BloomPath FastDrop</h1>
        <p className="mt-2 text-sm text-[#74827b]">Match each customer reference and FastDrop AWB with its 3PL AWB.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={csvHref} className="bp-button-secondary"><Download className="size-4" />CSV</a>
        <a href={excelHref} className="bp-button-primary"><FileSpreadsheet className="size-4" />Excel</a>
      </div>
    </header>

    <form action="/reports/bloompath-fastdrop" method="get" className="bp-panel mt-6 grid gap-3 p-4 md:grid-cols-4 xl:grid-cols-5">
      <ReportDateFields range={range} from={params.from ?? ""} to={params.to ?? ""} />
      <button className="bp-button-primary self-end">Apply date filter</button>
    </form>

    <section className="bp-panel mt-5 overflow-hidden">
      <div className="bp-panel-header flex items-center justify-between gap-3">
        <div><h2 className="font-black text-[#26372f]">Shipment AWB mapping</h2><p className="mt-1 text-xs text-[#87938d]">Customer reference · FastDrop AWB · 3PL AWB</p></div>
        <p className="inline-flex items-center gap-2 text-xs font-bold text-[#15905c]"><PackageCheck className="size-4" />{(count ?? 0).toLocaleString()} shipments</p>
      </div>
      <DataTableToolbar pathname="/reports/bloompath-fastdrop" params={params} page={pagination.page} pageSize={pagination.pageSize} total={count ?? 0} showDates={false} />
      {error ? <p role="alert" className="p-8 text-center text-sm font-semibold text-[#b74646]">Report could not be loaded. Check the date range and try again.</p> : rows.length === 0 ? <p className="p-10 text-center text-sm text-[#87938d]">No 3PL-linked shipments found for this period.</p> : <div className="max-h-[680px] overflow-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="sticky top-0 bg-[#f8faf9] text-[11px] uppercase text-[#77847e]"><tr><th className="px-5 py-3">Customer Reference Number</th><th className="px-5 py-3">FastDrop AWB</th><th className="px-5 py-3">3PL AWB</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.fastDropAwb}-${index}`} className="border-t border-[#edf1ef]"><td className="px-5 py-3.5">{row.customerReference || "—"}</td><td className="px-5 py-3.5 font-mono font-bold">{row.fastDropAwb}</td><td className="px-5 py-3.5 font-mono">{row.threePlAwb || "—"}</td></tr>)}</tbody></table></div>}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#e8eeeb] px-4 py-3 text-xs text-[#68766f]"><Link href="/reports" className="font-bold text-[#13734b] hover:underline">Back to Delivery Reports</Link></div>
    </section>
  </div>;
}
