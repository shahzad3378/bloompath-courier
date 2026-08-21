import { ScanLine } from "lucide-react";
import { scanDriverAwbAction } from "@/app/(portal)/driver/actions";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto mb-5 max-w-[1050px] rounded-2xl border border-[#cfe2d8] bg-white p-4 shadow-[0_8px_30px_rgba(24,51,39,0.04)]">
        <form action={scanDriverAwbAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-bold text-[#516159]">
            Scan / enter AWB
            <div className="relative mt-2">
              <ScanLine className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#188459]" />
              <input
                name="tracking_number"
                required
                autoFocus={false}
                autoComplete="off"
                placeholder="Scan barcode or enter tracking number"
                className="h-12 w-full rounded-xl border border-[#dbe5e0] bg-white pl-11 pr-3 font-mono text-sm font-bold outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10"
              />
            </div>
          </label>
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white">
            <ScanLine className="size-4" /> Open shipment
          </button>
        </form>
        <p className="mt-2 text-xs text-[#87938d]">
          USB/Bluetooth barcode scanners work like a keyboard: scan the AWB and press Enter. Only shipments assigned to this driver can open.
        </p>
      </div>
      {children}
    </>
  );
}
