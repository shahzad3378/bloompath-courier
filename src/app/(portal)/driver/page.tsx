import Link from "next/link";
import { ArrowRight, CheckCircle2, MapPin, PackageCheck, Route, Truck } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { type DispatchRun, type DispatchRunItem } from "@/lib/dispatch";
import { formatAed, formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My Delivery Route" };

type DriverRun = DispatchRun & { dispatch_run_items: DispatchRunItem[] };

export default async function DriverPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>;
}) {
  const profile = await requireProfile(["driver"]);
  const { updated } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispatch_runs")
    .select("*, dispatch_run_items(*, shipments(*))")
    .eq("driver_id", profile.id)
    .eq("status", "handed_over")
    .order("handed_over_at", { ascending: true });
  const runs = (data ?? []) as unknown as DriverRun[];
  const pendingCount = runs.reduce((sum, run) => sum + run.dispatch_run_items.filter((item) => !item.completed_at).length, 0);

  return (
    <div className="mx-auto max-w-[1050px]">
      {updated === "1" ? <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]"><CheckCircle2 className="size-5" /> Delivery result and proof saved successfully.</div> : null}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-[#188459]">Driver application</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">My delivery route</h1><p className="mt-2 text-sm text-[#74827b]">Open an AWB, complete the attempt and upload a proof photo.</p></div>
        <div className="rounded-xl border border-[#d9e7df] bg-white px-5 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7f8d86]">Pending stops</p><p className="mt-1 text-2xl font-black text-[#13734b]">{pendingCount}</p></div>
      </div>

      {error ? <div className="mt-7 rounded-2xl border border-[#efc7c7] bg-[#fff1f1] p-8 text-center text-sm font-semibold text-[#a13f3f]">Your route could not be loaded.</div> : runs.length === 0 ? <section className="mt-7 grid min-h-96 place-items-center rounded-2xl border border-[#e0e8e4] bg-white p-8 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#e7f4ed] text-[#188459]"><Route className="size-8" /></span><h2 className="mt-4 text-xl font-bold text-[#26372f]">No active route</h2><p className="mt-2 text-sm text-[#7a8881]">Your next handed-over route will appear here automatically.</p></div></section> : <div className="mt-7 space-y-6">{runs.map((run) => {
        const pending = run.dispatch_run_items.filter((item) => !item.completed_at);
        return <section key={run.id} className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]"><div className="border-b border-[#e6ede9] bg-[#10291f] px-5 py-5 text-white sm:flex sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Truck className="size-5 text-[#48bf83]" /><p className="font-mono text-sm font-black">{run.run_number}</p></div><h2 className="mt-2 text-xl font-bold">{run.route_name}</h2><p className="mt-1 text-xs text-white/55">Handed over {run.handed_over_at ? formatDubaiDate(run.handed_over_at) : "—"}</p></div><div className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-right sm:mt-0"><p className="text-[10px] uppercase tracking-wide text-white/55">Remaining</p><p className="mt-1 text-2xl font-black">{pending.length}</p></div></div><div className="divide-y divide-[#edf1ef]">{pending.map((item) => <Link key={item.id} href={`/driver/deliveries/${item.id}`} className="grid gap-4 px-5 py-5 transition hover:bg-[#f8fbf9] sm:grid-cols-[1.15fr_1fr_110px_auto] sm:items-center"><div><div className="flex items-center gap-2"><PackageCheck className="size-4 text-[#188459]" /><p className="font-mono text-sm font-black text-[#24362d]">{item.shipments.tracking_number}</p></div><p className="mt-2 font-bold text-[#34453c]">{item.shipments.consignee_name}</p><p className="mt-1 text-xs text-[#87938d]">{item.shipments.consignee_phone}</p></div><div><p className="flex items-start gap-2 text-sm font-semibold text-[#516159]"><MapPin className="mt-0.5 size-4 shrink-0 text-[#376eb1]" />{item.shipments.consignee_area || item.shipments.consignee_city}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-[#87938d]">{item.shipments.consignee_address}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Collect</p><p className="mt-1 text-sm font-black text-[#13734b]">{formatAed(item.shipments.cod_amount)}</p><p className="mt-1 text-xs font-semibold text-[#68766f]">Attempt #{item.shipments.delivery_attempt_count + 1}</p></div><span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]"><ArrowRight className="size-5" /></span></Link>)}</div></section>;
      })}</div>}
    </div>
  );
}
