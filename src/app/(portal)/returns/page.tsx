import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Truck,
} from "lucide-react";
import { CreateReturnRunForm } from "@/components/return-forms";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Returns",
};

const returnRoles = [
  "super_admin",
  "operations_admin",
  "warehouse_staff",
  "dispatcher",
] as const;

type ReturnRun = {
  id: number;
  run_number: string;
  route_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  profiles: {
    full_name: string;
    employee_code: string | null;
  } | null;
  return_run_items: Array<{
    id: number;
    completed_at: string | null;
  }>;
};

export default async function ReturnsPage() {
  await requireProfile(returnRoles);

  const supabase = await createClient();

  const [
    { data: driverData },
    { data: shipperData },
    { data: runData, error },
    { count: readyCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, employee_code")
      .eq("role", "driver")
      .eq("status", "active")
      .order("full_name"),

    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "shipper")
      .eq("status", "active")
      .order("full_name"),

    supabase
      .from("return_runs")
      .select(
        "*, profiles!return_runs_driver_id_fkey(full_name, employee_code), return_run_items(id, completed_at)",
      )
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("status", "return_initiated")
      .not("warehouse_received_at", "is", null)
      .is("assigned_driver_id", null)
      .is("deleted_at", null),
  ]);

  const drivers = driverData ?? [];
  const shippers = shipperData ?? [];
  const runs = (runData ?? []) as unknown as ReturnRun[];

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#b76223]">
            Reverse logistics
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            Return to Seller
          </h1>
          <p className="mt-2 text-sm text-[#74827b]">
            Prepare warehouse returns, assign drivers and capture seller POD.
          </p>
        </div>

        <div className="rounded-xl border border-[#eadac9] bg-white px-5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#7f8d86]">
            RTS ready
          </p>
          <p className="mt-1 text-2xl font-black text-[#b76223]">
            {readyCount ?? 0}
          </p>
        </div>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[360px_1fr]">
        <CreateReturnRunForm
          drivers={drivers}
          shippers={shippers}
        />

        <section className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
          <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
            <div>
              <h2 className="font-bold text-[#26372f]">
                Recent Return Handovers
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Latest shipper return handovers
              </p>
            </div>
            <RotateCcw className="size-5 text-[#b76223]" />
          </div>

          {error ? (
            <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
              Return handovers could not be loaded.
            </p>
          ) : runs.length === 0 ? (
            <div className="grid min-h-72 place-items-center p-8 text-center">
              <div>
                <Truck className="mx-auto size-10 text-[#9aaba2]" />
                <h2 className="mt-4 font-bold text-[#405048]">
                  No return handovers yet
                </h2>
                <p className="mt-1 text-sm text-[#87938d]">
                  Select a shipper and driver, then scan warehouse-ready return AWBs.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#edf1ef]">
              {runs.map((run) => {
                const total = run.return_run_items.length;
                const completed = run.return_run_items.filter(
                  (item) => item.completed_at,
                ).length;

                return (
                  <Link
                    key={run.id}
                    href={`/returns/${run.id}`}
                    className="grid gap-4 px-5 py-5 transition hover:bg-[#fbfcfb] sm:grid-cols-[1.2fr_1fr_1fr_140px_auto] sm:items-center"
                  >
                    <div>
                      <p className="font-mono text-sm font-black text-[#24362d]">
                        {run.run_number}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#68766f]">
                        {run.route_name}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-[#405048]">
                        {run.profiles?.full_name ?? "Driver"}
                      </p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        {run.profiles?.employee_code ?? "No employee code"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-[#68766f]">
                        {completed}/{total} completed
                      </p>
                    </div>

                    <div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          run.status === "completed"
                            ? "bg-[#e4f3ea] text-[#166b47]"
                            : run.status === "handed_over"
                              ? "bg-[#e7effb] text-[#356aa6]"
                              : "bg-[#fff0e5] text-[#b76223]"
                        }`}
                      >
                        {run.status === "completed"
                          ? "Completed"
                          : run.status === "handed_over"
                            ? "With driver"
                            : "Draft"}
                      </span>
                      <p className="mt-2 text-[11px] text-[#87938d]">
                        {formatDubaiDate(run.created_at)}
                      </p>
                    </div>

                    {run.status === "completed" ? (
                      <CheckCircle2 className="size-5 text-[#188459]" />
                    ) : (
                      <ArrowRight className="size-5 text-[#b76223]" />
                    )}
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
