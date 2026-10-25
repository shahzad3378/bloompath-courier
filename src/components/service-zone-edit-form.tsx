"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { updateServiceZoneAction } from "@/app/(portal)/service-zones/actions";
import type { ServiceZoneType } from "@/lib/service-zones";

export type EditableServiceZone = {
  id: number;
  country_code: string;
  name: string;
  zone_type: string;
  postal_prefix: string | null;
  postal_from: string | null;
  postal_to: string | null;
  city: string | null;
  district: string | null;
  area: string | null;
};

const labelClass = "text-xs font-bold text-[#53645c]";

export function ServiceZoneEditForm({ zone }: { zone: EditableServiceZone }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ServiceZoneType>(zone.zone_type as ServiceZoneType);

  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="text-left">
    <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-[#dbe5e0] px-3 text-xs font-bold text-[#53645c] hover:bg-[#f7faf8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13734b]">
      <Pencil className="size-3.5" /> Edit zone
    </summary>
    {open ? <form action={updateServiceZoneAction} className="mt-3 grid gap-3 rounded-xl border border-[#e4ebe7] bg-[#fafcfb] p-4 text-left sm:grid-cols-2">
      <input type="hidden" name="zone_id" value={zone.id} />
      <div className="text-xs font-bold text-[#53645c]">Market<input value={zone.country_code} readOnly className="bp-input mt-2 bg-[#f1f4f2]" /></div>
      <label className={labelClass}>Mapping type<select name="zone_type" value={type} onChange={event => setType(event.target.value as ServiceZoneType)} className="bp-input mt-2">
        <option value="postal_prefix">Postal / ZIP Prefix</option><option value="postal_range">Postal / ZIP Range</option><option value="city">City</option><option value="district">District</option><option value="area">Area / Zone</option>
      </select></label>
      {type === "postal_prefix" ? <label className={labelClass}>Postal / ZIP prefix<input name="postal_prefix" defaultValue={zone.postal_prefix || ""} maxLength={30} className="bp-input mt-2 uppercase" required /></label> : null}
      {type === "postal_range" ? <><label className={labelClass}>Postal from<input name="postal_from" defaultValue={zone.postal_from || ""} maxLength={30} className="bp-input mt-2 uppercase" required /></label><label className={labelClass}>Postal to<input name="postal_to" defaultValue={zone.postal_to || ""} maxLength={30} className="bp-input mt-2 uppercase" required /></label></> : null}
      <label className={labelClass}>City<input name="city" defaultValue={zone.city || ""} maxLength={120} className="bp-input mt-2" required /></label>
      {type === "district" ? <label className={labelClass}>District<input name="district" defaultValue={zone.district || ""} maxLength={120} className="bp-input mt-2" required /></label> : null}
      {type === "area" ? <label className={labelClass}>Area<input name="area" defaultValue={zone.area || ""} maxLength={120} className="bp-input mt-2" required /></label> : null}
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2"><button className="bp-button-primary min-h-10"><Check className="size-4" />Save zone changes</button><button type="button" onClick={() => setOpen(false)} className="bp-button-secondary min-h-10"><X className="size-4" />Cancel</button><p className="basis-full text-[11px] leading-5 text-[#7c8982]">The market stays the same. Existing shipments keep their saved delivery-zone details.</p></div>
    </form> : null}
  </details>;
}
