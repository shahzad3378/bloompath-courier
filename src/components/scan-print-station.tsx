"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Barcode, CheckCircle2, Printer, Search } from "lucide-react";
import { lookupShipmentForLabel } from "@/app/(portal)/shipments/scan-print/actions";
import { shipmentPieceCount, type Shipment } from "@/lib/shipments";

type ScanResult = { shipment: Shipment };

export function ScanPrintStation() {
  const [awb, setAwb] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [piece, setPiece] = useState(1);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const pieceCount = result ? shipmentPieceCount(result.shipment.pieces) : 0;
  useEffect(() => {
    function restoreScannerFocus() {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    window.addEventListener("focus", restoreScannerFocus);
    return () => window.removeEventListener("focus", restoreScannerFocus);
  }, []);

  function labelUrl(shipmentId: number, pieceNumber: number) {
    return `/print/shipments/${shipmentId}?format=4x6&piece=${pieceNumber}&autoPrint=1`;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const scannedAwb = awb.trim().toUpperCase();
    if (!scannedAwb) {
      setMessage("Scan or enter an AWB number first.");
      inputRef.current?.focus();
      return;
    }

    setMessage("");
    // Open synchronously from the scan gesture so popup blockers allow printing.
    const printWindow = window.open("about:blank", "bloompath-awb-label");
    startTransition(async () => {
      const lookup = await lookupShipmentForLabel(scannedAwb);
      setAwb("");
      if (!lookup.ok) {
        if (printWindow && !printWindow.closed) printWindow.close();
        printWindowRef.current = null;
        setResult(null);
        setMessage(lookup.message);
        inputRef.current?.focus();
        return;
      }

      setResult({ shipment: lookup.shipment });
      setPiece(1);
      if (printWindow && !printWindow.closed) {
        printWindow.location.replace(labelUrl(lookup.shipment.id, 1));
      } else {
        setMessage("Shipment found. Allow pop-ups for this site, then scan again to print its label.");
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }

  function printPiece(pieceNumber: number) {
    if (!result) return;
    setMessage("");
    const printWindow = window.open(labelUrl(result.shipment.id, pieceNumber), "bloompath-awb-label");
    if (!printWindow) {
      setMessage("Allow pop-ups for this site to print the selected package label.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <section className="rounded-2xl border border-[#d9e7df] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.04)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]"><Barcode className="size-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">Package by package</p>
            <h2 className="mt-1 text-lg font-bold text-[#26372f]">Scan an AWB</h2>
            <p className="mt-1 text-sm leading-6 text-[#74827b]">Scan with a USB/Bluetooth barcode reader while this field is focused, or type the AWB and press Enter.</p>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="mt-5 space-y-3">
          <label htmlFor="scan-print-awb" className="block text-xs font-bold text-[#405048]">AWB / tracking number</label>
          <input
            ref={inputRef}
            id="scan-print-awb"
            value={awb}
            onChange={(event) => { setAwb(event.target.value); if (message) setMessage(""); }}
            autoComplete="off"
            autoFocus
            inputMode="text"
          aria-describedby={message ? "scan-print-help scan-print-error" : "scan-print-help"}
            aria-invalid={Boolean(message)}
            placeholder="Scan package barcode here"
            className="h-12 w-full rounded-xl border border-[#dbe5e0] px-3 font-mono text-sm font-bold uppercase tracking-wide text-[#25352d] outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10"
          />
          <p id="scan-print-help" className="text-xs leading-5 text-[#87938d]">The lookup checks only active shipments belonging to your organization.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={isPending} aria-busy={isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white transition hover:bg-[#0d5e3d] disabled:cursor-wait disabled:opacity-60">
              <Search className="size-4" /> {isPending ? "Finding shipment…" : "Scan & print label"}
            </button>
          </div>
        </form>

        {message ? <p id="scan-print-error" role="alert" className="mt-4 rounded-xl border border-[#f0cccc] bg-[#fff5f5] px-3 py-2.5 text-sm font-semibold text-[#a13f3f]">{message}</p> : null}

        {result ? (
          <div className="mt-5 rounded-xl border border-[#bfe3cf] bg-[#f2faf5] p-4" aria-live="polite">
            <div className="flex items-start gap-2 text-[#176a47]"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><div><p className="text-xs font-bold uppercase tracking-wide">Shipment matched</p><p className="mt-1 break-all font-mono text-sm font-black">{result.shipment.tracking_number}</p></div></div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div><dt className="text-[#7b8982]">Consignee</dt><dd className="mt-0.5 font-bold text-[#34453c]">{result.shipment.consignee_name}</dd></div>
              <div><dt className="text-[#7b8982]">Destination</dt><dd className="mt-0.5 font-bold text-[#34453c]">{[result.shipment.consignee_city, result.shipment.consignee_country_code].filter(Boolean).join(", ") || "—"}</dd></div>
              <div><dt className="text-[#7b8982]">Pieces</dt><dd className="mt-0.5 font-bold text-[#34453c]">{pieceCount}</dd></div>
              <div><dt className="text-[#7b8982]">Reference</dt><dd className="mt-0.5 break-all font-bold text-[#34453c]">{result.shipment.reference_number || "—"}</dd></div>
            </dl>
            {pieceCount > 1 ? (
              <label className="mt-4 block text-xs font-bold text-[#405048]">Package label number
                <select value={piece} onChange={(event) => { const nextPiece = Number(event.target.value); setPiece(nextPiece); printPiece(nextPiece); }} className="mt-1 h-10 w-full rounded-lg border border-[#dbe5e0] bg-white px-3 text-sm font-bold text-[#34453c]">
                  {Array.from({ length: pieceCount }, (_, index) => <option key={index + 1} value={index + 1}>Package {index + 1} of {pieceCount}</option>)}
                </select>
              </label>
            ) : null}
            <button type="button" onClick={() => printPiece(piece)} disabled={isPending} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#13734b] bg-white px-4 text-sm font-bold text-[#13734b] transition hover:bg-[#f2faf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13734b] disabled:cursor-wait disabled:opacity-60">
              <Printer className="size-4" /> Reprint package {piece} label
            </button>
            <p className="mt-2 text-center text-[11px] leading-5 text-[#74827b]">The print dialog opens automatically after a scan. For multi-piece shipments, choose each next package to print it.</p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-[#dfe7e3] bg-[#fbfcfb] px-4 py-8 text-center">
            <Barcode className="mx-auto size-7 text-[#9aa69f]" />
            <p className="mt-2 text-sm font-bold text-[#526159]">Ready for the first package</p>
            <p className="mt-1 text-xs text-[#87938d]">The scanned shipment label goes straight to the print dialog.</p>
          </div>
        )}
      </section>

    </div>
  );
}
