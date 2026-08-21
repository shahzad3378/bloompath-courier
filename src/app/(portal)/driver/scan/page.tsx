import Link from "next/link";
import { ArrowLeft, Barcode } from "lucide-react";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Driver AWB Scan" };

export default async function DriverScanPage({
  searchParams,
}: {
  searchParams: Promise<{ awb?: string }>;
}) {
  const profile = await requireProfile(["driver"]);
  const { awb } = await searchParams;
  const tracking = String(awb ?? "").trim().toUpperCase();

  if (tracking) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("dispatch_run_items")
      .select("id, completed_at, shipments!inner(tracking_number), dispatch_runs!inner(driver_id,status)")
      .eq("shipments.tracking_number", tracking)
      .eq("dispatch_runs.driver_id", profile.id)
      .eq("dispatch_runs.status", "handed_over")
      .is("completed_at", null)
      .maybeSingle();

    if (data?.id) redirect(`/driver/deliveries/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/driver" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#587068]">
        <ArrowLeft className="size-4" /> Back to my route
      </Link>
      <section className="rounded-2xl border border-[#efcccc] bg-white p-6 text-center">
        <Barcode className="mx-auto size-9 text-[#a63e3e]" />
        <h1 className="mt-4 text-xl font-black text-[#26372f]">AWB not available on your active route</h1>
        <p className="mt-2 text-sm leading-6 text-[#7a8881]">
          {tracking || "This AWB"} is either assigned to another driver, already completed, or not on a handed-over route.
        </p>
      </section>
    </div>
  );
}
