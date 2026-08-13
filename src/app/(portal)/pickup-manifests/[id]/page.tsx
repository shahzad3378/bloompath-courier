import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ClipboardCheck, PackageCheck, Trash2, Truck, Warehouse } from "lucide-react";
import {
  ConfirmPickupForm,
  ManifestAwbScanForm,
  WarehouseReceiveForm,
} from "@/components/pickup-manifest-forms";
import {
  removeManifestShipmentAction,
  submitPickupManifestAction,
} from "@/app/(portal)/pickup-manifests/actions";
import { requireProfile } from "@/lib/auth";
import { internalRoles, type Profile } from "@/lib/roles";
import {
  manifestStatusClass,
  pickupManifestStatusLabels,
  type PickupManifest,
  type PickupManifestItem,
} from "@/lib/pickup-manifests";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pickup Manifest" };

const pickupRoles = ["super_admin", "operations_admin", "warehouse_staff", "dispatcher"] as const;
const warehouseRoles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

export default async function PickupManifestDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const { id } = await params;
  const notices = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: manifestData }, { data: itemData }, { data: driverData }] = await Promise.all([
    supabase.from("pickup_manifests").select("*").eq("id", id).maybeSingle(),
    supabase.from("pickup_manifest_items").select("*, shipments(*)").eq("manifest_id", id).order("created_at", { ascending: true }),
    pickupRoles.includes(profile.role as (typeof pickupRoles)[number])
      ? supabase.from("profiles").select("id, full_name, employee_code").eq("role", "driver").eq("status", "active").order("full_name")
      : Promise.resolve({ data: [] }),
  ]);
  if (!manifestData) notFound();
  const manifest = manifestData as PickupManifest;
  const items = (itemData ?? []) as unknown as PickupManifestItem[];
  const drivers = (driverData ?? []) as Pick<Profile, "id" | "full_name" | "employee_code">[];
  const receivedCount = items.filter((item) => item.received_at).length;
  const canConfirmPickup = pickupRoles.includes(profile.role as (typeof pickupRoles)[number]);
  const canReceive = warehouseRoles.includes(profile.role as (typeof warehouseRoles)[number]);

  return (
    <div className="mx-auto max-w-[1350px]">
      <Link href="/pickup-manifests" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to manifests</Link>
      {notices.submitted === "1" ? <div className="mb-5 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">Manifest submitted. All AWBs are now Ready for Pickup.</div> : null}
      {notices.error ? <div className="mb-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">Manifest could not be submitted. Make sure at least one active Booked AWB is added.</div> : null}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-[#188459]">Pickup manifest</p><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="font-mono text-3xl font-black tracking-[-0.035em] text-[#17231e]">{manifest.manifest_number}</h1><span className={`rounded-full px-3 py-1 text-xs font-bold ${manifestStatusClass(manifest.status)}`}>{pickupManifestStatusLabels[manifest.status]}</span></div><p className="mt-2 text-sm text-[#74827b]">{manifest.shipper_name} · Created {formatDubaiDate(manifest.created_at)}</p></div><div className="rounded-xl border border-[#dde7e2] bg-white px-4 py-3 text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">Warehouse receipt</p><p className="mt-1 text-lg font-black text-[#26372f]">{receivedCount} / {items.length}</p></div></div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {manifest.status === "draft" ? <ManifestAwbScanForm manifestId={manifest.id} /> : null}
          {manifest.status === "picked_up" || manifest.status === "partially_received" ? canReceive ? <WarehouseReceiveForm manifestId={manifest.id} /> : <div className="rounded-xl border border-[#e4d5b8] bg-[#fffaf1] px-4 py-3 text-sm font-semibold text-[#8a651f]">Waiting for warehouse receiving staff.</div> : null}
          {manifest.status === "received" ? <div className="flex items-center gap-3 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-4 text-sm font-semibold text-[#176a47]"><Check className="size-5" /> All AWBs received at warehouse {manifest.received_at ? formatDubaiDate(manifest.received_at) : ""}.</div> : null}

          <section className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
            <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4"><div><h2 className="font-bold text-[#26372f]">Manifest AWBs</h2><p className="mt-1 text-xs text-[#87938d]">{items.length} shipment{items.length === 1 ? "" : "s"}</p></div><PackageCheck className="size-5 text-[#188459]" /></div>
            {items.length === 0 ? <div className="grid min-h-52 place-items-center p-8 text-center"><div><p className="font-semibold text-[#596861]">No AWBs scanned yet.</p><p className="mt-1 text-xs text-[#87938d]">Use the scanner above to add Booked shipments.</p></div></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="px-5 py-3.5">AWB</th><th className="px-5 py-3.5">Consignee</th><th className="px-5 py-3.5">Destination</th><th className="px-5 py-3.5">Warehouse</th><th className="px-5 py-3.5">Receipt</th><th className="px-5 py-3.5 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#edf1ef]">{items.map((item) => <tr key={item.id} className="text-sm"><td className="px-5 py-4"><Link href={`/shipments/${item.shipment_id}`} className="font-mono font-black text-[#13734b]">{item.shipments.tracking_number}</Link><p className="mt-1 text-xs text-[#87938d]">{item.shipments.reference_number || "No reference"}</p></td><td className="px-5 py-4"><p className="font-semibold text-[#34453c]">{item.shipments.consignee_name}</p><p className="mt-1 text-xs text-[#87938d]">{item.shipments.consignee_phone}</p></td><td className="px-5 py-4 text-[#516159]">{item.shipments.consignee_city}</td><td className="px-5 py-4 font-bold text-[#526159]">{item.warehouse_location || "—"}</td><td className="px-5 py-4">{item.received_at ? <span className="inline-flex items-center gap-1 rounded-full bg-[#e5f3eb] px-2.5 py-1 text-xs font-bold text-[#16724b]"><Check className="size-3" /> Received</span> : <span className="rounded-full bg-[#fff0d8] px-2.5 py-1 text-xs font-bold text-[#976019]">Pending</span>}</td><td className="px-5 py-4 text-right">{manifest.status === "draft" ? <form action={removeManifestShipmentAction}><input type="hidden" name="manifest_id" value={manifest.id} /><input type="hidden" name="item_id" value={item.id} /><button aria-label={`Remove ${item.shipments.tracking_number}`} className="inline-grid size-9 place-items-center rounded-lg border border-[#edd1d1] text-[#a13f3f] hover:bg-[#fff1f1]"><Trash2 className="size-4" /></button></form> : <span className="text-xs text-[#9aa39f]">Locked</span>}</td></tr>)}</tbody></table></div>}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#eeeaf8] text-[#6952a0]"><ClipboardCheck className="size-5" /></span><div><p className="text-xs text-[#819088]">Operational flow</p><h2 className="font-bold text-[#26372f]">Manifest progress</h2></div></div><div className="mt-6 space-y-5">{[
            { label: "Draft & AWB scanning", done: true, icon: ClipboardCheck },
            { label: "Ready for pickup", done: manifest.status !== "draft", icon: PackageCheck },
            { label: "Picked up from shipper", done: ["picked_up", "partially_received", "received"].includes(manifest.status), icon: Truck },
            { label: "Warehouse received", done: manifest.status === "received", icon: Warehouse },
          ].map((step) => <div key={step.label} className="flex items-center gap-3"><span className={`grid size-8 place-items-center rounded-full ${step.done ? "bg-[#dff2e8] text-[#13734b]" : "bg-[#eef1ef] text-[#9aa49f]"}`}><step.icon className="size-4" /></span><p className={`text-sm font-semibold ${step.done ? "text-[#35463d]" : "text-[#8a9690]"}`}>{step.label}</p></div>)}</div></section>

          {manifest.status === "draft" ? <form action={submitPickupManifestAction} className="rounded-2xl border border-[#cde3d7] bg-white p-5"><input type="hidden" name="manifest_id" value={manifest.id} /><h2 className="font-bold text-[#26372f]">Submit to pickup queue</h2><p className="mt-2 text-xs leading-5 text-[#7a8881]">After submission AWBs are locked and moved to Ready for Pickup.</p><button disabled={items.length === 0} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><PackageCheck className="size-4" /> Submit manifest</button></form> : null}
          {manifest.status === "ready_for_pickup" ? canConfirmPickup ? <ConfirmPickupForm manifestId={manifest.id} drivers={drivers} /> : <div className="rounded-xl border border-[#d8d0eb] bg-[#f7f4fd] px-4 py-3 text-sm font-semibold text-[#6952a0]">Waiting for operations pickup confirmation.</div> : null}
        </aside>
      </div>
    </div>
  );
}
