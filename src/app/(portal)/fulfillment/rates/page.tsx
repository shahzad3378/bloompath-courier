import { BadgeDollarSign, MapPinned, PackageCheck } from "lucide-react";
import { CarrierRateUploadForm } from "@/components/carrier-rate-upload-form";
import { saveFulfillmentGroupChargeAction } from "./actions";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Fulfillment 3PL Rates" };
const roles = ["super_admin", "operations_admin", "finance_staff"] as const;
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
  third_party_carriers: { name: string } | { name: string }[] | null;
};
type GroupCharge = { group_code: string; group_name: string; order_charge: number; currency: string };

export default async function FulfillmentRatesPage() {
  const profile = await requireProfile(roles);
  if (!profile.organization_id) return null;
  const db = await createClient();
  const [{ data, error }, { data: groups, error: groupError }] = await Promise.all([
    db.from("carrier_rate_cards")
      .select("id,card_name,country_code,currency,effective_from,created_at,is_active,import_status,grid_row_count,postal_mapping_count,source_filename,third_party_carriers(name)")
      .eq("organization_id", profile.organization_id).is("shipper_id", null)
      .order("created_at", { ascending: false }).limit(100),
    db.from("fulfillment_group_charges").select("group_code,group_name,order_charge,currency")
      .eq("organization_id", profile.organization_id).order("group_name"),
  ]);
  if (error) throw new Error("Fulfillment carrier rates could not be loaded.");
  if (groupError) throw new Error("Fulfillment group charges could not be loaded.");
  const cards = (data ?? []) as unknown as RateCard[];
  const groupCharges = (groups ?? []) as GroupCharge[];
  return <div className="bp-page mx-auto max-w-6xl space-y-6">
    <header>
      <p className="bp-section-label">Fulfillment · 3PL costs</p>
      <h1 className="bp-heading mt-1 text-3xl font-black">Fulfillment Rates</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#74827b]">Maintain what each delivery company charges by destination, service, weight and zone. Keep separate cards for each carrier, country and currency. These are internal carrier costs, separate from customer charges.</p>
    </header>
    <section className="bp-panel space-y-4 p-5">
      <div><p className="bp-section-label">Fulfillment handling charges</p><h2 className="mt-1 text-lg font-black text-[#26372f]">Product group fees · charged once per order</h2><p className="mt-1 text-xs leading-5 text-[#87938d]">The selected product group sets one charge for the complete order. If an order contains products from different groups, the highest configured group charge is used once. Currency: AED.</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        {groupCharges.map(group=><form key={group.group_code} action={saveFulfillmentGroupChargeAction} className="grid items-end gap-3 rounded-xl border border-[#e7edf3] p-4 sm:grid-cols-[1fr_150px_auto]">
          <input type="hidden" name="group_code" value={group.group_code}/>
          <label className="text-xs font-bold text-[#53645c]">{group.group_code}<input name="group_name" defaultValue={group.group_name} required maxLength={80} className="bp-input mt-2"/></label>
          <label className="text-xs font-bold text-[#53645c]">AED per order<input name="order_charge" type="number" min="0" step="0.01" defaultValue={Number(group.order_charge)} required className="bp-input mt-2"/></label>
          <button className="bp-button-secondary">Save</button>
        </form>)}
      </div>
      <form action={saveFulfillmentGroupChargeAction} className="grid gap-3 border-t border-[#edf1ef] pt-4 sm:grid-cols-[1fr_180px_auto]">
        <label className="text-xs font-bold text-[#53645c]">Add product group<input name="group_name" placeholder="e.g. General Item" required maxLength={80} className="bp-input mt-2"/></label>
        <label className="text-xs font-bold text-[#53645c]">AED per order<input name="order_charge" type="number" min="0" step="0.01" placeholder="5.00" required className="bp-input mt-2"/></label>
        <button className="bp-button-primary">Add group</button>
      </form>
    </section>
    <CarrierRateUploadForm />
    <section className="bp-panel overflow-hidden">
      <div className="border-b border-[#edf1ef] px-5 py-4 sm:px-6">
        <p className="bp-section-label">Organization-wide rates</p>
        <h2 className="mt-1 text-lg font-black text-[#26372f]">3PL rate cards</h2>
        <p className="mt-1 text-xs text-[#87938d]">For remote areas, add a zone such as REMOTE with its own prices. Send the remote-area list and we can add the matching area or postal-code mapping for your 3PL.</p>
      </div>
      {cards.length ? <div className="divide-y divide-[#edf1ef]">{cards.map((card) => {
        const carrier = Array.isArray(card.third_party_carriers) ? card.third_party_carriers[0] : card.third_party_carriers;
        const active = card.is_active && card.import_status === "active";
        return <article key={card.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#174ea6]"><BadgeDollarSign className="size-5" /></span>
            <div className="min-w-0">
              <h3 className="truncate font-black text-[#26372f]">{card.card_name}</h3>
              <p className="mt-1 text-xs text-[#74827b]">{carrier?.name || "3PL"} · {card.country_code} · {card.currency} · effective {card.effective_from}</p>
              <p className="mt-1 truncate text-[11px] text-[#9aa69f]">Source: {card.source_filename}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6f66]"><PackageCheck className="size-4" />{card.grid_row_count.toLocaleString()} rate rows</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6f66]"><MapPinned className="size-4" />{card.postal_mapping_count.toLocaleString()} postal mappings</span>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${active ? "bg-[#e8f7ef] text-[#13734b]" : "bg-[#f1f3f2] text-[#87938d]"}`}>{active ? "Active" : "Historical"}</span>
          </div>
        </article>;
      })}</div> : <div className="px-6 py-12 text-center"><MapPinned className="mx-auto size-9 text-[#a5b0aa]" /><p className="mt-3 text-sm font-bold text-[#53645c]">No fulfillment rates yet</p><p className="mt-1 text-xs text-[#87938d]">Upload a carrier rate workbook above to add zone and weight prices.</p></div>}
    </section>
  </div>;
}
