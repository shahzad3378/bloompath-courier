import Link from "next/link";
import { ArrowRight, Route, Truck } from "lucide-react";
import { CreateDispatchRunForm } from "@/components/dispatch-forms";
import { requireProfile } from "@/lib/auth";
import {
  dispatchStatusClass,
  dispatchStatusLabels,
  type DispatchRun,
} from "@/lib/dispatch";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dispatch" };

const dispatchRoles = ["super_admin", "operations_admin", "warehouse_staff", "dispatcher"] as const;

type DispatchListRow = DispatchRun & {
  profiles: { full_name: string; employee_code: string | null } | null;
  dispatch_run_items: Array<{ id: number; completed_at: string | null }>;
};

export default async function DispatchPage() {
  await requireProfile(dispatchRoles);
  const supabase = await createClient();
  const [{ data: driverData }, { data: runData, error }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, employee_code")
      .eq("role", "driver")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("dispatch_runs")
      .select("*, profiles!dispatch_runs_driver_id_fkey(full_name, employee_code), dispatch_run_items(id, completed_at)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const drivers = driverData ?? [];
  const runs = (runData ?? []) as unknown as DispatchListRow[];

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#188459]">Last-mile operations</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Dispatch routes</h1>
          <p className="mt-2 text-sm text-[#74827b]">Assign warehouse AWBs to drivers and monitor every delivery result.</p>
        </div>
        <div className="rounded-xl border border-[#d9e7df] bg-white px-5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#7f8d86]">Active routes</p>
          <p className="mt-1 text-2xl font-black text-[#13734b]">{runs.filter((run) => run.status !== "completed").length}</p>
        </div>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[360px_1fr]">
        <CreateDispatchRunForm drivers={drivers} />
        <section className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
          <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
            <div><h2 className="font-bold text-[#26372f]">Recent routes</h2><p className="mt-1 text-xs text-[#87938d]">Latest 100 dispatch runs</p></div>
            <Route className="size-5 text-[#188459]" />
          </div>
          {error ? (
            <p className="p-8 text-center text-sm font-semibold text-[#b74646]">Routes could not be loaded.</p>
          ) : runs.length === 0 ? (
            <div className="grid min-h-72 place-items-center p-8 text-center"><div><Truck className="mx-auto size-10 text-[#9aaba2]" /><h2 className="mt-4 font-bold text-[#405048]">No routes yet</h2><p className="mt-1 text-sm text-[#87938d]">Create a route and scan warehouse AWBs into it.</p></div></div>
          ) : (
            <div className="divide-y divide-[#edf1ef]">
              {runs.map((run) => {
                const total = run.dispatch_run_items.length;
                const completed = run.dispatch_run_items.filter((item) => item.completed_at).length;
                const percent = total ? Math.round((completed / total) * 100) : 0;
                return (
                  <Link key={run.id} href={`/dispatch/${run.id}`} className="grid gap-4 px-5 py-5 transition hover:bg-[#fbfcfb] sm:grid-cols-[1.2fr_1fr_1fr_130px_auto] sm:items-center">
                    <div><p className="font-mono text-sm font-black text-[#24362d]">{run.run_number}</p><p className="mt-1 text-xs font-semibold text-[#68766f]">{run.route_name}</p></div>
                    <div><p className="text-sm font-bold text-[#405048]">{run.profiles?.full_name ?? "Driver"}</p><p className="mt-1 text-xs text-[#87938d]">{run.profiles?.employee_code ?? "No employee code"}</p></div>
                    <div><div className="h-2 overflow-hidden rounded-full bg-[#edf1ef]"><div className="h-full rounded-full bg-[#2ca66e]" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs font-semibold text-[#68766f]">{completed}/{total} completed</p></div>
                    <div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${dispatchStatusClass(run.status)}`}>{dispatchStatusLabels[run.status]}</span><p className="mt-2 text-[11px] text-[#87938d]">{formatDubaiDate(run.created_at)}</p></div>
                    <span className="grid size-9 place-items-center rounded-lg border border-[#dfe7e3] text-[#13734b]"><ArrowRight className="size-4" /></span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
