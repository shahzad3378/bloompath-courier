"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, CircleAlert, LoaderCircle, PackageCheck, Search, Truck } from "lucide-react";

type TrackingEvent = { status: string; timestamp: string | null };
type TrackingResult = {
  trackingNumber: string;
  currentStatus: string;
  updatedAt: string | null;
  events: TrackingEvent[];
};

const milestones = ["Shipment booked", "Received", "In transit", "Out for delivery", "Delivered"];

function formatDate(value: string | null, timeZone: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

function getMilestoneIndex(events: TrackingEvent[], currentStatus: string) {
  const statusText = [currentStatus, ...events.map((event) => event.status)].join(" ").toLowerCase();
  if (statusText.includes("out for delivery")) return 3;
  if (statusText.includes("delivered") && !statusText.includes("undelivered")) return 4;
  if (["transit", "airport", "customs", "clearance", "departed", "arrived"].some((term) => statusText.includes(term))) return 2;
  if (["warehouse", "received", "picked up", "collected"].some((term) => statusText.includes(term))) return 1;
  return 0;
}

export function PublicTracking() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dubai");
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
      setShowHistory(true);
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

  const currentMilestone = result ? getMilestoneIndex(result.events, result.currentStatus) : 0;

  return (
    <main className="min-h-screen bg-[#d9effa] px-3 pb-10 text-[#172b3b] sm:px-6 sm:pb-14">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between py-4 sm:py-5">
        <Link href="/" className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1179bd] focus-visible:ring-offset-2">
          <span className="grid size-10 place-items-center rounded-xl bg-[#087fc2] text-white"><PackageCheck className="size-5" aria-hidden="true" /></span>
          <span><span className="block text-sm font-extrabold tracking-tight text-[#173247]">BloomPath Courier</span><span className="mt-0.5 block text-[11px] text-[#527185]">Shipment tracking</span></span>
        </Link>
        <span className="hidden items-center gap-2 text-xs font-semibold text-[#42657c] sm:inline-flex"><span className="size-2 rounded-full bg-[#21a86a]" />Customer tracking</span>
      </header>

      <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-[#c3e2f1] bg-white shadow-[0_16px_48px_rgba(24,91,128,0.12)]">
        <div className="relative overflow-hidden bg-[#1387cb] px-5 py-7 text-white sm:px-9 sm:py-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-0 hidden h-full w-[42%] opacity-25 sm:block">
            <svg viewBox="0 0 420 180" fill="none" className="h-full w-full">
              <path d="M420 19H292c-32 0-41 34-73 34h-68c-27 0-34 23-65 23H0M420 81H333c-31 0-44 31-73 31h-68c-29 0-36 27-69 27H0M420 143H299c-31 0-42-22-72-22h-61c-28 0-36 21-66 21H0" stroke="white" strokeWidth="2" />
              <circle cx="292" cy="19" r="4" fill="white" /><circle cx="333" cy="81" r="4" fill="white" /><path d="m273 51 15-7-3 6 7 5-19-4Z" fill="white" />
            </svg>
          </div>
          <div className="relative z-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/75">BloomPath Courier</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Track a Package</h1>
            <p className="mt-2 text-sm text-white/85">Enter an AWB or reference number to see the latest shipment updates.</p>

            <form noValidate onSubmit={submit} className="mt-5 max-w-3xl">
              <label htmlFor="tracking-number" className="sr-only">AWB or reference number</label>
              <div className="flex flex-col gap-2 rounded-xl bg-white p-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
                  <Search className="size-5 shrink-0 text-[#7a909e]" aria-hidden="true" />
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
                    placeholder="Enter AWB or reference number"
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#172b3b] outline-none placeholder:font-normal placeholder:text-[#8194a0] focus-visible:ring-0"
                  />
                  {trackingNumber ? <button type="button" onClick={clearSearch} className="rounded-md px-2 py-2 text-xs font-semibold text-[#718692] hover:bg-[#eff5f8] hover:text-[#172b3b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1179bd]">Clear</button> : null}
                </div>
                <button type="submit" disabled={isLoading} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#268fe2] px-7 text-sm font-bold text-white transition hover:bg-[#147bc9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1179bd] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-75">
                  {isLoading ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Searching</> : <>Search<ArrowRight className="size-4" aria-hidden="true" /></>}
                </button>
              </div>
              <div className="mt-2 flex min-h-6 flex-wrap items-center justify-between gap-3" aria-live="polite">
                {error ? <p id="tracking-error" role="alert" className="inline-flex items-center gap-2 text-sm font-semibold text-white"><CircleAlert className="size-4" aria-hidden="true" />{error}</p> : isLoading ? <p className="text-xs text-white/80">Looking up your shipment…</p> : <span />}
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-white/90">Select Timezone:
                  <span className="relative inline-flex items-center">
                    <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)} aria-label="Select timezone" className="max-w-[190px] appearance-none rounded-md border border-white/30 bg-white/95 py-1.5 pl-2.5 pr-7 text-xs font-semibold text-[#315064] outline-none focus:ring-2 focus:ring-white">
                      {[...new Set([timeZone, "Asia/Dubai", "America/Toronto", "America/Vancouver", "UTC"])].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-[#537185]" aria-hidden="true" />
                  </span>
                </label>
              </div>
            </form>
          </div>
        </div>

        {result ? (
          <section aria-live="polite" className="px-5 py-5 sm:px-8 sm:py-6">
            <div className="flex flex-col gap-4 border-b border-[#dce8ed] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-[#6b7d87]">Last updated: {formatDate(result.updatedAt, timeZone)}</p>
                <h2 className="mt-1 flex flex-wrap items-center gap-x-2 text-xl font-extrabold text-[#172b3b] sm:text-2xl">Status: <span className="text-[#1c9b60]">{result.currentStatus}</span></h2>
                <p className="mt-2 break-all text-xs font-semibold text-[#536a78]">Tracking number: <span className="font-mono text-[#243e50]">{result.trackingNumber}</span></p>
              </div>
              <span className="grid size-12 shrink-0 place-items-center self-start rounded-full border border-[#d9e7ec] bg-[#f4fafc] text-[#1886c1] sm:self-center"><Truck className="size-6" aria-hidden="true" /></span>
            </div>

            <div aria-label="Shipment progress" className="overflow-x-auto py-6">
              <ol className="mx-auto flex min-w-[620px] max-w-4xl items-start">
                {milestones.map((label, index) => {
                  const isComplete = index <= currentMilestone;
                  return (
                    <li key={label} className="relative flex flex-1 flex-col items-center text-center">
                      {index > 0 ? <span aria-hidden="true" className={`absolute right-1/2 top-4 h-0.5 w-full ${index <= currentMilestone ? "bg-[#29a36a]" : "bg-[#dce8ed]"}`} /> : null}
                      <span className={`relative z-10 grid size-8 place-items-center rounded-full border ${isComplete ? "border-[#29a36a] bg-[#29a36a] text-white" : "border-[#d7e3e8] bg-white text-[#a0afb6]"}`}>
                        {isComplete ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : <span className="size-2 rounded-full bg-current" />}
                      </span>
                      <span className={`mt-2 px-1 text-[11px] font-semibold ${isComplete ? "text-[#315165]" : "text-[#9aaab2]"}`}>{label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="border-t border-[#dce8ed] pt-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-base font-extrabold text-[#243d4c]">Tracking History</h3>
                <button type="button" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-[#287db1] hover:bg-[#f0f8fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1179bd]">
                  {showHistory ? "Hide Tracking History" : "Show Tracking History"}<ChevronDown className={`size-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
              </div>
              {showHistory ? (
                result.events.length ? (
                  <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.8fr)]">
                    <div className="min-w-0">
                      <ol>
                        {result.events.map((item, index) => (
                          <li key={`${item.status}-${item.timestamp ?? index}`} className="relative flex gap-4 pb-6 last:pb-0">
                            {index < result.events.length - 1 ? <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-[#dce8ed]" /> : null}
                            <span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full ${index === 0 ? "bg-[#e6f6ee] text-[#23975f]" : "bg-[#edf7fb] text-[#2381b3]"}`}>
                              {index === 0 ? <PackageCheck className="size-4" aria-hidden="true" /> : <span className="size-2 rounded-full bg-current" />}
                            </span>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <p className={`text-sm leading-5 ${index === 0 ? "font-extrabold text-[#263d4a]" : "font-semibold text-[#465f6d]"}`}>{item.status}</p>
                              <p className="mt-1 text-xs text-[#8a9aa3]">{formatDate(item.timestamp, timeZone)}</p>
                            </div>
                            {index === 0 ? <span className="mt-0.5 h-fit rounded-full bg-[#e6f6ee] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#23844f]">Latest</span> : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <aside className="h-fit rounded-xl border border-[#e2edf1] bg-[#f7fbfd] p-4 sm:p-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7b919d]">Shipment status</p>
                      <p className="mt-2 text-sm font-bold leading-5 text-[#284557]">{result.currentStatus}</p>
                      <p className="mt-3 text-xs leading-5 text-[#718692]">Updates are displayed in the selected timezone. The newest update appears first.</p>
                    </aside>
                  </div>
                ) : <p className="mt-5 rounded-lg border border-dashed border-[#d5e3e9] bg-[#f8fbfc] px-4 py-5 text-sm text-[#718692]">No tracking history is available yet.</p>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>

      <footer className="mx-auto mt-5 flex w-full max-w-6xl flex-col gap-2 px-1 text-center text-xs text-[#638093] sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <p>Fast Drop shipment updates are shown here.</p>
        <p>Need help? Contact the sender who shared this tracking number.</p>
      </footer>
    </main>
  );
}
