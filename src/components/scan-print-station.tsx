"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Barcode, CheckCircle2, Printer, RotateCcw, Search } from "lucide-react";
import { lookupShipmentForLabel, type ScanPrintBranding } from "@/app/(portal)/shipments/scan-print/actions";
import { shipmentPieceCount, type Shipment } from "@/lib/shipments";

type ScanResult = { shipment: Shipment; branding: ScanPrintBranding };

export function ScanPrintStation() {
  const [awb, setAwb] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [piece, setPiece] = useState(1);
  const [previewReady, setPreviewReady] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const pieceCount = result ? shipmentPieceCount(result.shipment.pieces) : 0;
  const printUrl = result
    ? `/print/shipments/${result.shipment.id}?format=4x6&piece=${piece}&embed=1`
    : "about:blank";

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
    setPreviewReady(false);
    startTransition(async () => {
      const lookup = await lookupShipmentForLabel(scannedAwb);
      setAwb("");
      if (!lookup.ok) {
        setResult(null);
        setMessage(lookup.message);
        inputRef.current?.focus();
        return;
      }

      setResult({ shipment: lookup.shipment, branding: lookup.branding });
      setPiece(1);
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }

  function printLabel() {
    const printWindow = iframeRef.current?.contentWindow;
    if (!printWindow) {
      setMessage("The label preview is still loading. Wait a moment and try again.");
      return;
    }
    setMessage("");
    printWindow.focus();
    printWindow.print();
    inputRef.current?.focus();
  }

  function clearShipment() {
    setResult(null);
    setMessage("");
    setPiece(1);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
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
              <Search className="size-4" /> {isPending ? "Finding shipment…" : "Show label"}
            </button>
            {result ? <button type="button" onClick={clearShipment} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe7e3] bg-white px-4 text-sm font-bold text-[#506058] transition hover:bg-[#f5f8f6]"><RotateCcw className="size-4" /> Clear preview</button> : null}
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
                <select value={piece} onChange={(event) => setPiece(Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-[#dbe5e0] bg-white px-3 text-sm font-bold text-[#34453c]">
                  {Array.from({ length: pieceCount }, (_, index) => <option key={index + 1} value={index + 1}>Package {index + 1} of {pieceCount}</option>)}
                </select>
              </label>
            ) : null}
            <button type="button" onClick={printLabel} disabled={!previewReady || isPending} aria-busy={!previewReady || isPending} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white transition hover:bg-[#0d5e3d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13734b] disabled:cursor-wait disabled:opacity-60">
              <Printer className="size-4" /> {previewReady ? `Print package ${piece} label` : "Preparing label…"}
            </button>
            <p className="mt-2 text-center text-[11px] leading-5 text-[#74827b]">Print dialog will open. Choose the connected label printer, then scan the next package.</p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-[#dfe7e3] bg-[#fbfcfb] px-4 py-8 text-center">
            <Barcode className="mx-auto size-7 text-[#9aa69f]" />
            <p className="mt-2 text-sm font-bold text-[#526159]">Ready for the first package</p>
            <p className="mt-1 text-xs text-[#87938d]">The scanned shipment label will appear here.</p>
          </div>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-[#dfe7e3] bg-[#e9efec] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">4 × 6 thermal</p><h2 className="mt-1 font-bold text-[#26372f]">Label preview</h2></div>
          {result ? <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#53645b]">Package {piece} of {pieceCount}</span> : null}
        </div>
        {result ? (
          <div className="mx-auto w-full max-w-[440px] overflow-hidden rounded-xl border border-[#d5ded9] bg-white shadow-[0_14px_35px_rgba(18,42,30,0.12)]">
            <iframe
              key={`${result.shipment.id}-${piece}`}
              ref={iframeRef}
              title={`4 by 6 label preview for ${result.shipment.tracking_number}, package ${piece}`}
              src={printUrl}
              className="block h-[650px] w-full border-0"
              onLoad={() => setPreviewReady(true)}
            />
          </div>
        ) : (
          <div className="mx-auto grid min-h-[360px] max-w-[440px] place-items-center rounded-xl border border-dashed border-[#cad6cf] bg-white/70 p-6 text-center">
            <div><Barcode className="mx-auto size-8 text-[#9aa69f]" /><p className="mt-3 text-sm font-bold text-[#66756e]">No label selected</p><p className="mt-1 text-xs text-[#87938d]">Scan an AWB to load its live label preview.</p></div>
          </div>
        )}
      </section>
    </div>
  );
}
