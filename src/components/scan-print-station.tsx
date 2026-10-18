"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Barcode, Download, Printer, Search } from "lucide-react";
import { lookupShipmentForLabel } from "@/app/(portal)/shipments/scan-print/actions";
import { shipmentPieceCount, type Shipment } from "@/lib/shipments";

type PrintRecord = { awb: string; piece: number; totalPieces: number; sentAt: string };
type ScanResult = { shipment: Shipment };
const HISTORY_KEY = "bloompath-warehouse-label-print-history-v1";

function dubaiTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(value));
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function ScanPrintStation() {
  const [awb, setAwb] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [piece, setPiece] = useState(1);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<PrintRecord[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const pieceCount = result ? shipmentPieceCount(result.shipment.pieces) : 0;

  useEffect(() => {
    let restored: PrintRecord[] = [];
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) restored = parsed as PrintRecord[];
      }
    } catch {
      // Keep this station usable when browser storage is unavailable.
    }
    queueMicrotask(() => {
      setHistory(restored);
      setHistoryReady(true);
    });
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* Export remains available. */ }
  }, [history, historyReady]);

  useEffect(() => {
    function restoreScannerFocus() { window.setTimeout(() => inputRef.current?.focus(), 0); }
    window.addEventListener("focus", restoreScannerFocus);
    return () => window.removeEventListener("focus", restoreScannerFocus);
  }, []);

  function addToHistory(shipment: Shipment, pieceNumber: number) {
    const totalPieces = shipmentPieceCount(shipment.pieces);
    setHistory((current) => [{
      awb: shipment.tracking_number,
      piece: pieceNumber,
      totalPieces,
      sentAt: new Date().toISOString(),
    }, ...current]);
  }

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
    const printWindow = window.open("about:blank", "bloompath-awb-label");
    startTransition(async () => {
      try {
        const lookup = await lookupShipmentForLabel(scannedAwb);
        setAwb("");
        if (!lookup.ok) {
          if (printWindow && !printWindow.closed) printWindow.close();
          setResult(null);
          setMessage(lookup.message);
          inputRef.current?.focus();
          return;
        }

        setResult({ shipment: lookup.shipment });
        setPiece(1);
        if (printWindow && !printWindow.closed) {
          printWindow.location.replace(labelUrl(lookup.shipment.id, 1));
          addToHistory(lookup.shipment, 1);
          setMessage(`AWB ${lookup.shipment.tracking_number} sent to print.`);
        } else {
          setMessage("Shipment found. Allow pop-ups for this site, then scan again to print its label.");
        }
        requestAnimationFrame(() => inputRef.current?.focus());
      } catch {
        if (printWindow && !printWindow.closed) printWindow.close();
        setResult(null);
        setMessage("Shipment lookup failed. Check the connection and scan again.");
        inputRef.current?.focus();
      }
    });
  }

  function printPiece(pieceNumber: number) {
    if (!result) return;
    setMessage("");
    const printWindow = window.open(labelUrl(result.shipment.id, pieceNumber), "bloompath-awb-label");
    if (!printWindow) {
      setMessage("Allow pop-ups for this site to print the selected package label.");
      return;
    }
    addToHistory(result.shipment, pieceNumber);
    setMessage(`Package ${pieceNumber} of ${pieceCount} sent to print.`);
  }

  function exportCsv() {
    const rows = [
      ["AWB", "Package", "Total packages", "Sent to print (Dubai time)"],
      ...history.map((record) => [record.awb, `${record.piece}`, `${record.totalPieces}`, dubaiTimestamp(record.sentAt)]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `warehouse-label-prints-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    document.body.classList.add("warehouse-label-report-mode");
    window.setTimeout(() => window.print(), 0);
    window.addEventListener("afterprint", () => document.body.classList.remove("warehouse-label-report-mode"), { once: true });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <section className="rounded-2xl border border-[#d9e7df] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.04)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]"><Barcode className="size-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">Package by package</p>
            <h2 className="mt-1 text-lg font-bold text-[#26372f]">Scan an AWB</h2>
            <p className="mt-1 text-sm leading-6 text-[#74827b]">Scan with a USB/Bluetooth barcode reader, or paste/type the AWB and press Enter. The label print dialog opens automatically.</p>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="mt-5">
          <label htmlFor="scan-print-awb" className="mb-2 block text-xs font-bold text-[#405048]">AWB / tracking number</label>
          <div className="flex h-12 overflow-hidden rounded-xl border border-[#dbe5e0] bg-white focus-within:border-[#2b9466] focus-within:ring-4 focus-within:ring-[#2b9466]/10">
            <input
              ref={inputRef}
              id="scan-print-awb"
              value={awb}
              onChange={(event) => { setAwb(event.target.value); if (message) setMessage(""); }}
              autoComplete="off"
              autoFocus
              inputMode="text"
              aria-describedby={message ? "scan-print-help scan-print-error" : "scan-print-help"}
              aria-invalid={Boolean(message && !message.includes("sent to print"))}
              placeholder="Scan or paste AWB here"
              className="h-full min-w-0 flex-1 px-3 font-mono text-sm font-bold uppercase tracking-wide text-[#25352d] outline-none"
            />
            <button type="submit" disabled={isPending} aria-label="Search AWB and print label" title="Search AWB and print label" className="grid w-14 shrink-0 place-items-center border-l border-[#dbe5e0] bg-[#13734b] text-white transition hover:bg-[#0d5e3d] disabled:cursor-wait disabled:opacity-60">
              <Search className="size-5" />
            </button>
          </div>
          <p id="scan-print-help" className="mt-2 text-xs leading-5 text-[#87938d]">{isPending ? "Finding shipment…" : "Lookup is limited to active shipments in your organization."}</p>
        </form>

        {message ? <p id="scan-print-error" role="status" aria-live="polite" className={`mt-4 rounded-xl px-3 py-2.5 text-sm font-semibold ${message.includes("sent to print") || message.startsWith("Package ") ? "border border-[#bfe3cf] bg-[#f2faf5] text-[#176a47]" : "border border-[#f0cccc] bg-[#fff5f5] text-[#a13f3f]"}`}>{message}</p> : null}

        {result && pieceCount > 1 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#dfe7e3] bg-[#fbfcfb] p-3">
            <p className="min-w-0 flex-1 text-xs font-semibold text-[#526159]">Additional package labels · {result.shipment.tracking_number}</p>
            <label className="flex items-center gap-2 text-xs font-bold text-[#405048]">Package
              <select value={piece} onChange={(event) => { const nextPiece = Number(event.target.value); setPiece(nextPiece); printPiece(nextPiece); }} className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-sm font-bold text-[#34453c]">
                {Array.from({ length: pieceCount }, (_, index) => <option key={index + 1} value={index + 1}> {index + 1} of {pieceCount}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => printPiece(piece)} disabled={isPending} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#13734b] bg-white px-3 text-xs font-bold text-[#13734b] hover:bg-[#f2faf5] disabled:opacity-60"><Printer className="size-4" /> Reprint selected</button>
          </div>
        ) : null}
      </section>

      <section className="warehouse-label-report mt-5 overflow-hidden rounded-2xl border border-[#dce6e1] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eeeb] px-5 py-4">
          <div>
            <h2 className="font-bold text-[#26372f]">AWBs sent to print</h2>
            <p className="mt-1 text-xs text-[#87938d]">{history.length} label {history.length === 1 ? "request" : "requests"} · saved in this browser</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button type="button" onClick={exportCsv} disabled={!history.length} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#cfe0d7] bg-white px-3 text-xs font-bold text-[#13734b] hover:bg-[#f2faf5] disabled:cursor-not-allowed disabled:opacity-45"><Download className="size-4" /> Excel / CSV</button>
            <button type="button" onClick={printReport} disabled={!history.length} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#13734b] px-3 text-xs font-bold text-white hover:bg-[#0d5e3d] disabled:cursor-not-allowed disabled:opacity-45"><Printer className="size-4" /> Print / Save PDF</button>
          </div>
        </div>
        {history.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[#87938d]">Scanned AWBs will appear here as their labels are sent to print.</div>
        ) : (
          <div className="max-h-[430px] overflow-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead className="sticky top-0 bg-[#f7faf8] text-[10px] uppercase tracking-wide text-[#74827b]"><tr><th className="px-5 py-3">#</th><th className="px-5 py-3">AWB</th><th className="px-5 py-3">Package</th><th className="px-5 py-3">Sent to print · Dubai</th></tr></thead>
              <tbody className="divide-y divide-[#edf1ef]">
                {history.map((record, index) => <tr key={`${record.sentAt}-${index}`}><td className="px-5 py-3 text-xs text-[#87938d]">{history.length - index}</td><td className="px-5 py-3 font-mono text-xs font-black text-[#26372f]">{record.awb}</td><td className="px-5 py-3 text-xs font-semibold text-[#526159]">{record.piece} / {record.totalPieces}</td><td className="px-5 py-3 text-xs text-[#68766f]">{dubaiTimestamp(record.sentAt)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
