import { notFound } from "next/navigation";
import { AwbPrintSheet } from "@/components/awb-print-sheet";
import { PrintControls } from "@/components/print-controls";
import { requireProfile } from "@/lib/auth";
import { shipmentPieceCount, type Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print AWB" };

export default async function PrintAwbPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const requestedFormat = (await searchParams).format;
  const format = requestedFormat === "a4" ? "a4" : "4x6";
  if (!/^\d+$/.test(id)) notFound();

  const supabase = await createClient();
  const [{ data }, { data: settings }, { data: primaryCountry }] = await Promise.all([
    supabase.from("shipments").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    profile.organization_id
      ? supabase.from("organization_settings").select("display_name, awb_brand_name, logo_url, city, currency").eq("organization_id", profile.organization_id).maybeSingle()
      : Promise.resolve({ data: null }),
    profile.organization_id
      ? supabase.from("organization_countries").select("country_code").eq("organization_id", profile.organization_id).eq("is_primary", true).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!data) notFound();
  const shipment = data as Shipment;
  const branding = {
    name: settings?.awb_brand_name || settings?.display_name || "BloomPath Courier",
    logoUrl: settings?.logo_url || null,
    location: settings?.city || primaryCountry?.country_code || shipment.consignee_country_code || "Operations",
    currency: settings?.currency || shipment.currency || "AED",
  };

  const pieceCount = shipmentPieceCount(shipment.pieces);

  return (
    <main className="min-h-screen bg-[#eef2f0] px-3 py-5 text-black print:bg-white print:p-0">
      <PrintControls shipmentId={shipment.id} count={pieceCount} />
      <div className="awb-bulk-stack">
        {Array.from({ length: pieceCount }, (_, index) => (
          <div key={index} className="awb-bulk-item">
            <AwbPrintSheet shipment={shipment} format={format} branding={branding} pieceNumber={index + 1} pieceCount={pieceCount} />
          </div>
        ))}
      </div>
    </main>
  );
}
