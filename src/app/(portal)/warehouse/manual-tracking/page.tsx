import Link from "next/link";
import { ArrowLeft, ScanLine } from "lucide-react";
import { ManualTrackingUpdateForm } from "@/components/manual-tracking-update-form";
import { requireProfile } from "@/lib/auth";
import { customerTrackingLabels, manualTrackingStatuses } from "@/lib/customer-tracking";

export const metadata = { title: "Manual Tracking Updates" };
const warehouseRoles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

function dubaiDateTimeInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export default async function WarehouseManualTrackingPage() {
  await requireProfile(warehouseRoles);
  return <div className="mx-auto max-w-[1100px] space-y-6">
    <Link href="/warehouse" className="inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to warehouse operations</Link>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#188459]">Warehouse operations</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Manual tracking updates</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#74827b]">Scan an AWB to record airport, customs, or delivery tracking milestones when an automatic scan is unavailable. Backdated updates appear in the timeline in the correct order.</p></div><span className="grid size-12 place-items-center rounded-2xl bg-[#e8f6ee] text-[#13734b]"><ScanLine className="size-6" /></span></header>
    <ManualTrackingUpdateForm defaultDateTime={dubaiDateTimeInput()} />
    <section className="rounded-xl border border-[#dce6e1] bg-white px-4 py-4 text-xs leading-5 text-[#68766f]"><strong className="text-[#26372f]">All available statuses:</strong><ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{manualTrackingStatuses.map((status) => <li key={status}>{customerTrackingLabels[status]}</li>)}</ul><p className="mt-2">Each update adds a customer-visible event and records the staff member who entered it.</p></section>
  </div>;
}
