"use client";

import { useActionState } from "react";
import { ArrowDownToLine, FileSpreadsheet, LoaderCircle, MapPinned, Save, UploadCloud } from "lucide-react";
import {
  bulkMapCarrierServiceZonesAction,
  initialBulkZoneMapState,
  initialSingleZoneMapState,
  saveCarrierServiceZoneMappingAction,
} from "@/app/(portal)/shippers/[id]/carrier-rates/zone-mapping-actions";

export type CarrierMapZone = { id: number; name: string; mappingRule: string; zoneCode: string | null };

function ZoneMappingRow({ zone, cardId, shipperId, codes }: {
  zone: CarrierMapZone;
  cardId: string;
  shipperId: string;
  codes: string[];
}) {
  const [state, action, pending] = useActionState(saveCarrierServiceZoneMappingAction, initialSingleZoneMapState);
  return <form action={action} className="grid items-center gap-2 border-t border-[#edf1ef] px-4 py-3 sm:grid-cols-[minmax(180px,1fr)_minmax(140px,1fr)_auto]">
    <input type="hidden" name="rate_card_id" value={cardId}/><input type="hidden" name="shipper_id" value={shipperId}/><input type="hidden" name="service_zone_id" value={zone.id}/>
    <div><p className="text-xs font-bold text-[#34453c]">{zone.name}</p><p className="mt-0.5 text-[10px] text-[#87938d]">{zone.mappingRule}</p></div>
    <label className="sr-only" htmlFor={`zone-map-${cardId}-${zone.id}`}>3PL zone for {zone.name}</label>
    <select id={`zone-map-${cardId}-${zone.id}`} name="zone_code" defaultValue={zone.zoneCode || ""} className="bp-input min-h-10 text-xs">
      <option value="">Not mapped</option>{codes.map(code => <option key={code} value={code}>{code}</option>)}
    </select>
    <button disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#cfe0d7] px-3 text-xs font-bold text-[#13734b] hover:bg-[#f5fbf7] disabled:cursor-wait disabled:opacity-60">
      {pending ? <LoaderCircle className="size-3.5 animate-spin"/> : <Save className="size-3.5"/>}Save
    </button>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`text-[11px] sm:col-span-3 ${state.status === "error" ? "text-[#a13f3f]" : "text-[#176a47]"}`}>{state.message}</p> : null}
  </form>;
}

export function CarrierServiceZoneMappings({
  cardId,
  shipperId,
  zones,
  zoneCodes,
  canManage,
}: {
  cardId: string;
  shipperId: string;
  zones: CarrierMapZone[];
  zoneCodes: string[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(bulkMapCarrierServiceZonesAction, initialBulkZoneMapState);
  const templateHref = `/api/shippers/${shipperId}/carrier-rates/${cardId}/zone-mapping-template`;
  return <details className="mt-4 rounded-xl border border-[#dce7e1] bg-[#fbfdfc]">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-[#26372f] hover:bg-[#f5faf7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13734b]">
      <MapPinned className="size-4 text-[#13734b]"/>Map Service Zones to 3PL zones<span className="ml-auto rounded-full bg-[#edf4ff] px-2 py-0.5 text-[10px] font-bold text-[#174ea6]">{zones.filter(zone => zone.zoneCode).length}/{zones.length} mapped</span>
    </summary>
    <div className="border-t border-[#e7eee9] p-4">
      <p className="max-w-3xl text-xs leading-5 text-[#74827b]">Each Service Zone below is your internal delivery area. Choose the matching 3PL zone code from this rate card. These links are used for carrier cost comparison; they do not change your delivery charges.</p>
      {canManage ? <div className="mt-4 grid gap-4 rounded-xl bg-white p-4 ring-1 ring-[#e7eee9] lg:grid-cols-[1fr_1.3fr]">
        <div><p className="text-xs font-black text-[#34453c]">Bulk map with Excel</p><p className="mt-1 text-[11px] leading-5 text-[#7c8982]">Download this card’s template, fill the 3PL Zone Code column, then upload it. MAP adds or updates a link; UNMAP removes one. Blank-action rows are left unchanged.</p><a href={templateHref} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#cfe0d7] px-3 text-xs font-bold text-[#13734b] hover:bg-[#f5fbf7]"><ArrowDownToLine className="size-4"/>Download mapping template</a></div>
        <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="rate_card_id" value={cardId}/><input type="hidden" name="shipper_id" value={shipperId}/>
          <label className="min-w-0 flex-1 text-xs font-bold text-[#53645c]">Excel mapping file<span className="mt-1 flex min-h-10 items-center gap-2 rounded-lg border border-[#dbe5e0] bg-white px-3 font-normal text-[#697970]"><FileSpreadsheet className="size-4 shrink-0 text-[#13734b]"/><input name="file" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="min-w-0 flex-1 text-[11px] file:mr-2 file:rounded-md file:border-0 file:bg-[#edf7f2] file:px-2 file:py-1.5 file:text-[10px] file:font-bold file:text-[#13734b]"/></span></label>
          <button disabled={pending} className="bp-button-primary min-h-10 shrink-0 disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin"/> : <UploadCloud className="size-4"/>}{pending ? "Saving mappings…" : "Upload & save"}</button>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`basis-full text-xs sm:basis-auto ${state.status === "error" ? "text-[#a13f3f]" : "text-[#176a47]"}`}>{state.message}</p> : null}
        </form>
      </div> : null}
      {zones.length ? <div className="mt-4 overflow-hidden rounded-xl border border-[#e7eee9] bg-white">
        <div className="grid gap-2 bg-[#f6f9f7] px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#87938d] sm:grid-cols-[minmax(180px,1fr)_minmax(140px,1fr)_auto]"><span>BloomPath Service Zone</span><span>3PL Zone Code</span><span className="sr-only">Action</span></div>
        {zones.map(zone => <ZoneMappingRow key={zone.id} zone={zone} cardId={cardId} shipperId={shipperId} codes={zoneCodes} />)}
      </div> : <p className="mt-4 rounded-xl bg-white p-5 text-sm text-[#74827b]">No active Service Zones use this rate card’s destination market. Add zones first, then reload this page.</p>}
      {!zoneCodes.length ? <p role="alert" className="mt-3 text-xs font-semibold text-[#a13f3f]">This rate card has no rate-grid zone codes. Upload a rate file before mapping delivery areas.</p> : null}
    </div>
  </details>;
}
