import { notFound } from "next/navigation";
import { AwbPrintSheet } from "@/components/awb-print-sheet";
import { BulkPrintControls } from "@/components/bulk-print-controls";
import { requireProfile } from "@/lib/auth";
import { shipmentPieceCount, type Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Bulk Print AWBs" };

export default async function BulkPrintAwbsPage({ searchParams }: { searchParams: Promise<{ ids?: string; format?: string }> }) {
  const profile = await requireProfile();
  const params = await searchParams;
  const format = params.format === "a4" ? "a4" : "4x6";
  const ids = Array.from(new Set(String(params.ids ?? "").split(","))).filter((id) => /^\d+$/.test(id)).slice(0, 500);
  if (ids.length === 0) notFound();

  const supabase = await createClient();
  const [{ data: settings }, { data: primaryCountry }] = await Promise.all([
    profile.organization_id
      ? supabase.from("organization_settings").select("display_name,awb_brand_name,logo_url,city,currency").eq("organization_id", profile.organization_id).maybeSingle()
      : Promise.resolve({ data: null }),
    profile.organization_id
      ? supabase.from("organization_countries").select("country_code").eq("organization_id", profile.organization_id).eq("is_primary", true).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const fetched: Shipment[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await supabase.from("shipments").select("*").is("deleted_at", null).in("id", ids.slice(index, index + 100));
    if (error) notFound();
    fetched.push(...((data ?? []) as Shipment[]));
  }

  const byId = new Map(fetched.map((shipment) => [String(shipment.id), shipment]));
  const shipments = ids.map((id) => byId.get(id)).filter((shipment): shipment is Shipment => Boolean(shipment));
  if (shipments.length === 0) notFound();

  const packageLabels = shipments.flatMap((shipment) => {
    const pieceCount = shipmentPieceCount(shipment.pieces);
    return Array.from({ length: pieceCount }, (_, index) => ({
      shipment,
      pieceNumber: index + 1,
      pieceCount,
    }));
  });

  const branding = {
    name: settings?.awb_brand_name || settings?.display_name || "BloomPath Courier",
    logoUrl: settings?.logo_url || null,
    location: settings?.city || primaryCountry?.country_code || shipments[0]?.consignee_country_code || "Operations",
    currency: settings?.currency || shipments[0]?.currency || "AED",
  };

  return (
    <main className="min-h-screen bg-[#eef2f0] px-3 py-5 text-black print:bg-white print:p-0">
      <BulkPrintControls count={packageLabels.length} />
      <div className="awb-bulk-stack">
        {packageLabels.map(({ shipment, pieceNumber, pieceCount }, index) => <div key={`${shipment.id}-${pieceNumber}-${index}`} className="awb-bulk-item"><AwbPrintSheet shipment={shipment} format={format} branding={branding} pieceNumber={pieceNumber} pieceCount={pieceCount} /></div>)}
      </div>
    </main>
  );
}
