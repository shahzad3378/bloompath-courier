import Link from "next/link";
import { ArrowLeft, Building2, PackageCheck, Truck } from "lucide-react";
import {
  BulkThreePLStatusForm,
  CreateCarrierForm,
  ThreePLHandoverForm,
  ThreePLStatusForm,
} from "@/components/three-pl-forms";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "3PL Dispatch" };

const roles = [
  "super_admin",
  "operations_admin",
  "warehouse_staff",
  "dispatcher",
] as const;

type ShipmentLinkRow = {
  id: number;
  partner_tracking_number: string | null;
  partner_status: string | null;
  shipments: {
    id: number;
    tracking_number: string;
    consignee_name: string;
    consignee_city: string;
    delivery_attempt_count: number;
  };
  third_party_carriers: {
    name: string;
    code: string;
  };
};

export default async function ThreePLDispatchPage() {
  const profile = await requireProfile(roles);

  if (!profile.organization_id) {
    throw new Error("Organization is not configured.");
  }

  const supabase = await createClient();

  const [{ data: carrierData }, { data: shipmentLinks }] = await Promise.all([
    supabase
      .from("third_party_carriers")
      .select("id, name, code, integration_mode")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("third_party_shipment_links")
      .select(`
        id,
        partner_tracking_number,
        partner_status,
        handed_over_at,
        last_status_at,
        shipments!inner(
          id,
          tracking_number,
          consignee_name,
          consignee_city,
          status,
          delivery_attempt_count
        ),
        third_party_carriers!inner(
          name,
          code
        )
      `)
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const carriers = (carrierData ?? []).map((carrier) => ({
    id: carrier.id,
    name: carrier.name,
    code: carrier.code,
  }));
  const linkedShipments = (shipmentLinks ?? []) as unknown as ShipmentLinkRow[];

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/dispatch"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#188459]"
          >
            <ArrowLeft className="size-4" />
            Own Fleet Dispatch
          </Link>

          <p className="mt-4 text-sm font-semibold text-[#188459]">
            Partner delivery network
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            3PL Dispatch
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Transfer warehouse shipments to external delivery partners and
            manage partner tracking internally.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dispatch/3pl/manifests" className="bp-button">Create 3PL Manifest</Link>
          <div className="rounded-xl border border-[#d9e7df] bg-white px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7f8d86]">
              Active partners
            </p>
            <p className="mt-1 text-2xl font-black text-[#13734b]">
              {carriers.length}
            </p>
          </div>

          <div className="rounded-xl border border-[#d9e7df] bg-white px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7f8d86]">
              3PL shipments
            </p>
            <p className="mt-1 text-2xl font-black text-[#13734b]">
              {linkedShipments.length}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        <CreateCarrierForm />
        <ThreePLHandoverForm carriers={carriers} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ThreePLStatusForm />
        <BulkThreePLStatusForm />
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
        <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
          <div>
            <h2 className="font-bold text-[#26372f]">
              Partner shipments
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Internal 3PL references — not visible to shippers
            </p>
          </div>

          <Building2 className="size-5 text-[#188459]" />
        </div>

        {linkedShipments.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-8 text-center">
            <div>
              <Truck className="mx-auto size-10 text-[#9aaba2]" />
              <h3 className="mt-4 font-bold text-[#405048]">
                No 3PL shipments
              </h3>
              <p className="mt-1 text-sm text-[#87938d]">
                Transfer a warehouse-ready AWB to a delivery partner.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-wide text-[#77847e]">
                <tr>
                  <th className="px-5 py-3.5">Our AWB</th>
                  <th className="px-5 py-3.5">3PL Partner</th>
                  <th className="px-5 py-3.5">Partner AWB</th>
                  <th className="px-5 py-3.5">Consignee</th>
                  <th className="px-5 py-3.5">Attempt</th>
                  <th className="px-5 py-3.5">Partner Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {linkedShipments.map((row) => (
                  <tr key={row.id} className="text-sm">
                    <td className="px-5 py-4">
                      <Link
                        href={`/shipments/${row.shipments.id}`}
                        className="inline-flex items-center gap-2 font-mono font-black text-[#13734b]"
                      >
                        <PackageCheck className="size-4" />
                        {row.shipments.tracking_number}
                      </Link>
                    </td>

                    <td className="px-5 py-4 font-semibold">
                      {row.third_party_carriers.name}
                    </td>

                    <td className="px-5 py-4 font-mono text-xs">
                      {row.partner_tracking_number || "Pending"}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-semibold">
                        {row.shipments.consignee_name}
                      </p>
                      <p className="mt-1 text-xs text-[#87938d]">
                        {row.shipments.consignee_city}
                      </p>
                    </td>

                    <td className="px-5 py-4 font-bold">
                      {row.shipments.delivery_attempt_count} / 3
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-[#e8f0fb] px-2.5 py-1 text-xs font-bold capitalize text-[#356aa6]">
                        {(row.partner_status || "pending").replaceAll("_", " ")}
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

