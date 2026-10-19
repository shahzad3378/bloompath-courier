"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { previewGtaBulk } from "@/app/(portal)/courier-integrations/gta-airskip/bulk-actions";
import { generateGtaAwb, checkGtaCredentials } from "@/app/(portal)/courier-integrations/gta-airskip/actions";
import { gtaBulkMaxBytes, gtaResultsCsv, processGtaBatch, type GtaBulkPreview, type GtaBulkResult } from "@/lib/gta-bulk";
import { useCarrierBusy } from "@/components/carrier-workspace";
import { gtaSenderTerminals, gtaDropoffAddress } from "@/lib/gta-airskip";
const idle: GtaBulkPreview = { status: "idle", message: "", rows: [] };
const button = "bp-button-secondary gap-2 !min-h-11 !text-sm";
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function GtaBulkBooking({ configured, test, liveEnabled, pickup }: { configured: boolean; test: boolean; liveEnabled: boolean; pickup: { name: string; address: string; address2: string; city: string; state: string; postalCode: string; country: string } | null }) {
  const [preview, setPreview] = useState(idle), [results, setResults] = useState<GtaBulkResult[]>([]);
  const terminal = gtaSenderTerminals;
  const [confirmed, setConfirmed] = useState(false), [induction, setInduction] = useState(false);
  const [service, setService] = useState("Domestic"), [destinationTerminal, setDestinationTerminal] = useState("");
  const [validating, setValidating] = useState(false), [running, setRunning] = useState(false), [downloading, setDownloading] = useState(false), [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState(""), [filename, setFilename] = useState("");
  const busyRef = useRef(false), stopRef = useRef(false), fileRef = useRef<HTMLInputElement>(null), summaryRef = useRef<HTMLParagraphElement>(null);
  const busy = validating || running || downloading;
  useCarrierBusy(busy);
  const waiting = results.filter(r => r.status === "waiting").length, successful = results.filter(r => r.status === "success" && r.bookingId);
  const started = results.some(r => !["waiting", "invalid"].includes(r.status));
  useEffect(() => () => { stopRef.current = true; }, []);
  useEffect(() => { if (!running) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [running]);
  function reset() { setPreview(idle); setResults([]); setMessage(""); setConfirmed(false); }
  async function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busyRef.current) return;
    const form = new FormData(event.currentTarget), file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > gtaBulkMaxBytes || !/\.(csv|xlsx)$/i.test(file.name)) { setPreview({ ...idle, status: "error", message: "Choose a non-empty CSV or Excel file, 2 MB or smaller." }); setResults([]); fileRef.current?.focus(); return; }
    busyRef.current = true; setValidating(true); setMessage("");
    try { const next = await previewGtaBulk(idle, form); setPreview(next); setResults(next.rows.map(r => ({ awb: r.awb, rows: r.rows, status: r.status === "ready" ? "waiting" : "invalid", message: r.message, test }))); if (!next.rows.length) fileRef.current?.focus(); }
    catch { setPreview({ ...idle, status: "error", message: "Preview interrupted. Check your connection and sign-in, then validate again. No labels were requested." }); setResults([]); }
    finally { busyRef.current = false; setValidating(false); }
  }
  async function book() {
    if (busyRef.current || !waiting || !induction || (!test && (!liveEnabled || !confirmed))) return;
    if (service === "AirSkip" && !destinationTerminal.trim()) { setMessage("Enter a destination terminal for Air Skip before booking."); return; }
    busyRef.current = true; stopRef.current = false; setStopping(false); setRunning(true); setMessage("Checking GTA access…");
    try {
      const connection = await checkGtaCredentials({ status: "idle", message: "" });
      if (connection.status !== "success") { setMessage(connection.message + " No waiting parcels were booked."); return; }
      const awbs = new Set(results.filter(r => r.status === "waiting").map(r => r.awb));
      const outcome = await processGtaBatch(preview.rows.filter(r => r.status === "ready" && awbs.has(r.awb)), confirmed,
        form => generateGtaAwb({ status: "idle", message: "" }, form),
        result => setResults(current => current.map(r => r.awb === result.awb ? { ...result, test } : r)), () => stopRef.current, service, destinationTerminal);
      setMessage(outcome === "completed" ? "Batch finished. Download your labels and result report." : "Batch stopped. Waiting parcels were not sent. Review the error and Bookings & labels before continuing.");
    } catch { setMessage("Batch interrupted. Check saved bookings and GTA before continuing. No automatic retry was sent."); }
    finally { busyRef.current = false; setRunning(false); setStopping(false); summaryRef.current?.focus(); }
  }
  async function labels() {
    if (busyRef.current || !successful.length) return;
    busyRef.current = true; setDownloading(true); setMessage("");
    try {
      const { default: JSZip } = await import("jszip"); const zip = new JSZip(); let size = 0;
      for (const [i, row] of successful.entries()) {
        const response = await fetch(`/api/courier-integrations/gta-airskip/labels/${row.bookingId}?format=stored`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not download ${row.awb}. Use its individual label link.`);
        const blob = await response.blob(); size += blob.size;
        if (size > 50 * 1024 * 1024) throw new Error("Labels exceed 50 MB. Download them individually or use smaller batches.");
        const type = response.headers.get("content-type") ?? "", ext = type.includes("pdf") ? "pdf" : type.includes("png") ? "png" : "zpl";
        zip.file(`${i + 1}-${row.awb.replace(/[^A-Za-z0-9_-]/g, "_")}.${ext}`, await blob.arrayBuffer());
      }
      zip.file("results.csv", gtaResultsCsv(results)); download(await zip.generateAsync({ type: "blob" }), "gta-labels.zip"); setMessage(`Downloaded ${successful.length} saved labels with the result report.`);
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : "Download failed. Use individual label links."); }
    finally { busyRef.current = false; setDownloading(false); }
  }
  return <section aria-labelledby="gta-bulk-heading">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="gta-bulk-heading" className="text-xl font-bold">Book a batch with GTA</h2><p className="mt-2 text-sm text-[var(--muted)]">100 parcels per upload · CSV or Excel · 2 MB maximum</p></div><a href="/courier-integrations/gta-airskip/bulk-template" className={button}><Download size={16} />CSV template</a></div>
    <ol className="mt-6 grid gap-3 text-sm sm:grid-cols-3">{["Prepare your file", "Review every parcel", "Book & download labels"].map((label, i) => <li key={label} className="flex items-center gap-3 rounded-xl bg-[var(--background)] p-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white font-bold text-[var(--brand)]">{i + 1}</span>{label}</li>)}</ol>
    <form onSubmit={validate} noValidate className="mt-5"><fieldset disabled={busy || !configured || !pickup} className="disabled:opacity-60">
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="rounded-2xl border-2 border-dashed border-[var(--line)] bg-[var(--background)] p-5"><Upload className="mb-3 text-[var(--brand)]" size={24} /><label htmlFor="gta-bulk-file" className="block font-semibold">Choose your batch file</label><p id="gta-file-help" className="mt-2 text-sm text-[var(--muted)]">Use saved FastDrop AWBs. Addresses and shipment weights are filled automatically.</p><input ref={fileRef} id="gta-bulk-file" type="file" name="file" accept=".csv,.xlsx" aria-describedby="gta-file-help gta-preview" aria-invalid={preview.status === "error" && !preview.rows.length} className="mt-4 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-[var(--line)] file:bg-white file:px-4 file:font-semibold" onChange={e => { reset(); setFilename(e.target.files?.[0]?.name ?? ""); }} />{filename ? <p className="mt-3 flex items-center gap-2 break-all text-sm"><FileSpreadsheet size={16} className="shrink-0" />{filename}</p> : null}</div>
        <div><label className="text-sm font-semibold">Sender terminals<input name="terminal" value={terminal} readOnly className="bp-input mt-2" /><span className="mt-2 block text-xs font-normal text-[var(--muted)]">All four GTA terminals are sent together.</span></label><label className="mt-4 block text-sm font-semibold">GTA service<select value={service} onChange={e => setService(e.target.value)} className="bp-input mt-2"><option value="Domestic">Domestic</option><option value="AirSkip">Air Skip</option></select></label>{service === "AirSkip" ? <label className="mt-4 block text-sm font-semibold">Destination terminal<input value={destinationTerminal} onChange={e => setDestinationTerminal(e.target.value)} maxLength={30} className="bp-input mt-2" /></label> : null}<p className="mt-2 text-xs text-[var(--muted)]">Domestic uses an account-enabled local service selected by GTA.</p>{pickup ? <p className="mt-4 rounded-xl border border-[var(--line)] p-3 text-sm"><strong className="block">FastDrop sender address</strong>{pickup.name}<br />{pickup.address}{pickup.address2 ? `, ${pickup.address2}` : ""}<br />{pickup.city}, {pickup.state}, {pickup.postalCode}, {pickup.country}</p> : <p className="mt-4 text-sm">FastDrop sender address needs configuration.</p>}<p className="mt-4 rounded-xl border border-[var(--line)] p-3 text-sm"><strong className="block">Parcel drop-off location</strong>{gtaDropoffAddress}<span className="mt-2 block text-[var(--muted)]">Bring parcels here. This location is not printed as the sender.</span></p></div>
      </div><button type="submit" className={`${button} mt-4`}>{validating ? "Validating file…" : "Validate & preview"}</button>
    </fieldset></form>
    <p className="mt-4 text-sm text-[var(--muted)]"><strong>Canada local:</strong> leave customs columns empty. <strong>Canada → USA:</strong> fill description, item weight, HS code, value, currency and quantity. One row per parcel; repeat an AWB only for more customs items (maximum 1,000 rows). HS codes should be stored as text.</p>
    <p className="mt-2 text-sm text-[var(--muted)]">New shipments? <Link href="/shipments/import" className="font-semibold text-[var(--brand)] underline">Import addresses first</Link>, then use their FastDrop AWBs here.</p>
    <p id="gta-preview" role={preview.status === "error" ? "alert" : "status"} className="mt-4 min-h-6 text-sm font-semibold">{preview.message}</p>
    {results.length ? <div className="mt-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">{[["Ready", waiting], ["Labels saved", successful.length], ["Need attention", results.filter(r => ["error", "invalid"].includes(r.status)).length]].map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--line)] p-3"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-[var(--muted)]">{label}</p></div>)}</div>
      <div className="max-h-[480px] overflow-auto rounded-xl border border-[var(--line)]"><table className="w-full min-w-[1040px] text-left text-sm"><caption className="sr-only">GTA parcel preview, rate comparison, and booking results</caption><thead className="sticky top-0 bg-[var(--background)]"><tr>{["FastDrop AWB", "Parcel", "Status & result", "Rate comparison · all mapped 3PLs", "Label"].map(h => <th key={h} scope="col" className="p-3">{h}</th>)}</tr></thead><tbody>{results.map(r => { const parcel = preview.rows.find(p => p.awb === r.awb), comparison = parcel?.rateComparison; return <tr key={r.awb} className="border-t border-[var(--line)] align-top"><td className="p-3"><strong className="font-mono">{r.awb}</strong><p className="mt-1 text-xs text-[var(--muted)]">Rows {r.rows.join(", ")}</p></td><td className="p-3">{parcel?.options.length} × {parcel?.options.width} × {parcel?.options.height} cm<p className="mt-1 text-xs text-[var(--muted)]">{parcel?.destination || "—"} · {parcel?.options.items.length || 0} customs items</p></td><td className="max-w-sm p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${r.status === "success" ? "bg-[var(--brand-soft)] text-[var(--brand)]" : ["invalid", "error"].includes(r.status) ? "bg-red-50 text-[var(--danger)]" : "bg-[var(--background)]"}`}>{r.status === "waiting" ? "Ready" : r.status}</span><p className="mt-2 break-words text-[var(--muted)]">{r.message}</p>{r.tracking ? <p className="mt-1 font-mono">{r.tracking}</p> : null}</td><td className="max-w-md p-3">{comparison ? <><p className="text-xs text-[var(--muted)]">Weight: {comparison.weightKg ? `${comparison.weightKg} kg (${comparison.weightSource})` : comparison.weightSource || "unavailable"}</p>{comparison.billedAmount !== null ? <p className="mt-1 font-semibold">Customer rate: {comparison.billedCurrency} {comparison.billedAmount.toFixed(2)}</p> : <p className="mt-1 text-xs text-[var(--muted)]">Customer billing rate not configured for this shipment.</p>}{comparison.quotes.length ? <ul className="mt-2 space-y-2">{comparison.quotes.map((quote, i) => <li key={`${quote.carrierId}-${quote.cardName}-${quote.service}-${quote.zone}-${i}`} className="rounded-lg bg-[var(--background)] p-2"><strong>{quote.carrierName}</strong> · {quote.cardName}<p className="text-xs text-[var(--muted)]">{quote.service} / {quote.zone} · {quote.currency} {quote.amount.toFixed(2)}</p><p className={`text-xs font-semibold ${quote.margin === null ? "text-[var(--muted)]" : quote.margin >= 0 ? "text-[var(--brand)]" : "text-[var(--danger)]"}`}>{quote.margin === null ? "P/L unavailable (currency or customer rate mismatch)" : `${quote.margin >= 0 ? "Estimated profit" : "Estimated loss"}: ${comparison.billedCurrency} ${Math.abs(quote.margin).toFixed(2)}`}</p></li>)}</ul> : <p className="mt-1 text-xs text-[var(--muted)]">{comparison.message}</p>}{comparison.unmatchedCards.length ? <details className="mt-2 text-xs text-[var(--muted)]"><summary className="cursor-pointer">Cards with no matching rate ({comparison.unmatchedCards.length})</summary><ul className="mt-1 list-disc pl-4">{comparison.unmatchedCards.map(card => <li key={card}>{card}</li>)}</ul></details> : null}</> : <p className="text-xs text-[var(--muted)]">Rate check unavailable.</p>}</td><td className="p-3">{r.bookingId ? <a href={`/api/courier-integrations/gta-airskip/labels/${r.bookingId}`} className="font-semibold text-[var(--brand)] underline">PDF label</a> : "—"}</td></tr>; })}</tbody></table></div>
      <div className="rounded-xl bg-[var(--background)] p-4"><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={induction} disabled={busy} onChange={e => setInduction(e.target.checked)} className="mt-1 size-4" /><span>I confirm the FastDrop sender address above is correct.</span></label>{!test ? <label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-1 size-4" /><span>I confirm production booking for these parcels and the resulting shipping charges.</span></label> : <p className="mt-3 text-sm text-[var(--muted)]">QA labels will be created in the test environment.</p>}<div className="mt-4 flex flex-wrap gap-3"><button type="button" className="bp-button-primary !text-sm" disabled={busy || !waiting || !induction || (!test && (!liveEnabled || !confirmed))} onClick={() => void book()}>{running ? "Booking parcels…" : `${started ? "Continue" : "Book"} ${waiting} ${test ? "QA" : "production"} parcels`}</button>{running ? <button type="button" disabled={stopping} className={button} onClick={() => { stopRef.current = true; setStopping(true); }}>{stopping ? "Stopping after this parcel…" : "Stop after this parcel"}</button> : null}</div></div>
      {running ? <progress className="w-full accent-[var(--brand)]" aria-label="Batch progress" value={results.filter(r => ["success", "error"].includes(r.status)).length} max={results.filter(r => r.status !== "invalid").length} /> : null}
      <p ref={summaryRef} tabIndex={-1} role="status" className="text-sm font-semibold">{message}</p>
      <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={() => download(new Blob([gtaResultsCsv(results)], { type: "text/csv;charset=utf-8" }), "gta-results.csv")}><Download size={16} />Result report</button><button type="button" className={button} disabled={busy || !successful.length} onClick={() => void labels()}><Download size={16} />{downloading ? "Preparing labels…" : `Labels ZIP (${successful.length})`}</button></div>
      <p className="text-xs text-[var(--muted)]">Keep this page open during booking. Saved labels remain under Bookings & labels; export the report to retain failed and waiting rows. Unconfirmed bookings stay blocked. Continuing sends only waiting parcels.</p>
    </div> : null}
  </section>;
}
