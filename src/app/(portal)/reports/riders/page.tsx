import Link from "next/link";
import {
  Download,
  FileText,
  PackageCheck,
  RotateCcw,
  Truck,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Rider Reports",
};

export default async function RiderReportsPage() {
  const profile = await requireProfile(internalRoles);

  const supabase = await createClient();

  const [
    { data: drivers },
    { data: shipments },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        employee_code
      `)
      .eq("organization_id", profile.organization_id)
      .eq("role", "driver")
      .eq("status", "active")
      .order("full_name"),

    supabase
      .from("shipments")
      .select(`
        assigned_driver_id,
        status
      `)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null),
  ]);

  const shipmentRows = shipments ?? [];

  const rows = (drivers ?? []).map((driver) => {
    const assigned = shipmentRows.filter(
      (row) =>
        row.assigned_driver_id === driver.id,
    );

    const delivered = assigned.filter(
      (row) => row.status === "delivered",
    ).length;

    const undelivered = assigned.filter(
      (row) => row.status === "undelivered",
    ).length;

    const returns = assigned.filter(
      (row) =>
        row.status === "return_initiated" ||
        row.status === "returned_to_shipper",
    ).length;

    const deliveryRate =
      assigned.length > 0
        ? Math.round(
            (delivered / assigned.length) * 100,
          )
        : 0;

    return {
      ...driver,
      assigned: assigned.length,
      delivered,
      undelivered,
      returns,
      deliveryRate,
    };
  });

  const totalAssigned = rows.reduce(
    (sum, row) => sum + row.assigned,
    0,
  );

  const totalDelivered = rows.reduce(
    (sum, row) => sum + row.delivered,
    0,
  );

  const totalReturns = rows.reduce(
    (sum, row) => sum + row.returns,
    0,
  );

  return (
    <div className="bp-page">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="bp-section-label">
            Reports
          </p>

          <h1 className="bp-heading mt-1 text-3xl font-black">
            Rider Reports
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Rider workload, delivery outcomes and field
            performance.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/reports/riders/export-pdf"
            className="bp-button-secondary"
          >
            <FileText className="size-4" />
            PDF
          </Link>

          <Link
            href="/reports/riders/export-xlsx"
            className="bp-button-secondary"
          >
            <Download className="size-4" />
            Excel
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bp-card p-5">
          <Truck className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {rows.length}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Active Riders
          </p>
        </div>

        <div className="bp-card p-5">
          <PackageCheck className="size-5 text-[#3f82df]" />
          <p className="mt-4 text-2xl font-black">
            {totalAssigned}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Assigned AWBs
          </p>
        </div>

        <div className="bp-card p-5">
          <PackageCheck className="size-5 text-[#15905c]" />
          <p className="mt-4 text-2xl font-black">
            {totalDelivered}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Delivered
          </p>
        </div>

        <div className="bp-card p-5">
          <RotateCcw className="size-5 text-[#b74646]" />
          <p className="mt-4 text-2xl font-black">
            {totalReturns}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Returns / RTO
          </p>
        </div>
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header">
          <h2 className="font-black text-[#26372f]">
            Rider Performance
          </h2>

          <p className="mt-1 text-xs text-[#87938d]">
            Assignment and delivery performance by rider.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#87938d]">
            No active riders available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-4 py-3">Rider</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Delivered</th>
                  <th className="px-4 py-3">Undelivered</th>
                  <th className="px-4 py-3">RTO</th>
                  <th className="px-4 py-3">Delivery Rate</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="bp-table-row"
                  >
                    <td className="px-4 py-4">
                      <p className="font-bold text-[#34453c]">
                        {row.full_name || row.email}
                      </p>

                      <p className="mt-1 text-[10px] text-[#87938d]">
                        {row.employee_code ||
                          "No employee code"}
                      </p>
                    </td>

                    <td className="px-4 py-4 font-bold">
                      {row.assigned}
                    </td>

                    <td className="px-4 py-4 font-black text-[#13734b]">
                      {row.delivered}
                    </td>

                    <td className="px-4 py-4 font-black text-[#b76223]">
                      {row.undelivered}
                    </td>

                    <td className="px-4 py-4 font-bold text-[#b74646]">
                      {row.returns}
                    </td>

                    <td className="px-4 py-4">
                      <span className="rounded-full bg-[#edf8f2] px-2.5 py-1 text-[10px] font-black text-[#13734b]">
                        {row.deliveryRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
