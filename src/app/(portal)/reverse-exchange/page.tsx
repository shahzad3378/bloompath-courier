import Link from "next/link";
import {
  ArrowLeftRight,
  PackagePlus,
  RotateCcw,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { ReverseOrdersTable } from "@/components/reverse-orders-table";
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
        <ReverseOrdersTable rows={rows as any} />
      )}
    </div>
  );
}
