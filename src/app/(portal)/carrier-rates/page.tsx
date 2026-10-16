import Link from "next/link";
import { ArrowUpRight, BadgeDollarSign, Building2, MapPinned } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "3PL Rate Cards" };
const rateRoles = ["super_admin", "operations_admin", "finance_staff"] as const;
type CarrierCardSummary = {
  id: string;
  shipper_id: string | null;
  card_name: string;
  country_code: string;
  currency: string;
  grid_row_count: number;
  postal_mapping_count: number;
  is_active: boolean;
  third_party_carriers: { name: string } | { name: string }[] | null;
};

export default async function CarrierRatesPage() {
  const profile = await requireProfile(rateRoles);
  if (!profile.organization_id) return null;
  const db = await createClient();
  const { data: shippers, error: shipperError } = await db.from("profiles").select("id,full_name,email").eq("organization_id", profile.organization_id).eq("role", "shipper").eq("status", "active").order("full_name").limit(500);
  if (shipperError) throw new Error("Shippers could not be loaded.");
  const shipperRows = shippers ?? [];
  const ids = shipperRows.map((row) => row.id);
  const [{ data: businesses, error: businessError }, { data: cards, error: cardsError }] = ids.length ? await Promise.all([
    db.from("shipper_business_profiles").select("shipper_id,company_name").eq("organization_id", profile.organization_id).in("shipper_id", ids),
    db.from("carrier_rate_cards").select("id,shipper_id,card_name,country_code,currency,grid_row_count,postal_mapping_count,is_active,third_party_carriers(name)").eq("organization_id", profile.organization_id).in("shipper_id", ids).order("created_at", { ascending: false }),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (businessError || cardsError) throw new Error("Carrier rate card summaries could not be loaded.");
  const names = new Map((businesses ?? []).map((row) => [row.shipper_id, row.company_name]));
  const byShipper = new Map<string, CarrierCardSummary[]>();
  for (const card of (cards ?? []) as unknown as CarrierCardSummary[]) {
    if (!card.shipper_id) continue;
    byShipper.set(card.shipper_id, [...(byShipper.get(card.shipper_id) ?? []), card]);
  }

  return <div className="bp-page max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="bp-section-label">Network · Carrier Costs</p><h1 className="bp-heading mt-1 text-3xl font-black">3PL Rate Cards</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#74827b]">Upload optional local-zone or international prices for each shipper. Carrier costs stay separate from customer delivery rates.</p></div><span className="grid size-12 place-items-center rounded-2xl bg-[#e8f6ee] text-[#13734b]"><BadgeDollarSign className="size-6" /></span></header>
    {shipperRows.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shipperRows.map((shipper) => {
      const rateCards = byShipper.get(shipper.id) ?? [];
      const active = rateCards.filter((card) => card.is_active);
      const postalCount = active.reduce((sum, card) => sum + Number(card.postal_mapping_count || 0), 0);
      return <Link key={shipper.id} href={`/shippers/${shipper.id}/carrier-rates`} className="bp-panel group block p-5 transition hover:-translate-y-0.5 hover:border-[#b8d7c6] hover:shadow-md">
        <div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f0f7f3] text-[#13734b]"><Building2 className="size-5" /></span><ArrowUpRight className="size-4 text-[#a3aea8] transition group-hover:text-[#13734b]" /></div>
        <h2 className="mt-4 truncate text-base font-black text-[#26372f]">{names.get(shipper.id) || shipper.full_name || "Shipper"}</h2>
        <p className="mt-1 truncate text-xs text-[#87938d]">{shipper.email}</p>
        <div className="mt-5 flex items-center justify-between border-t border-[#edf1ef] pt-4 text-xs"><span className="font-semibold text-[#617169]">{active.length} active rate card{active.length === 1 ? "" : "s"}</span><span className="inline-flex items-center gap-1 font-bold text-[#13734b]"><MapPinned className="size-3.5" />{postalCount.toLocaleString()} postal zones</span></div>
        {active.length ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#74827b]">{active.map((card) => `${Array.isArray(card.third_party_carriers) ? card.third_party_carriers[0]?.name : card.third_party_carriers?.name || "3PL"} · ${card.country_code} · ${card.currency}`).join("  /  ")}</p> : <p className="mt-3 text-xs text-[#87938d]">No carrier rates yet · Upload optional rate cards</p>}
      </Link>;
    })}</div> : <section className="bp-panel p-10 text-center"><Building2 className="mx-auto size-9 text-[#a5b0aa]" /><p className="mt-3 text-sm font-bold text-[#53645c]">No active shippers</p><p className="mt-1 text-xs text-[#87938d]">Add a shipper first, then upload its optional 3PL rates.</p></section>}
  </div>;
}
