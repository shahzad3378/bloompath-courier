import Link from "next/link";
import { ArrowRight, ClipboardList, RotateCcw, Truck, Warehouse } from "lucide-react";
import { WarehouseReturnForm } from "@/components/warehouse-return-form";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import {
  manifestStatusClass,
  pickupManifestStatusLabels,
  type PickupManifest,
} from "@/lib/pickup-manifests";
import { formatDubaiDate, type Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Warehouse Receiving" };

const warehouseRoles = ["super_admin", "operations_admin", "warehouse_staff"] as const;
type WarehouseManifest = PickupManifest & { pickup_manifest_items: Array<{ id: number; received_at: string | null }> };
type PendingDriverReturn = Shipment & { profiles: { full_name: string } | null };

export default async function WarehousePage() {
  const profile = await requireProfile(internalRoles);
  const supabase = await createClient();
  const [{ data: manifestData, error: manifestError }, { data: returnData, error: returnError }] = await Promise.all([
    supabase
      .from("pickup_manifests")
      .select("*, pickup_manifest_items(id, received_at)")
      .in("status", ["picked_up", "partially_received"])
      .order("picked_up_at", { ascending: true }),
    supabase
      .from("shipments")
      .select("*, profiles!shipments_assigned_driver_id_fkey(full_name)")
      .eq("status", "undelivered")
      .is("deleted_at", null)
      .order("updated_at", { ascending: true }),
  ]);
  const manifests = (manifestData ?? []) as WarehouseManifest[];
  const pendingReturns = (returnData ?? []) as unknown as PendingDriverReturn[];
  const pendingPickupAwbs = manifests.reduce((sum, manifest) => sum + manifest.pickup_manifest_items.filter((item) => !item.received_at).length, 0);
  const canReceiveReturns = warehouseRoles.includes(profile.role as (typeof warehouseRoles)[number]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-[#188459]">Inbound operations</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Warehouse receiving</h1><p className="mt-2 text-sm text-[#74827b]">Receive new pickups and physical undelivered returns before dispatch.</p></div>
        <div className="flex gap-3"><div className="rounded-xl border border-[#d8e6df] bg-white px-5 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7b8982]">Pickup AWBs</p><p className="mt-1 text-2xl font-black text-[#13734b]">{pendingPickupAwbs}</p></div><div className="rounded-xl border border-[#e2d5be] bg-[#fffaf1] px-5 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8c7b5d]">Driver returns</p><p className="mt-1 text-2xl font-black text-[#8a5b18]">{pendingReturns.length}</p></div></div>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[360px_1fr]">
        {canReceiveReturns ? <WarehouseReturnForm /> : <div className="rounded-2xl border border-[#e4d5b8] bg-[#fffaf1] p-5 text-sm font-semibold text-[#8a651f]">Warehouse receipt access is required to scan driver returns.</div>}
        <section className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
          <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4"><div><h2 className="font-bold text-[#26372f]">Pending driver returns</h2><p className="mt-1 text-xs text-[#87938d]">Must be physically received before another route</p></div><RotateCcw className="size-5 text-[#a56b19]" /></div>
          {returnError ? <p className="p-8 text-center text-sm font-semibold text-[#b74646]">Driver-return queue could not be loaded.</p> : pendingReturns.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><Truck className="mx-auto size-9 text-[#9aaba2]" /><p className="mt-3 font-bold text-[#405048]">No driver returns pending</p><p className="mt-1 text-sm text-[#87938d]">Undelivered AWBs will appear here automatically.</p></div></div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="px-5 py-3.5">AWB</th><th className="px-5 py-3.5">Consignee</th><th className="px-5 py-3.5">Attempt</th><th className="px-5 py-3.5">Reason</th><th className="px-5 py-3.5">Returning driver</th></tr></thead><tbody className="divide-y divide-[#edf1ef]">{pendingReturns.map((shipment) => <tr key={shipment.id} className="text-sm"><td className="px-5 py-4"><Link href={`/shipments/${shipment.id}`} className="font-mono font-black text-[#13734b]">{shipment.tracking_number}</Link><p className="mt-1 text-xs text-[#87938d]">{shipment.reference_number || "No reference"}</p></td><td className="px-5 py-4"><p className="font-semibold text-[#34453c]">{shipment.consignee_name}</p><p className="mt-1 text-xs text-[#87938d]">{shipment.consignee_city}</p></td><td className="px-5 py-4 font-black text-[#8a5b18]">#{shipment.delivery_attempt_count}</td><td className="px-5 py-4 text-xs font-semibold capitalize text-[#68766f]">{shipment.last_undelivered_reason?.replaceAll("_", " ") || "—"}</td><td className="px-5 py-4 font-semibold text-[#405048]">{shipment.profiles?.full_name || "Assigned driver"}</td></tr>)}</tbody></table></div>}
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4"><div><h2 className="font-bold text-[#26372f]">Inbound pickup manifests</h2><p className="mt-1 text-xs text-[#87938d]">Oldest pickup shown first</p></div><Warehouse className="size-5 text-[#a56b19]" /></div>
        {manifestError ? <p className="p-8 text-center text-sm font-semibold text-[#b74646]">Warehouse queue could not be loaded.</p> : manifests.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e7f4ed] text-[#188459]"><Warehouse className="size-7" /></span><h2 className="mt-4 text-lg font-bold text-[#26372f]">Pickup queue is clear</h2><p className="mt-1 text-sm text-[#7a8881]">Picked-up manifests will appear here automatically.</p><Link href="/pickup-manifests" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#13734b] px-4 py-2.5 text-sm font-bold text-white"><ClipboardList className="size-4" /> View manifests</Link></div></div> : <div className="divide-y divide-[#edf1ef]">{manifests.map((manifest) => {
          const total = manifest.pickup_manifest_items.length;
          const received = manifest.pickup_manifest_items.filter((item) => item.received_at).length;
          const percent = total ? Math.round((received / total) * 100) : 0;
          return <Link key={manifest.id} href={`/pickup-manifests/${manifest.id}`} className="grid gap-4 px-5 py-5 transition hover:bg-[#fbfcfb] sm:grid-cols-[1.2fr_1fr_1fr_130px_auto] sm:items-center"><div><p className="font-mono text-sm font-black text-[#24362d]">{manifest.manifest_number}</p><p className="mt-1 text-xs text-[#87938d]">{manifest.shipper_name}</p></div><div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${manifestStatusClass(manifest.status)}`}>{pickupManifestStatusLabels[manifest.status]}</span><p className="mt-2 text-xs text-[#87938d]">Picked {manifest.picked_up_at ? formatDubaiDate(manifest.picked_up_at) : "—"}</p></div><div><div className="h-2 overflow-hidden rounded-full bg-[#edf1ef]"><div className="h-full rounded-full bg-[#2ca66e]" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs font-semibold text-[#68766f]">{received}/{total} received</p></div><p className="text-sm font-black text-[#8a5b18]">{total - received} pending</p><span className="grid size-9 place-items-center rounded-lg border border-[#dfe7e3] text-[#13734b]"><ArrowRight className="size-4" /></span></Link>;
        })}</div>}
      </section>
    </div>
  );
}
