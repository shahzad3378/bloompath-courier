import { DashboardUI } from "@/components/dashboard-ui";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import type { Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireProfile(internalRoles);
  const now = new Date();
  const dubaiNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const startOfDubaiDayUtc = new Date(Date.UTC(
    dubaiNow.getUTCFullYear(),
    dubaiNow.getUTCMonth(),
    dubaiNow.getUTCDate(),
  ) - 4 * 60 * 60 * 1000).toISOString();
  const supabase = await createClient();
  const [booked, outForDelivery, delivered, undelivered, returns, cod, recent] = await Promise.all([
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("booked_at", startOfDubaiDayUtc),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "out_for_delivery"),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "delivered").gte("delivered_at", startOfDubaiDayUtc),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "undelivered"),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "return_initiated"),
    supabase.from("shipments").select("cod_amount").is("deleted_at", null).eq("status", "delivered").gte("delivered_at", startOfDubaiDayUtc),
    supabase.from("shipments").select("id, tracking_number, consignee_name, consignee_city, cod_amount, status, booked_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
  ]);

  return <DashboardUI name={profile.full_name} stats={{
    booked: booked.count ?? 0,
    outForDelivery: outForDelivery.count ?? 0,
    delivered: delivered.count ?? 0,
    undelivered: undelivered.count ?? 0,
    returns: returns.count ?? 0,
    codCollected: (cod.data ?? []).reduce((sum, row) => sum + Number(row.cod_amount), 0),
  }} recent={(recent.data ?? []) as Pick<Shipment, "id" | "tracking_number" | "consignee_name" | "consignee_city" | "cod_amount" | "status" | "booked_at">[]} />;
}
