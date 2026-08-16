import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Return Handover Manifest",
};

function relation<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function ReturnManifestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile([
    "super_admin",
    "operations_admin",
    "warehouse_staff",
    "dispatcher",
    "driver",
  ]);

  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  const [
    { data: runData },
    { data: itemsData },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("return_runs")
      .select(`
        id,
        organization_id,
        run_number,
        shipper_id,
        driver_id,
        status,
        created_at,
        handed_over_at,
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
      .eq("id", Number(id))
      .maybeSingle(),

    supabase
      .from("return_run_items")
      .select(`
        id,
        shipment_id,
        added_at,
        completed_at,
        shipments(
          tracking_number,
          reference_number,
          sender_name,
          sender_phone,
          sender_address,
          sender_city,
          consignee_name,
          consignee_city,
          delivery_attempt_count,
          last_undelivered_reason
        )
      `)
      .eq("run_id", Number(id))
      .order("added_at", { ascending: true }),

    supabase
      .from("organization_settings")
      .select(`
        legal_name,
        display_name,
        contact_email,
        contact_phone,
        address,
        city,
        trn,
        logo_url
      `)
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
  ]);

  if (!runData) {
    notFound();
  }

  const driver = relation(runData.driver);
  const shipper = relation(runData.shipper);
  const items = itemsData ?? [];

  const company =
    settings?.display_name ||
    settings?.legal_name ||
    "Courier Company";

  return (
    <main className="min-h-screen bg-[#eef2f0] p-5 text-black print:bg-white print:p-0">
      <script
        dangerouslySetInnerHTML={{
          __html:
            "window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})",
        }}
      />

      <article className="mx-auto max-w-[1000px] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-5">
          <div className="flex items-start gap-4">
            {settings?.logo_url ? (
              <img
                src={settings.logo_url}
                alt={company}
                className="h-16 w-16 object-contain"
              />
            ) : null}

            <div>
              <h1 className="text-2xl font-black">
                {company}
              </h1>

              <p className="mt-1 text-xs">
                {[settings?.address, settings?.city]
                  .filter(Boolean)
                  .join(", ")}
              </p>

              {settings?.contact_phone ? (
                <p className="mt-1 text-xs">
                  {settings.contact_phone}
                </p>
              ) : null}

              {settings?.trn ? (
                <p className="mt-1 text-xs">
                  TRN: {settings.trn}
                </p>
              ) : null}
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.15em]">
              Return Handover Manifest
            </p>

            <p className="mt-2 font-mono text-xl font-black">
              {runData.run_number}
            </p>

            <p className="mt-2 text-xs">
              Created: {formatDubaiDate(runData.created_at)}
            </p>

            {runData.handed_over_at ? (
              <p className="mt-1 text-xs">
                Driver handover:{" "}
                {formatDubaiDate(runData.handed_over_at)}
              </p>
            ) : null}
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-5">
          <div className="border border-black p-4">
            <p className="text-[10px] font-bold uppercase">
              Return To / Shipper
            </p>

            <p className="mt-2 text-base font-black">
              {shipper?.full_name || "Shipper"}
            </p>

            <p className="mt-1 text-xs">
              {shipper?.email || "—"}
            </p>

            <p className="mt-1 text-xs">
              {shipper?.phone || "—"}
            </p>
          </div>

          <div className="border border-black p-4">
            <p className="text-[10px] font-bold uppercase">
              Assigned Driver
            </p>

            <p className="mt-2 text-base font-black">
              {driver?.full_name || "Driver"}
            </p>

            <p className="mt-1 text-xs">
              Employee Code:{" "}
              {driver?.employee_code || "—"}
            </p>

            <p className="mt-1 text-xs">
              {driver?.phone || "—"}
            </p>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-2 flex justify-between text-xs font-bold">
            <span>AWB Handover Detail</span>
            <span>Total AWBs: {items.length}</span>
          </div>

          <table className="w-full border-collapse text-left text-[10px]">
            <thead>
              <tr className="border-y-2 border-black">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">AWB</th>
                <th className="py-2 pr-2">Reference</th>
                <th className="py-2 pr-2">Original Consignee</th>
                <th className="py-2 pr-2">City</th>
                <th className="py-2 pr-2">Attempts</th>
                <th className="py-2">Return Reason</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item, index) => {
                const shipment = relation(item.shipments);

                return (
                  <tr
                    key={item.id}
                    className="border-b border-black/25"
                  >
                    <td className="py-2 pr-2">
                      {index + 1}
                    </td>

                    <td className="py-2 pr-2 font-mono font-bold">
                      {shipment?.tracking_number || "—"}
                    </td>

                    <td className="py-2 pr-2">
                      {shipment?.reference_number || "—"}
                    </td>

                    <td className="py-2 pr-2">
                      {shipment?.consignee_name || "—"}
                    </td>

                    <td className="py-2 pr-2">
                      {shipment?.consignee_city || "—"}
                    </td>

                    <td className="py-2 pr-2">
                      {shipment?.delivery_attempt_count ?? 0}
                    </td>

                    <td className="py-2 capitalize">
                      {shipment?.last_undelivered_reason
                        ?.replaceAll("_", " ") ||
                        "Return to seller"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-black">
              Driver Handover Confirmation
            </p>

            <div className="mt-12 border-t border-black pt-2 text-[10px]">
              Driver Signature
            </div>

            <div className="mt-8 border-t border-black pt-2 text-[10px]">
              Date / Time
            </div>
          </div>

          <div>
            <p className="text-xs font-black">
              Shipper Receipt Confirmation
            </p>

            <div className="mt-12 border-t border-black pt-2 text-[10px]">
              Shipper Name / Signature
            </div>

            <div className="mt-8 border-t border-black pt-2 text-[10px]">
              Company Stamp / Date
            </div>
          </div>
        </section>

        <footer className="mt-10 border-t border-black pt-3 text-[9px] leading-4">
          The above shipments were handed over to the assigned
          driver for return to the stated shipper. The receiving
          shipper should verify the AWB count and sign/stamp this
          manifest as proof of receipt.
        </footer>
      </article>
    </main>
  );
}
