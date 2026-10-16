import Link from "next/link";
import { ArrowLeft, BadgeDollarSign, MapPinned, PackageCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { CarrierRateUploadForm } from "@/components/carrier-rate-upload-form";
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
  third_party_carriers: { name: string; code: string } | { name: string; code: string }[] | null;
};

function carrierOf(card: RateCard) { return Array.isArray(card.third_party_carriers) ? card.third_party_carriers[0] : card.third_party_carriers; }

export default async function ShipperCarrierRatesPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(rateRoles);
  const { id } = await params;
  if (!profile.organization_id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();
  const [{ data: shipper, error: shipperError }, { data: cards, error: cardsError }] = await Promise.all([
    db.from("profiles").select("id,full_name,email").eq("id", id).eq("organization_id", profile.organization_id).eq("role", "shipper").maybeSingle(),
    db.from("carrier_rate_cards").select("id,card_name,country_code,currency,effective_from,created_at,is_active,import_status,grid_row_count,postal_mapping_count,source_filename,third_party_carriers(name,code)").eq("organization_id", profile.organization_id).eq("shipper_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (shipperError || cardsError) throw new Error("Carrier rate cards could not be loaded.");
  if (!shipper) notFound();
  const rateCards = (cards ?? []) as unknown as RateCard[];
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
          return <article key={card.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]"><BadgeDollarSign className="size-5" /></span>
              <div className="min-w-0"><h3 className="truncate font-black text-[#26372f]">{card.card_name}</h3><p className="mt-1 text-xs text-[#74827b]">{carrier?.name || "3PL"} · {card.country_code} · {card.currency} · effective {card.effective_from}</p><p className="mt-1 truncate text-[11px] text-[#9aa69f]">Source: {card.source_filename}</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6f66]"><PackageCheck className="size-4" />{card.grid_row_count.toLocaleString()} rate rows</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6f66]"><MapPinned className="size-4" />{card.postal_mapping_count.toLocaleString()} postal zones</span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${card.is_active && card.import_status === "active" ? "bg-[#e8f7ef] text-[#13734b]" : "bg-[#f1f3f2] text-[#87938d]"}`}>{card.is_active && card.import_status === "active" ? "Active" : card.import_status === "failed" ? "Failed" : "Historical"}</span>
            </div>
          </article>;
        })}</div> : <div className="px-6 py-12 text-center"><MapPinned className="mx-auto size-9 text-[#a5b0aa]" /><p className="mt-3 text-sm font-bold text-[#53645c]">No 3PL rate cards yet</p><p className="mt-1 text-xs text-[#87938d]">Upload a carrier workbook above. This does not change the rates charged to the shipper.</p></div>}
      </section>
    </div>
  </ShipperWorkspace>;
}
