"use client";

import { useActionState, useState } from "react";
import { CheckSquare, LoaderCircle, MapPinned, Route, Square, Truck } from "lucide-react";
import { autoPlanFleetRoutesAction, type FleetPlanState } from "@/app/(portal)/dispatch/fleet-actions";

const initial: FleetPlanState = { status: "idle", message: "" };

type Driver = { id: string; full_name: string; employee_code: string | null };
type ZoneSummary = { name: string; count: number };

export function FleetRoutePlanner({
  drivers,
  warehouseCount,
  totalShipmentCount,
  zones,
}: {
  drivers: Driver[];
  warehouseCount: number;
  totalShipmentCount: number;
  zones: ZoneSummary[];
}) {
  const [state, action, pending] = useActionState(autoPlanFleetRoutesAction, initial);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>(drivers.map((driver) => driver.id));

  const allSelected = drivers.length > 0 && selectedDrivers.length === drivers.length;
  const toggleAll = () => setSelectedDrivers(allSelected ? [] : drivers.map((driver) => driver.id));
  const toggleDriver = (id: string) => setSelectedDrivers((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  return (
    <section className="mt-7 overflow-hidden rounded-2xl border border-[#cfe0d7] bg-white shadow-[0_10px_32px_rgba(24,51,39,0.06)]">
      <div className="grid gap-0 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]"><MapPinned className="size-5" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#188459]">Fleet route planning</p>
                <h2 className="mt-1 text-xl font-black text-[#26372f]">Auto assign warehouse shipments</h2>
                <p className="mt-1 text-sm text-[#75837c]">Split warehouse AWBs by zone/postal area, balance them across drivers and create draft delivery routes automatically.</p>
              </div>
            </div>
            <div className="shrink-0 rounded-xl border border-[#dce8e2] bg-[#f8fbf9] px-4 py-3 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">At warehouse</p>
              <p className="mt-1 text-2xl font-black text-[#13734b]">{warehouseCount.toLocaleString("en-US")}</p>
              <p className="mt-1 text-[10px] font-semibold text-[#87938d]">of {totalShipmentCount.toLocaleString("en-US")} total shipments</p>
            </div>
          </div>

          <form action={action} className="mt-6">
            {selectedDrivers.map((id) => <input key={id} type="hidden" name="driver_ids" value={id} />)}
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block text-xs font-bold text-[#526159]">Zone / shipment pool
                <select name="zone_name" defaultValue="" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal outline-none focus:border-[#2b9466]">
                  <option value="">All warehouse zones</option>
                  {zones.map((zone) => <option key={zone.name} value={zone.name === "Unmapped" ? "__unmapped__" : zone.name}>{zone.name} · {zone.count} shipments</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-[#526159]">Maximum stops per route
                <select name="max_stops" defaultValue="100" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal outline-none focus:border-[#2b9466]">
                  {[50, 75, 100, 125, 150, 200, 250].map((value) => <option key={value} value={value}>{value} stops</option>)}
                </select>
              </label>
            </div>

            <div className="mt-5 rounded-xl border border-[#e0e8e4] bg-[#fafcfb] p-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-bold text-[#405048]">Drivers for auto assignment</p><p className="mt-1 text-[11px] text-[#87938d]">Routes are distributed round-robin after zone/postal clustering.</p></div>
                <button type="button" onClick={toggleAll} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d6e4dc] bg-white px-3 text-xs font-bold text-[#13734b]">
                  {allSelected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}{allSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              {drivers.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{drivers.map((driver) => {
                const checked = selectedDrivers.includes(driver.id);
                return <button key={driver.id} type="button" onClick={() => toggleDriver(driver.id)} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${checked ? "border-[#9fcbb5] bg-[#edf8f2]" : "border-[#e1e8e4] bg-white"}`}>
                  {checked ? <CheckSquare className="size-4 shrink-0 text-[#13734b]" /> : <Square className="size-4 shrink-0 text-[#96a29c]" />}
                  <span className="min-w-0"><span className="block truncate text-sm font-bold text-[#34453c]">{driver.full_name}</span><span className="mt-0.5 block text-[11px] text-[#87938d]">{driver.employee_code || "Driver"}</span></span>
                </button>;
              })}</div> : <p className="mt-3 rounded-lg bg-[#fff4e2] px-3 py-2 text-xs font-semibold text-[#8a651f]">No active drivers. Add drivers before auto planning.</p>}
            </div>

            {state.message ? <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${state.status === "success" ? "border border-[#bfe3cf] bg-[#ebf8f1] text-[#176a47]" : "border border-[#efc7c7] bg-[#fff1f1] text-[#a13f3f]"}`}>{state.message}</div> : null}

            <button disabled={pending || selectedDrivers.length === 0 || warehouseCount === 0} className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-black text-white shadow-lg shadow-[#13734b]/15 disabled:cursor-not-allowed disabled:opacity-45">
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Route className="size-4" />}
              {pending ? "Planning routes…" : "Auto Assign & Plan Routes"}
            </button>
          </form>
        </div>

        <aside className="border-t border-[#dce7e1] bg-[#102f23] p-5 text-white xl:border-l xl:border-t-0 sm:p-6">
          <div className="flex items-center gap-3"><Truck className="size-5 text-[#70d6a4]" /><h3 className="font-black">How planning works</h3></div>
          <div className="mt-5 space-y-4 text-sm leading-6 text-white/72">
            <p><strong className="text-white">1.</strong> Only own-fleet AWBs physically received at warehouse are considered.</p>
            <p><strong className="text-white">2.</strong> Shipments are grouped by service zone, then sorted by postal code, city and address so nearby stops stay together.</p>
            <p><strong className="text-white">3.</strong> Draft runs are created automatically and balanced across the selected active drivers.</p>
            <p><strong className="text-white">4.</strong> Stops with saved coordinates are Google-sequenced immediately. Missing coordinates are finalized by Google when the route is handed over.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
