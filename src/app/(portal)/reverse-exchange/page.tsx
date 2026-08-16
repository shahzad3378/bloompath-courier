import Link from "next/link";
import {
  ArrowLeftRight,
  PackagePlus,
  RotateCcw,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { ReverseOrderActions } from "@/components/reverse-order-actions";

export const metadata = {
  title: "Reverse & Exchange",
};

export default async function ReverseExchangePage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    error?: string;
    reverse_awb?: string;
  }>;
}) {
  const profile = await requireProfile([
    ...internalRoles,
    "shipper",
  ]);

  const notices = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("reverse_orders")
    .select(`
      id,
      reverse_number,
      order_type,
      status,
      customer_name,
      customer_phone,
      pickup_city,
      service_zone_name,
      reason,
      requested_at,
      original:shipments!reverse_orders_original_shipment_id_fkey(
        tracking_number
      ),
      replacement:shipments!reverse_orders_replacement_shipment_id_fkey(
        tracking_number
      ),
      reverse_shipment:shipments!reverse_orders_reverse_shipment_id_fkey(
        id,
        tracking_number
      )
    `)
    .eq(
      "organization_id",
      profile.organization_id,
    )
    .order("requested_at", {
      ascending: false,
    });

  if (profile.role === "shipper") {
    query = query.eq(
      "shipper_id",
      profile.id,
    );
  }

  const { data, error } = await query;

  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-[1250px]">
      {notices.created === "1" ? (
        <div className="mb-5 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          Reverse / Exchange request created successfully.
          {notices.reverse_awb
            ? ` Reverse AWB ${notices.reverse_awb} is ready to print.`
            : ""}
        </div>
      ) : null}

      {notices.error ? (
        <div className="mb-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          Reverse request was created, but its physical AWB could not be completed. Review this request before continuing.
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#188459]">
            Parcel Operations
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            Reverse & Exchange
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Customer reverse pickups and replacement
            exchanges. Failed-delivery RTO remains separate.
          </p>
        </div>

        <Link
          href="/reverse-exchange/new"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white"
        >
          <PackagePlus className="size-4" />
          New Reverse / Exchange
        </Link>
      </div>

      {error ? (
        <div className="mt-7 rounded-2xl border border-[#efc7c7] bg-[#fff1f1] p-6 text-sm font-semibold text-[#a13f3f]">
          Reverse & Exchange requests could not be loaded.
        </div>
      ) : rows.length === 0 ? (
        <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-[#e0e8e4] bg-white p-8 text-center">
          <div>
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#edf8f2] text-[#188459]">
              <ArrowLeftRight className="size-8" />
            </span>

            <h2 className="mt-4 text-xl font-bold text-[#26372f]">
              No reverse operations
            </h2>

            <p className="mt-2 text-sm text-[#7a8881]">
              Create a reverse pickup or exchange from a
              delivered AWB.
            </p>
          </div>
        </section>
      ) : (
        <div className="mt-7 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-left text-sm">
              <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[10px] uppercase tracking-[0.08em] text-[#77847e]">
                <tr>
                  <th className="w-12 px-4 py-3.5">
                    <input
                      type="checkbox"
                      aria-label="Select all reverse orders"
                      className="size-4 rounded border-[#cfdad4]"
                    />
                  </th>
                  <th className="px-4 py-3.5">Request</th>
                  <th className="px-4 py-3.5">Customer</th>
                  <th className="px-4 py-3.5">AWBs</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-[#fbfcfb]">
                    <td className="px-4 py-4 align-top">
                      <input
                        type="checkbox"
                        name="reverse_order_ids"
                        value={row.id}
                        aria-label={`Select ${row.reverse_number}`}
                        className="mt-1 size-4 rounded border-[#cfdad4]"
                      />
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="flex items-center gap-2">
                        {row.order_type === "exchange" ? (
                          <ArrowLeftRight className="size-4 text-[#376eb1]" />
                        ) : (
                          <RotateCcw className="size-4 text-[#b76223]" />
                        )}

                        <p className="font-mono text-sm font-black text-[#26372f]">
                          {row.reverse_number}
                        </p>
                      </div>

                      <p className="mt-2 text-[10px] font-bold uppercase text-[#87938d]">
                        {row.order_type === "exchange"
                          ? "Exchange"
                          : "Reverse Pickup"}
                      </p>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <p className="font-bold text-[#34453c]">
                        {row.customer_name}
                      </p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        {row.customer_phone}
                      </p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        {row.pickup_city}
                        {row.service_zone_name
                          ? ` · ${row.service_zone_name}`
                          : ""}
                      </p>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <p className="text-[10px] font-bold uppercase text-[#87938d]">
                        Original AWB
                      </p>
                      <p className="mt-1 font-mono text-xs font-bold text-[#13734b]">
                        {row.original?.tracking_number || "—"}
                      </p>

                      {row.replacement?.tracking_number ? (
                        <>
                          <p className="mt-2 text-[10px] font-bold uppercase text-[#87938d]">
                            Replacement AWB
                          </p>
                          <p className="mt-1 font-mono text-xs font-bold text-[#376eb1]">
                            {row.replacement.tracking_number}
                          </p>
                        </>
                      ) : null}

                      <p className="mt-2 text-[10px] font-bold uppercase text-[#87938d]">
                        Reverse AWB
                      </p>
                      <p className={`mt-1 font-mono text-xs font-black ${
                        row.reverse_shipment?.tracking_number
                          ? "text-[#b76223]"
                          : "text-[#a2ada7]"
                      }`}>
                        {row.reverse_shipment?.tracking_number || "Not generated"}
                      </p>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <span className="inline-flex rounded-full bg-[#edf8f2] px-2.5 py-1 text-[10px] font-black uppercase text-[#13734b]">
                        {String(row.status).replaceAll("_", " ")}
                      </span>

                      {row.reason ? (
                        <p className="mt-2 max-w-[180px] text-xs text-[#87938d]">
                          {row.reason}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-4 text-right align-top">
                      <ReverseOrderActions
                        reverseOrderId={row.id}
                        reverseShipmentId={row.reverse_shipment?.id ?? null}
                        reverseTrackingNumber={
                          row.reverse_shipment?.tracking_number ?? null
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
