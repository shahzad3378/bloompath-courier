import Link from "next/link";
import { ArrowLeft, BadgeDollarSign, MapPinned, PackageCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { CarrierRateUploadForm } from "@/components/carrier-rate-upload-form";
import { CarrierServiceZoneMappings, type CarrierMapZone } from "@/components/carrier-service-zone-mappings";
import { ShipperWorkspace } from "@/components/shipper-workspace";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "3PL Rate Cards" };
const rateRoles = ["super_admin", "operations_admin", "finance_staff"] as const;

type RateCard = {
  id: string;
  card_name: string;
  country_code: string;
  currency: string;
  effective_from: string;
  created_at: string;
  is_active: boolean;
  import_status: string;
  grid_row_count: number;
  postal_mapping_count: number;
  source_filename: string;
  rate_notes: string | null;
  third_party_carriers: { name: string; code: string } | { name: string; code: string }[] | null;
};

function carrierOf(card: RateCard) { return Array.isArray(card.third_party_carriers) ? card.third_party_carriers[0] : card.third_party_carriers; }

type ServiceZoneRow = { id: number; country_code: string; name: string; zone_type: string; postal_prefix: string | null; postal_from: string | null; postal_to: string | null; city: string | null; district: string | null; area: string | null };
type ZoneMapRow = { rate_card_id: string; service_zone_id: number; zone_code: string };

function zoneRule(zone: ServiceZoneRow) {
  if (zone.zone_type === "postal_prefix") return `Prefix ${zone.postal_prefix || "—"} → ${zone.city || "—"}`;
  if (zone.zone_type === "postal_range") return `${zone.postal_from || "—"}–${zone.postal_to || "—"} → ${zone.city || "—"}`;
  if (zone.zone_type === "district") return `${zone.city || "—"} · ${zone.district || "—"}`;
  if (zone.zone_type === "area") return `${zone.city || "—"} · ${zone.area || "—"}`;
  return zone.city || "—";
}

export default async function ShipperCarrierRatesPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(rateRoles);
  const { id } = await params;
  if (!profile.organization_id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();
  const [{ data: shipper, error: shipperError }, { data: cards, error: cardsError }] = await Promise.all([
    db.from("profiles").select("id,full_name,email").eq("id", id).eq("organization_id", profile.organization_id).eq("role", "shipper").maybeSingle(),
    db.from("carrier_rate_cards").select("id,card_name,country_code,currency,effective_from,created_at,is_active,import_status,grid_row_count,postal_mapping_count,source_filename,rate_notes,third_party_carriers(name,code)").eq("organization_id", profile.organization_id).eq("shipper_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (shipperError || cardsError) throw new Error("Carrier rate cards could not be loaded.");
  if (!shipper) notFound();
  const rateCards = (cards ?? []) as unknown as RateCard[];
  const activeCards = rateCards.filter(card => card.is_active && card.import_status === "active");
  const activeCardIds = activeCards.map(card => card.id);
  const countryCodes = [...new Set(activeCards.map(card => card.country_code))];
  const [{ data: zones, error: zonesError }, { data: gridZones, error: gridZonesError }, { data: mappings, error: mappingsError }] = countryCodes.length && activeCardIds.length ? await Promise.all([
    db.from("service_zones").select("id,country_code,name,zone_type,postal_prefix,postal_from,postal_to,city,district,area").eq("organization_id", profile.organization_id).in("country_code", countryCodes).eq("is_active", true).order("name"),
    db.from("carrier_rate_grid").select("rate_card_id,zone_code").eq("organization_id", profile.organization_id).in("rate_card_id", activeCardIds),
    db.from("carrier_service_zone_map").select("rate_card_id,service_zone_id,zone_code").eq("organization_id", profile.organization_id).in("rate_card_id", activeCardIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (zonesError || gridZonesError || mappingsError) throw new Error("Service Zone mappings could not be loaded.");
  const zonesByCountry = new Map<string, ServiceZoneRow[]>();
  for (const zone of (zones ?? []) as ServiceZoneRow[]) zonesByCountry.set(zone.country_code, [...(zonesByCountry.get(zone.country_code) ?? []), zone]);
  const codesByCard = new Map<string, Set<string>>();
  for (const row of gridZones ?? []) {
    const codes = codesByCard.get(row.rate_card_id) ?? new Set<string>();
    codes.add(row.zone_code);
    codesByCard.set(row.rate_card_id, codes);
  }
  const mappingsByCard = new Map<string, Map<number, string>>();
  for (const row of (mappings ?? []) as ZoneMapRow[]) {
    const cardMappings = mappingsByCard.get(row.rate_card_id) ?? new Map<number, string>();
    cardMappings.set(Number(row.service_zone_id), row.zone_code);
    mappingsByCard.set(row.rate_card_id, cardMappings);
  }
  const canManage = profile.role === "super_admin" || profile.role === "operations_admin";
  return <ShipperWorkspace title="3PL Rate Cards" description={`${shipper.full_name || shipper.email} · optional carrier prices`} canCreate={profile.role === "super_admin" || profile.role === "operations_admin"}>
    <div className="space-y-5">
      <Link href={`/shippers/${id}`} className="inline-flex items-center gap-2 text-xs font-bold text-[#13734b]"><ArrowLeft className="size-4" /> Back to shipper</Link>
      <CarrierRateUploadForm shipperId={shipper.id} />
      <section className="bp-panel overflow-hidden">
        <div className="border-b border-[#edf1ef] px-5 py-4 sm:px-6">
          <p className="bp-section-label">Carrier cost rates</p>
          <h2 className="mt-1 text-lg font-black text-[#26372f]">Imported rate cards</h2>
          <p className="mt-1 text-xs text-[#87938d]">Only active cards are used for later carrier comparison. Previous versions remain here for reference.</p>
        </div>
        {rateCards.length ? <div className="divide-y divide-[#edf1ef]">{rateCards.map((card) => {
          const carrier = carrierOf(card);
          const active = card.is_active && card.import_status === "active";
          const zoneMappings = mappingsByCard.get(card.id) ?? new Map<number, string>();
          const mapZones: CarrierMapZone[] = (zonesByCountry.get(card.country_code) ?? []).map(zone => ({ id: zone.id, name: zone.name, mappingRule: zoneRule(zone), zoneCode: zoneMappings.get(zone.id) ?? null }));
          return <div key={card.id} className="px-5 py-5 sm:px-6">
            <article className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]"><BadgeDollarSign className="size-5" /></span>
              <div className="min-w-0"><h3 className="truncate font-black text-[#26372f]">{card.card_name}</h3><p className="mt-1 text-xs text-[#74827b]">{carrier?.name || "3PL"} · {card.country_code} · {card.currency} · effective {card.effective_from}</p><p className="mt-1 truncate text-[11px] text-[#9aa69f]">Source: {card.source_filename}</p>{card.rate_notes && <p className="mt-2 max-w-3xl text-xs leading-5 text-[#64746b]">{card.rate_notes}</p>}</div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6f66]"><PackageCheck className="size-4" />{card.grid_row_count.toLocaleString()} rate rows</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6f66]"><MapPinned className="size-4" />{card.postal_mapping_count.toLocaleString()} postal zones</span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${card.is_active && card.import_status === "active" ? "bg-[#e8f7ef] text-[#13734b]" : "bg-[#f1f3f2] text-[#87938d]"}`}>{card.is_active && card.import_status === "active" ? "Active" : card.import_status === "failed" ? "Failed" : "Historical"}</span>
            </div>
            </article>
            {active ? <div className="mt-4 space-y-3">
              {canManage ? <details className="rounded-xl border border-[#dce7e1] bg-white"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-[#26372f] hover:bg-[#f7faf8]">Upload updated rate file</summary><div className="border-t border-[#edf1ef] p-4"><CarrierRateUploadForm key={`update-${card.id}`} shipperId={shipper.id} mode="update" defaults={{ carrierName: carrier?.name || "", cardName: card.card_name, countryCode: card.country_code, currency: card.currency, effectiveFrom: new Date().toISOString().slice(0, 10), copyZoneMappingsFrom: card.id }} /></div></details> : null}
              <CarrierServiceZoneMappings cardId={card.id} shipperId={shipper.id} zones={mapZones} zoneCodes={[...(codesByCard.get(card.id) ?? new Set<string>())].sort((a,b)=>a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))} canManage={canManage}/>
            </div> : null}
          </div>;
        })}</div> : <div className="px-6 py-12 text-center"><MapPinned className="mx-auto size-9 text-[#a5b0aa]" /><p className="mt-3 text-sm font-bold text-[#53645c]">No 3PL rate cards yet</p><p className="mt-1 text-xs text-[#87938d]">Upload a carrier workbook above. This does not change the rates charged to the shipper.</p></div>}
      </section>
    </div>
  </ShipperWorkspace>;
}
