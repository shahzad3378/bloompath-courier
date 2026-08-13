import { notFound } from "next/navigation";
import { AwbPrintSheet } from "@/components/awb-print-sheet";
import { BulkPrintControls } from "@/components/bulk-print-controls";
import { requireProfile } from "@/lib/auth";
import { type Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Bulk Print AWBs" };

export default async function BulkPrintAwbsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; format?: string }>;
}) {
  await requireProfile();
  const params = await searchParams;
  const format = params.format === "a4" ? "a4" : "4x6";
  const ids = Array.from(new Set(String(params.ids ?? "").split(",")))
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 500);
  if (ids.length === 0) notFound();

  const supabase = await createClient();
  const fetched: Shipment[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await supabase
      .from("shipments")
      .select("*")
      .in("id", ids.slice(index, index + 100));
    if (error) notFound();
    fetched.push(...((data ?? []) as Shipment[]));
  }

  const byId = new Map(fetched.map((shipment) => [String(shipment.id), shipment]));
  const shipments = ids.map((id) => byId.get(id)).filter((shipment): shipment is Shipment => Boolean(shipment));
  if (shipments.length === 0) notFound();

  return (
    <main className="min-h-screen bg-[#eef2f0] px-3 py-5 text-black print:bg-white print:p-0">
      <BulkPrintControls count={shipments.length} />
      <div className="awb-bulk-stack">
        {shipments.map((shipment) => <div key={shipment.id} className="awb-bulk-item"><AwbPrintSheet shipment={shipment} format={format} /></div>)}
      </div>
    </main>
  );
}
