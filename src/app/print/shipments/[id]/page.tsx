import { notFound } from "next/navigation";
import { AwbPrintSheet } from "@/components/awb-print-sheet";
import { AutoPrintLabel } from "@/components/auto-print-label";
import { PrintControls } from "@/components/print-controls";
import { requireProfile } from "@/lib/auth";
import { shipmentPieceCount, type Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print AWB" };

export default async function PrintAwbPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string; piece?: string; embed?: string; autoPrint?: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const query = await searchParams;
  const requestedFormat = query.format;
  const embedded = query.embed === "1";
  const autoPrint = query.autoPrint === "1";
  const format = requestedFormat === "a4" ? "a4" : "4x6";
  if (!/^\d+$/.test(id)) notFound();

  const supabase = await createClient();
  const shipmentQuery = supabase.from("shipments").select("*").eq("id", id).is("deleted_at", null);
  const scopedShipmentQuery = profile.organization_id
    ? shipmentQuery.eq("organization_id", profile.organization_id)
    : shipmentQuery;
  const [{ data }, { data: settings }, { data: primaryCountry }] = await Promise.all([
    scopedShipmentQuery.maybeSingle(),
    profile.organization_id
      ? supabase.from("organization_settings").select("display_name, awb_brand_name, legal_name, logo_url, city, currency").eq("organization_id", profile.organization_id).maybeSingle()
      : Promise.resolve({ data: null }),
    profile.organization_id
      ? supabase.from("organization_countries").select("country_code").eq("organization_id", profile.organization_id).eq("is_primary", true).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!data) notFound();
  const shipment = data as Shipment;
  const branding = {
    name: settings?.awb_brand_name || settings?.display_name || "BloomPath Courier",
    legalName: settings?.legal_name || null,
    logoUrl: settings?.logo_url || null,
    location: settings?.city || primaryCountry?.country_code || shipment.consignee_country_code || "Operations",
    currency: settings?.currency || shipment.currency || "AED",
  };

  const pieceCount = shipmentPieceCount(shipment.pieces);
  const selectedPiece = /^\d+$/.test(String(query.piece ?? "")) ? Number(query.piece) : null;
  if (query.piece !== undefined && selectedPiece === null) notFound();
  if (selectedPiece !== null && (selectedPiece < 1 || selectedPiece > pieceCount)) notFound();
  const piecesToPrint = selectedPiece === null
    ? Array.from({ length: pieceCount }, (_, index) => index + 1)
    : [selectedPiece];

  return (
    <main className={embedded || autoPrint ? "awb-embed w-fit bg-white p-0 text-black" : "min-h-screen bg-[#eef2f0] px-3 py-5 text-black print:bg-white print:p-0"}>
      {autoPrint ? <AutoPrintLabel /> : null}
      {!embedded && !autoPrint ? <PrintControls shipmentId={shipment.id} count={piecesToPrint.length} /> : null}
      <div className={embedded ? "" : "awb-bulk-stack"}>
        {piecesToPrint.map((pieceNumber) => (
          <div key={pieceNumber} className="awb-bulk-item">
            <AwbPrintSheet shipment={shipment} format={format} branding={branding} pieceNumber={pieceNumber} pieceCount={pieceCount} />
          </div>
        ))}
      </div>
    </main>
  );
}
