import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Check,
  PackageCheck,
  Printer,
  Trash2,
  Truck,
} from "lucide-react";
import {
  handoverReturnRunAction,
  removeReturnAwbAction,
} from "@/app/(portal)/returns/actions";
import { ReturnAwbScanForm } from "@/components/return-forms";
import { ReturnHandoverCompletionForm } from "@/components/return-handover-completion-form";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Return Handover",
};

const returnRoles = [
  "super_admin",
  "operations_admin",
  "warehouse_staff",
  "dispatcher",
] as const;

type ReturnItem = {
  id: number;
  shipment_id: number;
  completed_at: string | null;
  shipments: {
    tracking_number: string;
    sender_name: string;
    sender_phone: string;
    sender_address: string;
    sender_city: string;
    delivery_attempt_count: number;
    last_undelivered_reason: string | null;
  };
};

type ReturnRun = {
  id: number;
  run_number: string;
  route_name: string;
  shipper_id: string | null;
  status: string;
  created_at: string;
  handed_over_at: string | null;
  completed_at: string | null;
  signed_manifest_path: string | null;
  received_by_name: string | null;
  manifest_notes: string | null;
  manifest_uploaded_at: string | null;

  driver: {
    full_name: string;
    employee_code: string | null;
    phone: string | null;
  } | null;

  shipper: {
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;
};

export default async function ReturnRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    handed_over?: string;
    error?: string;
  }>;
}) {
  await requireProfile(returnRoles);

  const { id } = await params;
  const notices = await searchParams;

  if (!/^\d+$/.test(id)) notFound();

  const supabase = await createClient();

  const [{ data: runData }, { data: itemData }] =
    await Promise.all([
      supabase
        .from("return_runs")
        .select(`
          id,
          run_number,
          route_name,
          shipper_id,
          status,
          created_at,
          handed_over_at,
          completed_at,
          signed_manifest_path,
          received_by_name,
          manifest_notes,
          manifest_uploaded_at,
          driver:profiles!return_runs_driver_id_fkey(
            full_name,
            employee_code,
            phone
          ),
          shipper:profiles!return_runs_shipper_id_fkey(
            full_name,
            email,
            phone
          )
        `)
        .eq("id", id)
        .maybeSingle(),

      supabase
        .from("return_run_items")
        .select("*, shipments(*)")
        .eq("run_id", id)
        .order("added_at", { ascending: true }),
    ]);

  if (!runData) notFound();

  const run = runData as unknown as ReturnRun;
  const items = (itemData ?? []) as unknown as ReturnItem[];
  const completed = items.filter((item) => item.completed_at).length;

  let signedManifestUrl: string | null = null;

  if (run.signed_manifest_path) {
    const { data: signedManifest } = await supabase.storage
      .from("return-manifests")
      .createSignedUrl(run.signed_manifest_path, 3600);

    signedManifestUrl = signedManifest?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto max-w-[1350px]">
      <Link
        href="/returns"
        className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"
      >
        <ArrowLeft className="size-4" />
        Back to returns
      </Link>

      {notices.handed_over === "1" ? (
        <div className="mb-5 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          Return handover confirmed. These AWBs are now assigned to the selected driver.
        </div>
      ) : null}

      {notices.error ? (
        <div className="mb-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          Return handover failed. Confirm that all AWBs belong to the selected shipper and are warehouse-ready.
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#b76223]">
            Return to Seller handover
          </p>
          <h1 className="mt-1 font-mono text-3xl font-black tracking-[-0.035em] text-[#17231e]">
            {run.run_number}
          </h1>
          <p className="mt-2 text-sm text-[#74827b]">
            {run.shipper?.full_name || run.route_name} · Created {formatDubaiDate(run.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="rounded-xl border border-[#dde7e2] bg-white px-4 py-3 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
              Return progress
            </p>
            <p className="mt-1 text-lg font-black text-[#26372f]">
              {completed} / {items.length}
            </p>
          </div>

          {items.length > 0 ? (
            <Link
              href={`/returns/${run.id}/manifest`}
              target="_blank"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#d7e3dd] bg-white px-4 text-sm font-bold text-[#13734b]"
            >
              <Printer className="size-4" />
              Print Manifest
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {run.status === "draft" ? (
            <ReturnAwbScanForm runId={run.id} />
          ) : null}

          {run.status === "completed" ? (
            <div className="flex items-center gap-3 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-4 text-sm font-semibold text-[#176a47]">
              <Check className="size-5" />
              All shipments were returned to sellers with POD.
            </div>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
            <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
              <div>
                <h2 className="font-bold text-[#26372f]">
                  Return AWBs
                </h2>
                <p className="mt-1 text-xs text-[#87938d]">
                  {items.length} shipment{items.length === 1 ? "" : "s"}
                </p>
              </div>
              <PackageCheck className="size-5 text-[#b76223]" />
            </div>

            {items.length === 0 ? (
              <div className="grid min-h-52 place-items-center p-8 text-center">
                <p className="text-sm font-semibold text-[#596861]">
                  No return AWBs scanned yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                  <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]">
                    <tr>
                      <th className="px-5 py-3.5">AWB</th>
                      <th className="px-5 py-3.5">Original consignee</th>
                      <th className="px-5 py-3.5">Seller city</th>
                      <th className="px-5 py-3.5">Reason</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#edf1ef]">
                    {items.map((item) => (
                      <tr key={item.id} className="text-sm">
                        <td className="px-5 py-4">
                          <Link
                            href={`/shipments/${item.shipment_id}`}
                            className="font-mono font-black text-[#13734b]"
                          >
                            {item.shipments.tracking_number}
                          </Link>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-semibold text-[#34453c]">
                            {item.shipments.sender_name}
                          </p>
                          <p className="mt-1 text-xs text-[#87938d]">
                            {item.shipments.sender_phone}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-[#516159]">
                          {item.shipments.sender_city}
                        </td>

                        <td className="px-5 py-4 text-xs font-semibold capitalize text-[#68766f]">
                          {item.shipments.last_undelivered_reason
                            ?.replaceAll("_", " ") ?? "Return"}
                        </td>

                        <td className="px-5 py-4">
                          {item.completed_at ? (
                            <span className="rounded-full bg-[#e4f3ea] px-2.5 py-1 text-xs font-bold text-[#166b47]">
                              Returned
                            </span>
                          ) : (
                            <span className="rounded-full bg-[#fff0e5] px-2.5 py-1 text-xs font-bold text-[#b76223]">
                              Pending
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">
                          {run.status === "draft" ? (
                            <form action={removeReturnAwbAction}>
                              <input
                                type="hidden"
                                name="run_id"
                                value={run.id}
                              />
                              <input
                                type="hidden"
                                name="item_id"
                                value={item.id}
                              />
                              <button
                                aria-label={`Remove ${item.shipments.tracking_number}`}
                                className="inline-grid size-9 place-items-center rounded-lg border border-[#edd1d1] text-[#a13f3f]"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-[#9aa39f]">
                              Locked
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-[#eadac9] bg-[#fffaf5] p-5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#9b7455]">
              Selected Shipper
            </p>

            <h2 className="mt-2 text-lg font-black text-[#493627]">
              {run.shipper?.full_name || run.route_name}
            </h2>

            <p className="mt-2 text-xs text-[#806d5d]">
              {run.shipper?.email || "No email recorded"}
            </p>

            <p className="mt-1 text-xs text-[#806d5d]">
              {run.shipper?.phone || "No phone recorded"}
            </p>

            <p className="mt-3 text-[11px] font-semibold text-[#9b7455]">
              Every AWB in this handover must belong to this shipper.
            </p>
          </section>

          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#e8f0fb] text-[#376eb1]">
                <Truck className="size-5" />
              </span>
              <div>
                <p className="text-xs text-[#819088]">
                  Assigned driver
                </p>
                <h2 className="font-bold text-[#26372f]">
                  {run.driver?.full_name ?? "Driver"}
                </h2>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm text-[#62716a]">
              <p>
                {run.driver?.employee_code || "No employee code"}
              </p>
              <p>{run.driver?.phone || "No phone recorded"}</p>
            </div>
          </section>

          {run.status === "handed_over" ? (
            <ReturnHandoverCompletionForm
              runId={run.id}
              awbCount={items.length}
            />
          ) : null}

          {run.status === "completed" ? (
            <section className="rounded-2xl border border-[#bfe3cf] bg-[#f3fbf6] p-5">
              <div className="flex items-center gap-3">
                <Check className="size-5 text-[#176a47]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#5d8c75]">
                    Return completed
                  </p>
                  <h2 className="mt-1 font-black text-[#176a47]">
                    Seller Handover Confirmed
                  </h2>
                </div>
              </div>

              {run.received_by_name ? (
                <p className="mt-4 text-xs text-[#61756b]">
                  Received by: <strong>{run.received_by_name}</strong>
                </p>
              ) : null}

              {run.manifest_uploaded_at ? (
                <p className="mt-2 text-xs text-[#61756b]">
                  Manifest received {formatDubaiDate(run.manifest_uploaded_at)}
                </p>
              ) : null}

              {run.manifest_notes ? (
                <p className="mt-3 rounded-xl bg-white/70 p-3 text-xs leading-5 text-[#61756b]">
                  {run.manifest_notes}
                </p>
              ) : null}

              {signedManifestUrl ? (
                <a
                  href={signedManifestUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-[#b8d9c7] bg-white px-4 text-xs font-black text-[#13734b]"
                >
                  View Signed Manifest
                </a>
              ) : null}
            </section>
          ) : null}

          {run.status === "draft" ? (
            <form
              action={handoverReturnRunAction}
              className="rounded-2xl border border-[#eadac9] bg-white p-5"
            >
              <input
                type="hidden"
                name="run_id"
                value={run.id}
              />

              <h2 className="font-bold text-[#26372f]">
                Handover to Driver
              </h2>

              <p className="mt-2 text-xs leading-5 text-[#7a8881]">
                Confirm that the driver physically received all scanned shipments for return to this shipper.
              </p>

              <button
                disabled={items.length === 0}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#b76223] px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                <Truck className="size-4" />
                Confirm Driver Handover
              </button>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
