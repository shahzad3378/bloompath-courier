import Link from "next/link";
import { ClipboardList, Eye, PackageCheck, Printer } from "lucide-react";
import { PickupManifestCreateForm } from "@/components/pickup-manifest-create-form";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import {
  manifestStatusClass,
  pickupManifestStatusLabels,
  type PickupManifest,
} from "@/lib/pickup-manifests";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pickup Manifests" };

type ManifestListRow = PickupManifest & { pickup_manifest_items: Array<{ id: number; received_at: string | null }> };
type ShipperRow = { id: string; full_name: string | null; email: string };
type BusinessRow = { shipper_id: string; company_name: string };

export default async function PickupManifestsPage() {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const supabase = await createClient();

  const [
    { data, error },
    { data: shipperData },
    { data: businessData },
  ] = await Promise.all([
    supabase
      .from("pickup_manifests")
      .select("*, pickup_manifest_items(id, received_at)")
      .order("created_at", { ascending: false })
      .limit(100),
    profile.role === "shipper"
      ? supabase.from("profiles").select("id, full_name, email").eq("id", profile.id)
      : supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("organization_id", profile.organization_id)
          .eq("role", "shipper")
          .eq("status", "active")
          .order("full_name"),
    supabase
      .from("shipper_business_profiles")
      .select("shipper_id, company_name")
      .eq("organization_id", profile.organization_id),
  ]);

  const manifests = (data ?? []) as ManifestListRow[];
  const businessMap = new Map(((businessData ?? []) as BusinessRow[]).map((row) => [row.shipper_id, row.company_name]));
  const shipperOptions = ((shipperData ?? []) as ShipperRow[]).map((shipper) => ({
    id: shipper.id,
    name: businessMap.get(shipper.id) || shipper.full_name || shipper.email,
    email: shipper.email,
  }));
  const currentShipper = profile.role === "shipper" ? shipperOptions[0] ?? null : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]"><ClipboardList className="size-6" /></span>
        <div>
          <p className="text-sm font-semibold text-[#188459]">Pickup operations</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Pickup manifests</h1>
          <p className="mt-2 text-sm text-[#74827b]">Create seller-wise pickup sheets, scan AWBs, hand them to a driver and receive them at warehouse.</p>
        </div>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[360px_1fr]">
        <PickupManifestCreateForm shipperOptions={shipperOptions} currentShipper={currentShipper} />

        <section className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
          <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
            <div><h2 className="font-bold text-[#26372f]">Recent manifests</h2><p className="mt-1 text-xs text-[#87938d]">Latest 100 pickup records · scroll and open any seller manifest</p></div>
            <PackageCheck className="size-5 text-[#188459]" />
          </div>

          {error ? (
            <p className="p-8 text-center text-sm font-semibold text-[#b74646]">Manifests could not be loaded.</p>
          ) : manifests.length === 0 ? (
            <div className="grid min-h-64 place-items-center p-8 text-center"><div><ClipboardList className="mx-auto size-9 text-[#9aaba2]" /><p className="mt-3 font-bold text-[#405048]">No manifests yet</p><p className="mt-1 text-sm text-[#87938d]">Create the first seller pickup manifest.</p></div></div>
          ) : (
            <div className="max-h-[680px] overflow-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead className="sticky top-0 z-10 border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]">
                  <tr><th className="px-5 py-3.5">Manifest</th><th className="px-5 py-3.5">Shipper</th><th className="px-5 py-3.5">AWBs</th><th className="px-5 py-3.5">Progress</th><th className="px-5 py-3.5">Created</th><th className="px-5 py-3.5 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ef]">
                  {manifests.map((manifest) => {
                    const total = manifest.pickup_manifest_items.length;
                    const received = manifest.pickup_manifest_items.filter((item) => item.received_at).length;
                    return (
                      <tr key={manifest.id} className="text-sm hover:bg-[#fbfcfb]">
                        <td className="px-5 py-4"><p className="font-mono font-black text-[#24362d]">{manifest.manifest_number}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${manifestStatusClass(manifest.status)}`}>{pickupManifestStatusLabels[manifest.status]}</span></td>
                        <td className="px-5 py-4 font-semibold text-[#405048]">{manifest.shipper_name}</td>
                        <td className="px-5 py-4 font-bold text-[#26372f]">{total}</td>
                        <td className="px-5 py-4 text-xs font-semibold text-[#68766f]">{received}/{total} received</td>
                        <td className="px-5 py-4 text-xs text-[#68766f]">{formatDubaiDate(manifest.created_at)}</td>
                        <td className="px-5 py-4"><div className="flex justify-end gap-2"><Link aria-label={`Print ${manifest.manifest_number}`} href={`/pickup-manifests/${manifest.id}/print`} target="_blank" className="inline-grid size-9 place-items-center rounded-lg border border-[#dfe7e3] text-[#53645c] hover:bg-[#f7f9f8]"><Printer className="size-4" /></Link><Link aria-label={`Open ${manifest.manifest_number}`} href={`/pickup-manifests/${manifest.id}`} className="inline-grid size-9 place-items-center rounded-lg border border-[#dfe7e3] text-[#13734b] hover:bg-[#edf7f2]"><Eye className="size-4" /></Link></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
