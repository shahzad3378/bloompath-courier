"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, FileStack, Package, Plug, Printer, Truck } from "lucide-react";

const WorkContext = createContext<(id: string, busy: boolean) => void>(() => {});
export function useCarrierBusy(busy: boolean) {
  const update = useContext(WorkContext), id = useId();
  useEffect(() => { update(id, busy); return () => update(id, false); }, [busy, id, update]);
}
const tabs = [{ id: "single", label: "Single shipment", icon: Package }, { id: "bulk", label: "Bulk upload", icon: FileStack }, { id: "bookings", label: "Bookings & labels", icon: Printer }] as const;
export function CarrierWorkspace({ carrier, configured, mode, single, bulk, bookings, connection, notice }: {
  carrier: "gta-airskip" | "broadreach"; configured: boolean; mode: string;
  single: ReactNode; bulk: ReactNode; bookings: ReactNode; connection?: ReactNode; notice?: ReactNode;
}) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const selected = tabs.some(t => t.id === params.get("tab")) ? params.get("tab")! : "single";
  const [busySources, setBusySources] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false), [target, setTarget] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = Object.values(busySources).some(Boolean);
  const updateBusy = useState(() => (id: string, value: boolean) => setBusySources(current => current[id] === value ? current : { ...current, [id]: value }))[0];
  function switchCarrier(value: string) {
    const url = `/courier-integrations?carrier=${value}&tab=${selected}`;
    if (dirty) { setTarget(url); dialog.current?.showModal(); } else router.push(url);
  }
  return <WorkContext.Provider value={updateBusy}><div className="bp-page max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">FastDrop · Carrier desk</p><h1 className="bp-heading mt-2 text-3xl font-bold sm:text-4xl">Ship with your partners</h1><p className="mt-2 text-sm text-[var(--muted)]">One workspace for bookings, batch uploads and printable labels.</p></div><Link href="/shipments/import" aria-disabled={busy} onClick={e => { if (busy) e.preventDefault(); }} className="bp-button-secondary gap-2 !text-sm">Import new shipments <ArrowUpRight size={16} /></Link></header>
    <section className="bp-panel overflow-hidden" aria-label="Carrier workspace">
      <div className="grid gap-5 bg-[var(--brand-soft)] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div className="flex items-center gap-4"><span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand)] text-white sm:flex"><Truck size={24} /></span><label className="w-full max-w-md text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Courier partner<select aria-label="Courier partner" className="bp-input mt-2 !bg-white !text-base !font-semibold !normal-case !tracking-normal" value={carrier} disabled={busy} onChange={e => switchCarrier(e.target.value)}><option value="gta-airskip">GTA AirSkip · Canada & USA</option><option value="broadreach">BroadReach · Canada & USA</option></select></label></div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold"><span className="rounded-full border border-[var(--line)] bg-white px-3 py-2">{mode}</span><span className={`rounded-full px-3 py-2 ${configured ? "bg-white text-[var(--brand)]" : "bg-white text-[var(--muted)]"}`}>{configured ? "Account configured" : "Setup needed"}</span></div>
      </div>
      <nav aria-label="Booking views" className="flex overflow-x-auto border-b border-[var(--line)] px-3 sm:px-6">{tabs.map(({ id, label, icon: Icon }) => <Link key={id} href={`${pathname}?${new URLSearchParams({ ...Object.fromEntries(params), tab: id })}`} scroll={false} aria-disabled={busy} onClick={e => { if (busy) e.preventDefault(); }} aria-current={selected === id ? "page" : undefined} className={`flex min-h-14 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${selected === id ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}><Icon size={17} />{label}</Link>)}</nav>
      <div className="p-4 sm:p-6" onChangeCapture={() => setDirty(true)}>{notice}<div hidden={selected !== "single"}>{single}</div><div hidden={selected !== "bulk"}>{bulk}</div><div hidden={selected !== "bookings"}>{bookings}</div></div>
    </section>
    {connection ? <details className="bp-panel p-4"><summary className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-semibold"><Plug size={16} />Connection tools</summary><div className="mt-4">{connection}</div></details> : null}
    <dialog ref={dialog} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[var(--line)] bg-white p-6 text-[var(--foreground)] shadow-xl backdrop:bg-black/40" onClose={() => setTarget("")}><h2 className="text-xl font-bold">Switch courier partner?</h2><p className="mt-3 text-sm text-[var(--muted)]">Your form and upload preview will be cleared. Saved bookings and labels will remain available.</p><div className="mt-5 flex flex-wrap gap-3"><button autoFocus type="button" className="bp-button-secondary" onClick={() => dialog.current?.close()}>Keep working</button><button type="button" className="bp-button-primary" onClick={() => { dialog.current?.close(); router.push(target); }}>Switch partner</button></div></dialog>
  </div></WorkContext.Provider>;
}
