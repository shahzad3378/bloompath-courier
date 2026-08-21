"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function scanDriverAwbAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["driver"]);
  const awb = String(formData.get("tracking_number") ?? "").trim();
  if (!awb) redirect("/driver?scan_error=missing");

  const supabase = await createClient();
  const { data } = await supabase
    .from("dispatch_run_items")
    .select("id, completed_at, shipments!inner(tracking_number), dispatch_runs!inner(driver_id,status)")
    .eq("shipments.tracking_number", awb)
    .eq("dispatch_runs.driver_id", profile.id)
    .eq("dispatch_runs.status", "handed_over")
    .maybeSingle();

  if (!data) redirect(`/driver?scan_error=not_assigned&awb=${encodeURIComponent(awb)}`);
  if (data.completed_at) redirect(`/driver?scan_error=completed&awb=${encodeURIComponent(awb)}`);
  redirect(`/driver/deliveries/${data.id}`);
}
