"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

export function BulkPrintControls({ count }: { count: number }) {
  return (
    <div className="print-controls mx-auto mb-4 flex max-w-3xl items-center justify-between rounded-xl border border-[#dfe7e3] bg-white p-3 shadow-sm">
      <Link href="/shipments" className="flex items-center gap-2 text-sm font-semibold text-[#42534b]"><ArrowLeft className="size-4" /> Back to shipments</Link>
      <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-[#13734b] px-4 py-2 text-sm font-bold text-white"><Printer className="size-4" /> Print all {count} AWBs</button>
    </div>
  );
}
