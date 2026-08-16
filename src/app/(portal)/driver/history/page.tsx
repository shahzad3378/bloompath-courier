import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  PackageCheck,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Driver History",
};

type RangeKey = "today" | "7d" | "30d" | "all";

function dubaiDayStartUtc(date: Date) {
  const dubai = new Date(
    date.getTime() + 4 * 60 * 60 * 1000,
  );

  return new Date(
    Date.UTC(
      dubai.getUTCFullYear(),
      dubai.getUTCMonth(),
      dubai.getUTCDate(),
    ) -
      4 * 60 * 60 * 1000,
  );
}

function addDays(date: Date, days: number) {
  return new Date(
    date.getTime() + days * 86400000,
  );
}

export default async function DriverHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    q?: string;
  }>;
}) {
  const profile = await requireProfile(["driver"]);
  const params = await searchParams;

  const requestedRange = params.range ?? "7d";

  const range: RangeKey = [
    "today",
    "7d",
    "30d",
    "all",
  ].includes(requestedRange)
    ? (requestedRange as RangeKey)
    : "7d";

  const search = String(params.q ?? "")
    .trim()
    .toUpperCase();

  const now = new Date();
  const todayStart = dubaiDayStartUtc(now);

  let start: Date | null = addDays(
    todayStart,
    -6,
  );

  if (range === "today") {
    start = todayStart;
  } else if (range === "30d") {
    start = addDays(
      todayStart,
      -29,
    );
  } else if (range === "all") {
    start = null;
  }

  const supabase = await createClient();

  let attemptQuery = supabase
    .from("delivery_attempts")
    .select(`
      id,
      shipment_id,
      attempt_number,
      outcome,
      undelivered_reason,
      notes,
      proof_path,
      created_at,
      shipments!inner(
        tracking_number,
        consignee_name,
        consignee_city
      )
    `)
    .eq("performed_by", profile.id)
    .order("created_at", {
      ascending: false,
    })
    .limit(500);

  if (start) {
    attemptQuery = attemptQuery.gte(
      "created_at",
      start.toISOString(),
    );
  }

  const [
    { data: attemptData, error: attemptError },
    { data: returnData, error: returnError },
  ] = await Promise.all([
    attemptQuery,

    (() => {
      let query = supabase
        .from("return_run_items")
        .select(`
          id,
          shipment_id,
          completed_at,
          proof_path,
          notes,
          shipments!inner(
            tracking_number,
            sender_name,
            sender_city
          ),
          return_runs!inner(
            driver_id,
            run_number
          )
        `)
        .eq(
          "return_runs.driver_id",
          profile.id,
        )
        .not("completed_at", "is", null)
        .order("completed_at", {
          ascending: false,
        })
        .limit(500);

      if (start) {
        query = query.gte(
          "completed_at",
          start.toISOString(),
        );
      }

      return query;
    })(),
  ]);

  const attempts = (attemptData ?? []).filter(
    (row: any) =>
      !search ||
      row.shipments?.tracking_number
        ?.toUpperCase()
        .includes(search),
  );

  const returns = (returnData ?? []).filter(
    (row: any) =>
      !search ||
      row.shipments?.tracking_number
        ?.toUpperCase()
        .includes(search),
  );

  const delivered = attempts.filter(
    (row: any) => row.outcome === "delivered",
  ).length;

  const undelivered = attempts.filter(
    (row: any) => row.outcome === "undelivered",
  ).length;

  return (
    <div className="mx-auto max-w-[1150px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#188459]">
            Driver application
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            My History
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Your completed delivery attempts and
            seller returns.
          </p>
        </div>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#dce8e1] bg-white p-5">
          <CheckCircle2 className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {delivered}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Delivered
          </p>
        </div>

        <div className="rounded-2xl border border-[#eadfce] bg-white p-5">
          <XCircle className="size-5 text-[#b76223]" />
          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {undelivered}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Undelivered Attempts
          </p>
        </div>

        <div className="rounded-2xl border border-[#e1e6eb] bg-white p-5">
          <RotateCcw className="size-5 text-[#376eb1]" />
          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {returns.length}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Seller Returns
          </p>
        </div>
      </section>

      <form
        method="get"
        className="mt-5 grid gap-3 rounded-2xl border border-[#e0e8e4] bg-white p-4 sm:grid-cols-[180px_1fr_auto]"
      >
        <select
          name="range"
          defaultValue={range}
          className="h-11 rounded-xl border border-[#dce5e0] bg-white px-3 text-sm font-semibold"
        >
          <option value="today">
            Today
          </option>
          <option value="7d">
            Last 7 Days
          </option>
          <option value="30d">
            Last 30 Days
          </option>
          <option value="all">
            All History
          </option>
        </select>

        <div className="relative">
          <Search className="absolute left-3 top-3.5 size-4 text-[#8a9790]" />
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search AWB..."
            className="h-11 w-full rounded-xl border border-[#dce5e0] pl-10 pr-3 text-sm outline-none"
          />
        </div>

        <button className="h-11 rounded-xl bg-[#173b2d] px-5 text-sm font-bold text-white">
          Apply
        </button>
      </form>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
        <div className="border-b border-[#e8eeeb] px-5 py-4">
          <h2 className="font-bold text-[#26372f]">
            Delivery Attempts
          </h2>
          <p className="mt-1 text-xs text-[#87938d]">
            Delivered and undelivered stops completed by you.
          </p>
        </div>

        {attemptError ? (
          <p className="p-8 text-center text-sm font-semibold text-[#a13f3f]">
            Delivery history could not be loaded.
          </p>
        ) : attempts.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No delivery history found.
          </p>
        ) : (
          <div className="divide-y divide-[#edf1ef]">
            {attempts.map((row: any) => (
              <div
                key={row.id}
                className="grid gap-4 px-5 py-5 sm:grid-cols-[1.1fr_1fr_120px_160px] sm:items-center"
              >
                <div>
                  <Link
                    href={`/shipments/${row.shipment_id}`}
                    className="font-mono text-sm font-black text-[#13734b]"
                  >
                    {row.shipments?.tracking_number}
                  </Link>

                  <p className="mt-1 text-xs font-semibold text-[#596861]">
                    {row.shipments?.consignee_name}
                  </p>

                  <p className="mt-1 text-xs text-[#87938d]">
                    {row.shipments?.consignee_city}
                  </p>
                </div>

                <div>
                  {row.outcome === "delivered" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f7ef] px-2.5 py-1 text-xs font-bold text-[#13734b]">
                      <CheckCircle2 className="size-3.5" />
                      Delivered
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff0e5] px-2.5 py-1 text-xs font-bold text-[#b76223]">
                        <XCircle className="size-3.5" />
                        Undelivered
                      </span>

                      <p className="mt-2 text-xs font-semibold capitalize text-[#68766f]">
                        {row.undelivered_reason
                          ?.replaceAll("_", " ") ||
                          "Reason not recorded"}
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                    Attempt
                  </p>
                  <p className="mt-1 text-sm font-black text-[#34453c]">
                    #{row.attempt_number}
                  </p>
                </div>

                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold text-[#68766f]">
                    <Clock3 className="size-4" />
                    {formatDubaiDate(row.created_at)}
                  </p>

                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                    {row.proof_path
                      ? "POD Recorded"
                      : "No POD"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#eadac9] bg-white">
        <div className="border-b border-[#eadac9] px-5 py-4">
          <h2 className="font-bold text-[#26372f]">
            Return to Seller History
          </h2>
          <p className="mt-1 text-xs text-[#87938d]">
            Seller returns completed by you.
          </p>
        </div>

        {returnError ? (
          <p className="p-8 text-center text-sm font-semibold text-[#a13f3f]">
            Return history could not be loaded.
          </p>
        ) : returns.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No seller-return history found.
          </p>
        ) : (
          <div className="divide-y divide-[#edf1ef]">
            {returns.map((row: any) => (
              <div
                key={row.id}
                className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_1fr_180px] sm:items-center"
              >
                <div>
                  <Link
                    href={`/shipments/${row.shipment_id}`}
                    className="font-mono text-sm font-black text-[#b76223]"
                  >
                    {row.shipments?.tracking_number}
                  </Link>

                  <p className="mt-1 text-xs font-semibold text-[#596861]">
                    {row.shipments?.sender_name}
                  </p>

                  <p className="mt-1 text-xs text-[#87938d]">
                    {row.shipments?.sender_city}
                  </p>
                </div>

                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#fff0e5] px-2.5 py-1 text-xs font-bold text-[#b76223]">
                    <RotateCcw className="size-3.5" />
                    Returned to Seller
                  </span>

                  <p className="mt-2 font-mono text-xs font-bold text-[#68766f]">
                    {row.return_runs?.run_number}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-[#68766f]">
                    {row.completed_at
                      ? formatDubaiDate(row.completed_at)
                      : "—"}
                  </p>

                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                    {row.proof_path
                      ? "POD Recorded"
                      : "Completed"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
