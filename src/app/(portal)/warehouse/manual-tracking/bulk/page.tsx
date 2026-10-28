import Link from "next/link";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { ManualTrackingBulkUpload } from "@/components/manual-tracking-bulk-upload";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Bulk Manual Tracking Updates" };
const roles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

export default async function ManualTrackingBulkPage() {
  await requireProfile(roles);
  return <div className="mx-auto max-w-[1100px] space-y-6">
    <Link href="/warehouse/manual-tracking" className="inline-flex items-center gap-2 text-xs font-bold text-[#587068]"><ArrowLeft className="size-4" /> Back to manual tracking</Link>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#188459]">Warehouse operations</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Bulk tracking updates</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#74827b]">Upload one status update per AWB from Excel or CSV. Every row follows the same shipment, status-sequence and duplicate checks as a manual update.</p></div><span className="grid size-12 place-items-center rounded-2xl bg-[#e8f6ee] text-[#13734b]"><FileSpreadsheet className="size-6" /></span></header>
    <ManualTrackingBulkUpload />
  </div>;
}
