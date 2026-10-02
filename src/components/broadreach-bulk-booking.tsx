"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { checkBroadReachConnection, generateBroadReachAwb } from "@/app/(portal)/courier-integrations/broadreach/actions";
import { previewBroadReachBulk } from "@/app/(portal)/courier-integrations/broadreach/bulk-actions";
import { broadReachBulkMaxBytes, broadReachResultsCsv, processBroadReachBatch, type BroadReachBulkPreview, type BroadReachBulkResult } from "@/lib/broadreach-bulk";

const idle: BroadReachBulkPreview = { status: "idle", message: "", rows: [] };
const button = "bp-button-secondary !min-h-11 !text-sm focus-visible:outline-2 focus-visible:outline-offset-2";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BroadReachBulkBooking({ configured, liveEnabled }: { configured: boolean; liveEnabled: boolean }) {
  const [preview, setPreview] = useState(idle);
  const [results, setResults] = useState<BroadReachBulkResult[]>([]);
  const [mode, setMode] = useState<"test" | "live">("test");
  const [confirmed, setConfirmed] = useState(false);
  const [validating, setValidating] = useState(false);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const busy = validating || running || downloading;
  const started = results.some(row => !["waiting", "invalid"].includes(row.status));
  const waiting = results.filter(row => row.status === "waiting").length;
  const successful = results.filter(row => row.status === "success" && row.bookingId);

  useEffect(() => () => { stopRef.current = true; }, []);
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  async function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > broadReachBulkMaxBytes || !/\.(csv|xlsx)$/i.test(file.name)) {
      setPreview({ ...idle, status: "error", message: "Choose a non-empty CSV or Excel file, 2 MB or smaller." });
      setResults([]); fileRef.current?.focus(); return;
    }
    busyRef.current = true; setValidating(true); setMessage("");
    try {
      const next = await previewBroadReachBulk(idle, form);
      setPreview(next);
      setResults(next.rows.map(row => ({ awb: row.awb, rows: row.rows, status: row.status === "ready" ? "waiting" : "invalid", message: row.message })));
      if (next.status === "error" && !next.rows.length) fileRef.current?.focus();
    } catch { setPreview({ ...idle, status: "error", message: "Preview was interrupted. Check your connection and sign-in, then validate again. No labels were requested." }); setResults([]); }
    finally { busyRef.current = false; setValidating(false); }
  }

  async function book() {
    if (busyRef.current || !waiting || (mode === "live" && (!liveEnabled || !confirmed))) return;
    busyRef.current = true; stopRef.current = false; setStopping(false); setRunning(true); setMessage("");
    const pendingAwbs = new Set(results.filter(row => row.status === "waiting").map(row => row.awb));
    const parcels = preview.rows.filter(row => row.status === "ready" && pendingAwbs.has(row.awb));
    try {
      setMessage("Checking API connection before booking any waiting parcels…");
      const connectionForm = new FormData(); connectionForm.set("awb", parcels[0].awb);
      const connection = await checkBroadReachConnection({ status: "idle", message: "" }, connectionForm);
      if (connection.status !== "success") { setMessage(`${connection.message} No waiting parcels were booked. Resolve the connection error before continuing.`); return; }
      setMessage("");
      const outcome = await processBroadReachBatch(parcels, mode, confirmed,
        form => generateBroadReachAwb({ status: "idle", message: "" }, form),
        (_index, result) => setResults(current => current.map(row => row.awb === result.awb ? result : row)),
        () => stopRef.current);
      setMessage(outcome === "completed" ? "Batch finished. Review each parcel result and download the saved labels." : "Batch stopped. Waiting parcels were not sent. Resolve the displayed error before continuing; unconfirmed parcels remain blocked from duplicate booking.");
    } catch { setMessage("Batch interrupted. Check sign-in, recent bookings and the BroadReach portal before continuing. No automatic retry was sent."); }
    finally { busyRef.current = false; setRunning(false); setStopping(false); summaryRef.current?.focus(); }
  }

  async function downloadLabels() {
    if (busyRef.current || !successful.length) return;
    busyRef.current = true; setDownloading(true); setMessage("");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip(); let size = 0;
      for (const [index, row] of successful.entries()) {
        const response = await fetch(`/api/courier-integrations/broadreach/labels/${row.bookingId}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Label for ${row.awb} could not be downloaded. Check sign-in and use its individual download link.`);
        const blob = await response.blob(); size += blob.size;
        if (size > 50 * 1024 * 1024) throw new Error("These labels exceed the 50 MB ZIP limit. Download labels individually or use smaller batches.");
        const contentType = response.headers.get("content-type") ?? "";
        const extension = contentType.includes("pdf") ? "pdf" : contentType.includes("png") ? "png" : "zpl";
        zip.file(`${index + 1}-${row.awb.replace(/[^A-Za-z0-9_-]/g, "_")}-${row.test ? "test" : "live"}.${extension}`, await blob.arrayBuffer());
      }
      zip.file("results.csv", broadReachResultsCsv(results));
      download(await zip.generateAsync({ type: "blob" }), "broadreach-labels.zip");
      setMessage(`Downloaded ${successful.length} labels and the result report.`);
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : "Labels could not be downloaded. Use the individual label links."); }
    finally { busyRef.current = false; setDownloading(false); }
  }

  return <section className="bp-panel p-5 sm:p-6" aria-labelledby="broadreach-bulk-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="broadreach-bulk-heading" className="text-xl font-bold">Bulk BroadReach labels</h2><p className="mt-2 text-sm text-[var(--muted)]">Upload existing FastDrop AWBs and parcel contents. Up to 100 parcels / 1,000 item rows per batch.</p></div><a href="/courier-integrations/broadreach/bulk-template" className={button}>Download CSV template</a></div>
    <p className="mt-3 text-sm text-[var(--muted)]">One row per content item. Repeat an AWB only for additional items in the same parcel; use matching currency and dimensions on those rows. Canada local: HS code, origin and SKU are optional. Canada → USA: all three are required. Enter HS codes as text to retain leading zeros.</p>
    <form onSubmit={validate} noValidate className="mt-5">
      <fieldset disabled={busy || !configured}>
        <label htmlFor="broadreach-bulk-file" className="text-sm font-semibold">BroadReach file (.csv or .xlsx)</label>
        <input ref={fileRef} id="broadreach-bulk-file" name="file" type="file" accept=".csv,.xlsx" aria-describedby="broadreach-bulk-file-help broadreach-bulk-preview" aria-invalid={preview.status === "error" && !preview.rows.length} className="bp-input mt-2" onChange={() => { setPreview(idle); setResults([]); setMessage(""); setConfirmed(false); }} />
        <p id="broadreach-bulk-file-help" className="mt-2 text-sm text-[var(--muted)]">Maximum 2 MB. Addresses, weight and destination are taken from the saved FastDrop shipment. Preview does not create labels.</p>
        <button type="submit" className={`${button} mt-3`}>{validating ? "Validating file…" : "Validate and preview"}</button>
      </fieldset>
    </form>
    <div aria-live="polite" aria-atomic="true"><p id="broadreach-bulk-preview" className={`mt-3 min-h-6 text-sm ${preview.status === "error" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>{preview.message}</p></div>
    {results.length ? <>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="text-sm font-semibold">Batch mode<select value={mode} disabled={busy || started} onChange={event => { setMode(event.target.value as "test" | "live"); setConfirmed(false); }} className="bp-input mt-2"><option value="test">Test labels</option><option value="live" disabled={!liveEnabled}>Live labels{!liveEnabled ? " — awaiting activation" : ""}</option></select></label>
        <button type="button" disabled={busy || !configured || !waiting || (mode === "live" && (!liveEnabled || !confirmed))} onClick={() => void book()} className="bp-button-primary !min-h-11 !text-sm focus-visible:outline-2 focus-visible:outline-offset-2">{running ? "Generating labels…" : started ? `Continue ${waiting} waiting parcels` : `Generate ${waiting} ${mode} labels`}</button>
        {running ? <button type="button" className={button} disabled={stopping} onClick={() => { stopRef.current = true; setStopping(true); }}>{stopping ? "Stopping after current parcel…" : "Stop after current parcel"}</button> : null}
      </div>
      {mode === "live" ? <label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4" /><span>Book these parcels with BroadReach. Each new live label may incur a shipping charge.</span></label> : <p className="mt-3 text-sm text-[var(--muted)]">Test labels do not assign a delivery partner or update custody. BroadReach requires production labels to test void/cancel; cancellation is currently handled in its portal.</p>}
      <div className="mt-4" aria-live="polite" aria-atomic="true"><p ref={summaryRef} tabIndex={-1} className="text-sm font-semibold">{successful.length} saved · {results.filter(row => ["error", "invalid"].includes(row.status)).length} need attention · {waiting} waiting{running ? " · Keep this page open" : ""}</p><p className="mt-2 min-h-6 text-sm text-[var(--muted)]">{message}</p></div>
      {running ? <progress className="mt-3 w-full accent-[var(--brand)]" aria-label="Parcels processed" value={results.filter(row => !["waiting", "processing", "invalid"].includes(row.status)).length} max={results.filter(row => row.status !== "invalid").length} /> : null}
      <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy} className={button} onClick={() => download(new Blob([broadReachResultsCsv(results)], { type: "text/csv;charset=utf-8" }), "broadreach-results.csv")}>Download result report</button><button type="button" disabled={busy || !successful.length} className={button} onClick={() => void downloadLabels()}>{downloading ? "Preparing labels…" : `Download ${successful.length} labels ZIP`}</button></div>
      <div className="mt-4 max-h-[560px] overflow-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-[var(--line)]"><th scope="col" className="py-3 pr-3">FastDrop AWB / rows</th><th scope="col" className="pr-3">Service / items</th><th scope="col" className="pr-3">Result</th><th scope="col">Label</th></tr></thead><tbody>{results.map(row => {
        const parcel = preview.rows.find(item => item.awb === row.awb);
        return <tr key={row.awb} className="border-b border-[var(--line)] align-top"><td className="py-3 pr-3"><span className="font-mono font-semibold">{row.awb}</span><span className="mt-1 block text-[var(--muted)]">Rows {row.rows.join(", ")}</span></td><td className="py-3 pr-3">{parcel?.service ?? "—"}<span className="mt-1 block text-[var(--muted)]">{parcel?.options.items.length} items · {parcel?.options.currency}</span></td><td className="max-w-sm py-3 pr-3"><span className="font-semibold capitalize">{row.status === "waiting" ? "Ready" : row.status}</span><p className="mt-1 break-words text-[var(--muted)]">{row.message}</p>{row.tracking ? <p className="mt-1 font-mono">{row.test ? "TEST" : "LIVE"}: {row.tracking}</p> : null}</td><td className="py-3">{row.bookingId ? <a href={`/api/courier-integrations/broadreach/labels/${row.bookingId}`} className="text-[var(--brand)] underline">Download</a> : "—"}</td></tr>;
      })}</tbody></table></div>
      <p className="mt-3 text-sm text-[var(--muted)]">Saved labels remain in Recent carrier bookings after refresh. Reuploading a booked AWB in the same mode reuses its saved label; pending or unconfirmed requests stay blocked. Export this report before leaving to retain invalid and unprocessed rows.</p>
    </> : null}
  </section>;
}
