"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, LoaderCircle, PackageCheck, Search, Truck } from "lucide-react";

type TrackingEvent = { status: string; timestamp: string | null };
type TrackingResult = {
  trackingNumber: string;
  currentStatus: string;
  updatedAt: string | null;
  events: TrackingEvent[];
};

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function PublicTracking() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = trackingNumber.trim().toUpperCase();
    setError("");
    setResult(null);

    if (!value) {
      setError("Enter an AWB or reference number.");
      return;
    }
    if (!/^[A-Z0-9-]{3,80}$/.test(value)) {
      setError("Use 3–80 letters, numbers, or hyphens.");
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setIsLoading(true);

    try {
      const response = await fetch("/api/public-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber: value }),
        signal: controller.signal,
      });
      const payload = await response.json() as TrackingResult | { error?: string };
      if (!response.ok) {
        setError("error" in payload && payload.error ? payload.error : "Tracking is temporarily unavailable. Please try again.");
        return;
      }
      if (!("currentStatus" in payload) || !Array.isArray(payload.events)) {
        setError("Tracking is temporarily unavailable. Please try again.");
        return;
      }
      setResult(payload);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("We could not reach tracking right now. Please try again.");
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setIsLoading(false);
      }
    }
  }

  function clearSearch() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setTrackingNumber("");
    setResult(null);
    setError("");
    setIsLoading(false);
    inputRef.current?.focus();
  }

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-8 text-[#17231e] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-9 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13734b] focus-visible:ring-offset-2">
            <span className="grid size-10 place-items-center rounded-xl bg-[#10291f] text-white"><PackageCheck className="size-5" aria-hidden="true" /></span>
            <span><span className="block text-sm font-extrabold tracking-tight">BloomPath Courier</span><span className="mt-0.5 block text-[11px] text-[#718078]">Shipment tracking</span></span>
          </Link>
          <span className="hidden items-center gap-2 rounded-full border border-[#dfe7e3] bg-white px-3 py-2 text-xs font-semibold text-[#53645b] sm:inline-flex"><span className="size-2 rounded-full bg-[#15905c]" />Live tracking</span>
        </header>

        <section className="overflow-hidden rounded-[1.4rem] border border-[#dfe7e3] bg-white shadow-[0_16px_50px_rgba(16,41,31,0.07)]">
          <div className="bg-[#10291f] px-5 py-7 text-white sm:px-9 sm:py-9">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#71d5a5]">Track your shipment</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Know where your parcel is.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Enter the shipment AWB or the reference number shared with you.</p>
            <form noValidate onSubmit={submit} className="mt-6">
              <label htmlFor="tracking-number" className="mb-2 block text-xs font-bold text-white/85">AWB or reference number</label>
              <div className="flex flex-col gap-2 rounded-2xl bg-white p-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
                  <Search className="size-5 shrink-0 text-[#7c8a82]" aria-hidden="true" />
                  <input
                    ref={inputRef}
                    id="tracking-number"
                    name="trackingNumber"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    maxLength={80}
                    value={trackingNumber}
                    onChange={(event) => setTrackingNumber(event.target.value)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "tracking-error" : undefined}
                    placeholder="e.g. FD26101110005497"
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#17231e] outline-none placeholder:font-normal placeholder:text-[#929f98] focus-visible:ring-0"
                  />
                  {trackingNumber ? <button type="button" onClick={clearSearch} className="rounded-md px-2 py-2 text-xs font-bold text-[#718078] hover:bg-[#f1f5f3] hover:text-[#17231e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13734b]" aria-label="Clear tracking number">Clear</button> : null}
                </div>
                <button type="submit" disabled={isLoading} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-6 text-sm font-extrabold text-white transition hover:bg-[#0c5b3b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#10291f] disabled:cursor-wait disabled:opacity-75">
                  {isLoading ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Searching</> : <>Track shipment<ArrowRight className="size-4" aria-hidden="true" /></>}
                </button>
              </div>
              <div className="mt-2 min-h-5" aria-live="polite">{error ? <p id="tracking-error" role="alert" className="inline-flex items-center gap-2 text-sm font-semibold text-[#ffd5d5]"><CircleAlert className="size-4" aria-hidden="true" />{error}</p> : isLoading ? <p className="text-xs text-white/65">Looking up your shipment…</p> : null}</div>
            </form>
          </div>

          {result ? (
            <section aria-live="polite" className="px-5 py-6 sm:px-9 sm:py-8">
              <div className="flex flex-col gap-5 border-b border-[#e8eeeb] pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]"><Truck className="size-6" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#75837b]">Current status</p>
                    <h2 className="mt-1 text-xl font-black leading-snug text-[#17231e] sm:text-2xl">{result.currentStatus}</h2>
                    <p className="mt-1 text-sm text-[#68766f]">Last updated {formatDate(result.updatedAt)}</p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#75837b]">AWB number</p>
                  <p className="mt-1 break-all font-mono text-sm font-bold tracking-wide text-[#13734b]">{result.trackingNumber}</p>
                </div>
              </div>

              <div className="pt-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div><h3 className="text-lg font-extrabold text-[#24362d]">Shipment history</h3><p className="mt-1 text-xs text-[#829089]">Newest updates appear first.</p></div>
                  <span className="text-xs font-semibold text-[#829089]">{result.events.length} update{result.events.length === 1 ? "" : "s"}</span>
                </div>

                {result.events.length ? (
                  <ol className="mt-6">
                    {result.events.map((item, index) => (
                      <li key={`${item.status}-${item.timestamp ?? index}`} className="relative flex gap-4 pb-7 last:pb-0">
                        {index < result.events.length - 1 ? <span aria-hidden="true" className="absolute left-[11px] top-6 h-[calc(100%-1rem)] w-px bg-[#dbe8e1]" /> : null}
                        <span className={`relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 ${index === 0 ? "border-[#13734b] bg-[#13734b] text-white" : "border-[#cddbd3] bg-white text-[#87958d]"}`}>
                          {index === 0 ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-current" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm leading-5 ${index === 0 ? "font-extrabold text-[#24362d]" : "font-semibold text-[#506159]"}`}>{item.status}</p>
                          <p className="mt-1 text-xs text-[#87938d]">{formatDate(item.timestamp)}</p>
                        </div>
                        {index === 0 ? <span className="rounded-full bg-[#e7f4ed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#13734b]">Latest</span> : null}
                      </li>
                    ))}
                  </ol>
                ) : <p className="mt-6 rounded-xl border border-dashed border-[#d5e0da] bg-[#fafcfb] px-4 py-5 text-sm text-[#68766f]">No tracking history is available yet.</p>}
              </div>
            </section>
          ) : null}
        </section>

        <footer className="mt-6 flex flex-col gap-2 text-center text-xs text-[#849188] sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <p>Fast Drop shipment updates are shown here.</p>
          <p>Need help? Contact the sender who shared this tracking number.</p>
        </footer>
      </div>
    </main>
  );
}
