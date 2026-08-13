import { notFound } from "next/navigation";
import { AwbPrintSheet } from "@/components/awb-print-sheet";
import { PrintControls } from "@/components/print-controls";
import { requireProfile } from "@/lib/auth";
import { type Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print AWB" };

export default async function PrintAwbPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const requestedFormat = (await searchParams).format;
  const format = requestedFormat === "a4" ? "a4" : "4x6";
  if (!/^\d+$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("shipments").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  const shipment = data as Shipment;

  return (
    <main className="min-h-screen bg-[#eef2f0] px-3 py-5 text-black print:bg-white print:p-0">
      <PrintControls shipmentId={shipment.id} />
      <AwbPrintSheet shipment={shipment} format={format} />
    </main>
  );
}
