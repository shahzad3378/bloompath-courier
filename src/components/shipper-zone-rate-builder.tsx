"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type ZoneOption = {
  id: number;
  country_code: string;
  name: string;
  postal_prefix: string | null;
  city: string | null;
};

type Props = {
  zones: ZoneOption[];
  currency: string;
};

export function ShipperZoneRateBuilder({ zones, currency }: Props) {
  const [rows, setRows] = useState([0]);

  function addRow() {
    setRows((current) => [...current, (current.at(-1) ?? 0) + 1]);
  }

  function removeRow(key: number) {
    setRows((current) => current.length === 1 ? current : current.filter((item) => item !== key));
  }

  return (
    <section className="lg:col-span-2 rounded-2xl border border-[#cfe2d8] bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#188459]">Zone rate card</p>
          <h3 className="mt-1 text-lg font-black text-[#26372f]">Add shipper zones</h3>
          <p className="mt-1 text-xs text-[#7b8982]">
            Add as many zones as required for this shipper. Billing will use the matched shipment zone rate; the default rate remains the fallback.
          </p>
        </div>
        <button type="button" onClick={addRow} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#bdd9ca] bg-[#edf7f2] px-4 text-xs font-black text-[#13734b]">
          <Plus className="size-4" /> Add More Zone
        </button>
      </div>

      {zones.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[#efd9a9] bg-[#fffaf0] px-4 py-3 text-xs font-semibold text-[#8a651f]">
          No service zones are configured yet. Create the courier company's service zones first, then assign their shipper-specific rates here.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map((key, index) => (
            <div key={key} className="grid gap-3 rounded-xl border border-[#e1e9e5] bg-[#fbfcfb] p-4 md:grid-cols-[1.4fr_0.75fr_0.75fr_auto] md:items-end">
              <label className="text-xs font-bold text-[#526159]">
                Zone {index + 1}
                <select name="zone_service_zone_id" defaultValue="" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal">
                  <option value="">Select zone</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.country_code} · {zone.name}{zone.postal_prefix ? ` · ${zone.postal_prefix}` : zone.city ? ` · ${zone.city}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-[#526159]">
                Delivery — {currency}
                <input name="zone_delivery_rate" type="number" min="0" step="0.01" placeholder="0.00" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal" />
              </label>

              <label className="text-xs font-bold text-[#526159]">
                Return — {currency}
                <input name="zone_return_rate" type="number" min="0" step="0.01" defaultValue="0.00" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal" />
              </label>

              <button type="button" onClick={() => removeRow(key)} disabled={rows.length === 1} title="Remove zone" className="inline-grid size-11 place-items-center rounded-xl border border-[#edd1d1] bg-white text-[#a13f3f] disabled:cursor-not-allowed disabled:opacity-30">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
