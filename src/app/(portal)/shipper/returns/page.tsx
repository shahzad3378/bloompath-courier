import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RotateCcw,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "My Returns",
};

function statusClasses(status: string) {
  if (status === "returned_to_shipper") {
    return "bg-[#e8f7ef] text-[#13734b]";
  }

  if (status === "return_initiated") {
    return "bg-[#fff3df] text-[#a66516]";
  }

  return "bg-[#f1f5f3] text-[#68766f]";
}

export default async function ShipperReturnsPage() {
  const profile = await requireProfile(["shipper"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shipments")
    .select(`
      id,
      tracking_number,
      reference_number,
      consignee_name,
      consignee_city,
      status,
      delivery_attempt_count,
      last_undelivered_reason,
      booked_at,
      updated_at
    `)
    .eq("shipper_id", profile.id)
    .in("status", [
      "return_initiated",
      "returned_to_shipper",
    ])
    .is("deleted_at", null)
    .order("updated_at", {
      ascending: false,
    });

  const rows = data ?? [];

  const pending = rows.filter(
    (row) => row.status === "return_initiated",
  );

  const completed = rows.filter(
    (row) => row.status === "returned_to_shipper",
  );

  return (
    <div className="bp-page">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="bp-section-label">
            Shipper Portal
          </p>

          <h1 className="bp-heading mt-1 text-3xl font-black">
            Returns
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-[#74827b]">
            Track shipments waiting to be returned and confirm
            completed returns to your account.
          </p>
        </div>

        <Link
          href="/shipper"
          className="bp-button-secondary"
        >
          Back to Overview
        </Link>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="bp-card p-5">
          <RotateCcw className="size-5 text-[#b76223]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {pending.length}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            To Be Returned
          </p>
        </div>

        <div className="bp-card p-5">
          <CheckCircle2 className="size-5 text-[#15905c]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {completed.length}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Returned to Seller
          </p>
        </div>

        <div className="bp-card p-5">
          <PackageCheck className="size-5 text-[#3f82df]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {rows.length}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Total Return AWBs
          </p>
        </div>
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header">
          <h2 className="font-black text-[#26372f]">
            Return Shipments
          </h2>

          <p className="mt-1 text-xs text-[#87938d]">
            AWB-level return status and delivery-attempt history.
          </p>
        </div>

        {error ? (
          <p className="p-10 text-center text-sm font-semibold text-[#b74646]">
            Return shipments could not be loaded.
          </p>
        ) : rows.length === 0 ? (
          <div className="grid min-h-56 place-items-center p-8 text-center">
            <div>
              <RotateCcw className="mx-auto size-9 text-[#a6b2ac]" />

              <p className="mt-4 text-sm font-bold text-[#53645c]">
                No return shipments
              </p>

              <p className="mt-1 text-xs text-[#87938d]">
                Return activity will appear here automatically.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-5 py-3">AWB</th>
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">Consignee</th>
                  <th className="px-5 py-3">City</th>
                  <th className="px-5 py-3">Attempts</th>
                  <th className="px-5 py-3">Return Reason</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last Update</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="bp-table-row"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/shipments/${row.id}`}
                        className="font-mono text-xs font-black text-[#13734b]"
                      >
                        {row.tracking_number}
                      </Link>
                    </td>

                    <td className="px-5 py-4 text-xs text-[#68766f]">
                      {row.reference_number || "—"}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-bold text-[#34453c]">
                        {row.consignee_name}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-[#68766f]">
                      {row.consignee_city || "—"}
                    </td>

                    <td className="px-5 py-4 font-bold">
                      {row.delivery_attempt_count}
                    </td>

                    <td className="px-5 py-4 text-xs font-semibold capitalize text-[#68766f]">
                      {row.last_undelivered_reason
                        ?.replaceAll("_", " ") ||
                        "Return to seller"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClasses(
                          row.status,
                        )}`}
                      >
                        {row.status.replaceAll("_", " ")}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-xs text-[#68766f]">
                      {formatDubaiDate(row.updated_at)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/shipments/${row.id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#13734b]"
                      >
                        Details
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pending.length > 0 ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#eadac9] bg-[#fffaf5] p-4">
          <Clock3 className="mt-0.5 size-5 shrink-0 text-[#b76223]" />

          <p className="text-xs leading-5 text-[#796a50]">
            Shipments in <strong>To Be Returned</strong> are still
            in the courier return workflow. Once the signed seller
            handover is completed, they will automatically move to
            <strong> Returned to Seller</strong>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
