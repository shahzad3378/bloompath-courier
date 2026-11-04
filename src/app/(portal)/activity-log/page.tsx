import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export const metadata = { title: "Activity Log" };
const modules = ["shipments", "customer_tracking_events", "profiles", "organization_settings", "shipper_business_profiles", "dispatch_runs", "pickup_manifests", "return_runs", "delivery_attempts", "warehouse_reattempt_receipts", "pickup_manifest_items", "driver_custody_scans", "fulfillment_products", "fulfillment_orders", "fulfillment_inventory_movements", "shipper_rates", "shipper_zone_rates", "carrier_rate_cards", "shipper_tariff_cards", "fulfillment_group_charges", "fulfillment_product_shipper_rates", "invoices", "settlements", "third_party_shipment_links", "third_party_status_updates"];
const zones = ["America/Toronto", "Asia/Dubai", "UTC"];
type Params = Record<string, string | undefined>;
type Entry = { id: number; actor_id: string | null; actor_name: string | null; actor_email: string | null; actor_role: string | null; entity_type: string; entity_id: string; record_label: string; shipment_id: number | null; action: string; changes: Record<string, { old: unknown; new: unknown }>; source: string; occurred_at: string; recorded_at: string | null };
const human = (s: string) => s.replaceAll("_", " ");
function value(v: unknown) { return v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v); }
function date(v: string, zone: string) { return new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "medium", timeStyle: "medium" }).format(new Date(v)); }
function validDay(v: string | undefined) { return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v; }
export default async function ActivityLogPage({ searchParams }: { searchParams: Promise<Params> }) {
 const profile = await requireProfile(["super_admin", "operations_admin"]);
 const params = await searchParams;
 const zone = zones.includes(params.tz ?? "") ? params.tz! : "America/Toronto";
 const page = /^\d+$/.test(params.page ?? "") ? Math.max(1, Math.min(100000, Number(params.page))) : 1;
 const q = (params.q ?? "").trim().slice(0,120);
 const moduleFilter = modules.includes(params.module ?? "") ? params.module! : "";
 const invalidDates = (!!params.from && !validDay(params.from)) || (!!params.to && !validDay(params.to)) || (!!params.from && !!params.to && params.from > params.to);
 const supabase = await createClient();
 let query = supabase.from("activity_log").select("*",{count:"exact"}).eq("organization_id",profile.organization_id!).order("sort_at",{ascending:false}).order("id",{ascending:false});
 if(q) query=query.ilike("record_label",`%${q.replace(/[\\%_]/g,"\\$&")}%`);
 if(moduleFilter) query=query.eq("entity_type",moduleFilter);
 if(/^[\da-f-]{36}$/i.test(params.actor ?? "")) query=query.eq("actor_id",params.actor!);
 if(!invalidDates && validDay(params.from)) query=query.gte("sort_at",`${params.from}T00:00:00Z`);
 if(!invalidDates && validDay(params.to)) query=query.lt("sort_at",new Date(Date.parse(`${params.to}T00:00:00Z`)+86400000).toISOString());
 const [{data,count,error},{data:users,error:usersError}]=await Promise.all([query.range((page-1)*50,page*50-1),supabase.from("profiles").select("id,full_name,email").eq("organization_id",profile.organization_id!).order("full_name")]);
 const href=(n:number)=>{const p=new URLSearchParams();for(const[k,v]of Object.entries(params))if(v&&k!=="page")p.set(k,v);p.set("page",String(n));return `/activity-log?${p}`;};
 const pages=Math.max(1,Math.ceil((count??0)/50));
 if(!error&&page>pages)redirect(href(pages));
 const rows=(data??[])as Entry[];
 return <div className="bp-page space-y-5">
 <div><p className="bp-section-label">Administration</p><h1 className="bp-heading mt-1 text-3xl font-black">Activity Log</h1><p className="mt-2 text-sm text-[#74827b]">See who changed a record, what changed and when it was recorded.</p></div>
 <div className="bp-panel p-4 text-sm leading-6">Times shown in <strong>{zone}</strong>. “Recorded at” is the actual save time for new changes; “Event time” can be backdated. Historical entries show their existing event time only, because their original save time was not captured. A warehouse entry records an action in the system; it does not independently prove physical receipt.</div>
 <form action="/activity-log" method="get" noValidate className="bp-panel grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
 <label className="text-xs font-semibold">AWB, reference or record<input name="q" defaultValue={q} className="bp-input mt-1 w-full"/></label>
 <label className="text-xs font-semibold">User<select name="actor" defaultValue={params.actor??""} className="bp-input mt-1 w-full"><option value="">All users and system</option>{(users??[]).map(u=><option key={u.id} value={u.id}>{u.full_name||u.email}</option>)}</select></label>
 <label className="text-xs font-semibold">Module<select name="module" defaultValue={moduleFilter} className="bp-input mt-1 w-full"><option value="">All audited modules</option>{modules.map(m=><option key={m} value={m}>{human(m)}</option>)}</select></label>
 <label className="text-xs font-semibold">Display timezone<select name="tz" defaultValue={zone} className="bp-input mt-1 w-full">{zones.map(z=><option key={z}>{z}</option>)}</select></label>
 <label className="text-xs font-semibold">From date (UTC)<input type="date" name="from" defaultValue={params.from??""} className="bp-input mt-1 w-full"/></label>
 <label className="text-xs font-semibold">To date (UTC)<input type="date" name="to" defaultValue={params.to??""} className="bp-input mt-1 w-full"/></label>
 <div className="flex flex-wrap items-end gap-2"><button className="bp-button-primary">Apply filters</button><Link href="/activity-log" className="bp-button-secondary">Clear filters</Link></div></form>
 {invalidDates?<p role="alert">Choose valid dates, with From on or before To. Date filters have not been applied.</p>:null}
 {usersError?<p role="alert">User choices could not be loaded. Refresh to try again.</p>:null}
 <section className="bp-panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><p className="text-sm font-semibold" aria-live="polite">{error?"Activity could not be loaded":`${(count??0).toLocaleString()} entries · Page ${page} of ${pages}`}</p><nav aria-label="Activity pages" className="flex gap-3 text-sm">{page>1?<Link className="bp-button-secondary" href={href(page-1)}>Previous</Link>:null}{page<pages?<Link className="bp-button-secondary" href={href(page+1)}>Next</Link>:null}</nav></div>
 {error?<div role="alert" className="p-6">Activity log could not be loaded. <Link href={href(page)} className="underline">Try again</Link>.</div>:!rows.length?<p className="p-6 text-sm">No activity matches these filters. Clear filters or search another AWB.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#f4f7f6] text-xs"><tr>{["Recorded at / Event time","User","Record","Action / Source","Changes"].map(h=><th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t align-top">
 <td className="px-4 py-4"><p className="font-semibold">{row.recorded_at?date(row.recorded_at,zone):"Historical: save time unknown"}</p><p className="mt-1 text-xs">Event: {date(row.occurred_at,zone)}</p><p className="mt-1 text-xs text-[#74827b]">{zone}</p></td>
 <td className="px-4 py-4"><p className="font-semibold">{row.actor_name||row.actor_email||(row.actor_id?"Historical user":row.source.startsWith("legacy")?"Actor not recorded":"System / integration")}</p><p className="mt-1 break-all text-xs">{row.actor_email}</p><p className="mt-1 text-xs capitalize">{human(row.actor_role??"")}</p></td>
 <td className="max-w-64 break-words px-4 py-4">{row.shipment_id?<Link href={`/shipments/${row.shipment_id}`} className="font-mono font-semibold underline">{row.record_label}</Link>:<strong>{row.record_label}</strong>}<p className="mt-1 text-xs capitalize">{human(row.entity_type)} · #{row.entity_id}</p></td>
 <td className="px-4 py-4"><p className="font-semibold capitalize">{human(row.action)}</p><p className="mt-1 text-xs capitalize">{human(row.source)}</p></td>
 <td className="min-w-80 max-w-lg px-4 py-4"><details><summary className="cursor-pointer font-semibold">{Object.keys(row.changes).length} changed fields</summary><dl className="mt-3 space-y-3">{Object.entries(row.changes).map(([field,change])=><div key={field} className="break-words"><dt className="text-xs font-bold capitalize">{human(field)}</dt><dd className="mt-1 text-xs"><span className="font-semibold">Before:</span> {value(change.old)}<br/><span className="font-semibold">After:</span> {value(change.new)}</dd></div>)}</dl></details></td>
 </tr>)}</tbody></table></div>}</section>
 <p className="text-xs leading-5 text-[#74827b]">Audit entries cannot be edited or deleted through the portal. New changes are captured for shipments, tracking, staff accounts, company settings, warehouse, dispatch, fulfillment, rates and finance. Passwords, API keys and payment credentials are excluded. Historical coverage is limited to retained shipment events and manual tracking updates.</p></div>;
}
