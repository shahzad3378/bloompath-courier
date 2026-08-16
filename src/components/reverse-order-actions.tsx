"use client";

import Link from "next/link";
import {
  ChevronDown,
  Eye,
  FilePlus2,
  Printer,
} from "lucide-react";
import { useState } from "react";

type Props = {
  reverseOrderId: number;
  reverseShipmentId?: number | null;
  reverseTrackingNumber?: string | null;
};

export function ReverseOrderActions({
  reverseOrderId,
  reverseShipmentId,
  reverseTrackingNumber,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 min-w-28 items-center justify-center gap-2 rounded-xl border border-[#d8e2dd] bg-white px-3 text-xs font-bold text-[#405048] hover:bg-[#f7faf8]"
      >
        Actions
        <ChevronDown className="size-3.5" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close actions"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />

          <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl border border-[#dfe7e3] bg-white py-1 shadow-xl">
            <Link
              href={`/reverse-exchange/${reverseOrderId}`}
              className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-[#405048] hover:bg-[#f5f8f6]"
            >
              <Eye className="size-4" />
              View Details
            </Link>

            {reverseShipmentId ? (
              <>
                <Link
                  href={`/print/shipments/${reverseShipmentId}?format=4x6`}
                  target="_blank"
                  className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-[#405048] hover:bg-[#f5f8f6]"
                >
                  <Printer className="size-4" />
                  Print Reverse AWB 4×6
                </Link>

                <Link
                  href={`/print/shipments/${reverseShipmentId}?format=a4`}
                  target="_blank"
                  className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-[#405048] hover:bg-[#f5f8f6]"
                >
                  <Printer className="size-4" />
                  Print Reverse AWB A4
                </Link>

                {reverseTrackingNumber ? (
                  <div className="border-t border-[#edf1ef] px-3 py-2">
                    <p className="text-[9px] font-bold uppercase text-[#9aa59f]">
                      Reverse AWB
                    </p>
                    <p className="mt-1 font-mono text-[11px] font-bold text-[#b76223]">
                      {reverseTrackingNumber}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <form
                action="/reverse-exchange/generate-awb"
                method="post"
              >
                <input
                  type="hidden"
                  name="reverse_order_id"
                  value={reverseOrderId}
                />

                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-bold text-[#13734b] hover:bg-[#edf8f2]"
                >
                  <FilePlus2 className="size-4" />
                  Generate Reverse AWB
                </button>
              </form>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
