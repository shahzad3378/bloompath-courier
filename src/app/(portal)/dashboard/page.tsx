import { DashboardUI } from "@/components/dashboard-ui";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import type { Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";
type DashboardDriverLocation = { driver_id: string; is_online: boolean; recorded_at: string; driver: { full_name: string; email: string } | null };

function dubaiDayStartUtc(date: Date) { const dubai = new Date(date.getTime() + 4 * 60 * 60 * 1000); return new Date(Date.UTC(dubai.getUTCFullYear(), dubai.getUTCMonth(), dubai.getUTCDate()) - 4 * 60 * 60 * 1000); }
function addDays(date: Date, days: number) { return new Date(date.getTime() + days * 86400000); }
function parseDubaiDate(value?: string) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const [year, month, day] = value.split("-").map(Number); return new Date(Date.UTC(year, month - 1, day) - 4 * 60 * 60 * 1000); }
function formatRangeLabel(start: Date, endExclusive: Date) { const formatter = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric" }); const endInclusive = new Date(endExclusive.getTime() - 1); const startLabel = formatter.format(start); const endLabel = formatter.format(endInclusive); return startLabel === endLabel ? `${startLabel} · Operations` : `${startLabel} – ${endLabel} · Operations`; }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const profile = await requireProfile(internalRoles);
  const params = await searchParams;
  const now = new Date(); const todayStart = dubaiDayStartUtc(now); const requestedRange = params.range ?? "today";
  const range: RangeKey = ["today", "yesterday", "7d", "30d", "month", "custom"].includes(requestedRange) ? requestedRange as RangeKey : "today";
  let start = todayStart; let endExclusive = addDays(todayStart, 1);
  if (range === "yesterday") { start = addDays(todayStart, -1); endExclusive = todayStart; }
  else if (range === "7d") start = addDays(todayStart, -6);
  else if (range === "30d") start = addDays(todayStart, -29);
  else if (range === "month") { const dubai = new Date(now.getTime() + 4 * 60 * 60 * 1000); start = new Date(Date.UTC(dubai.getUTCFullYear(), dubai.getUTCMonth(), 1) - 4 * 60 * 60 * 1000); }
  else if (range === "custom") { const customFrom = parseDubaiDate(params.from); const customTo = parseDubaiDate(params.to); if (customFrom && customTo && customFrom <= customTo) { start = customFrom; endExclusive = addDays(customTo, 1); } }
  const startIso = start.toISOString(); const endIso = endExclusive.toISOString(); const supabase = await createClient();
  const [{ data: organizationSettings }, booked, inProgress, warehouse, delivered, undelivered, returns, liveOutForDelivery, liveWarehouse, liveUndelivered, liveReturns, cod, recent, movement, driverLocations] = await Promise.all([
    supabase.from("organization_settings").select("currency").eq("organization_id", profile.organization_id).maybeSingle(),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("booked_at", startIso).lt("booked_at", endIso),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["booked","ready_for_pickup","picked_up","at_warehouse","out_for_delivery"]).gte("booked_at", startIso).lt("booked_at", endIso),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "at_warehouse").gte("booked_at", startIso).lt("booked_at", endIso),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "delivered").gte("booked_at", startIso).lt("booked_at", endIso),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "undelivered").gte("booked_at", startIso).lt("booked_at", endIso),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["return_initiated","returned_to_shipper","cancelled"]).gte("booked_at", startIso).lt("booked_at", endIso),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "out_for_delivery"),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "at_warehouse"),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "undelivered"),
    supabase.from("shipments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "return_initiated"),
    supabase.from("shipments").select("cod_amount").is("deleted_at", null).eq("status", "delivered").gte("delivered_at", startIso).lt("delivered_at", endIso),
    supabase.from("shipments").select("id, tracking_number, consignee_name, consignee_city, cod_amount, currency, status, booked_at").is("deleted_at", null).gte("booked_at", startIso).lt("booked_at", endIso).order("created_at", { ascending: false }).limit(5),
    supabase.from("shipments").select("booked_at").is("deleted_at", null).gte("booked_at", startIso).lt("booked_at", endIso).order("booked_at", { ascending: true }),
    supabase.from("driver_locations").select(`driver_id,is_online,recorded_at,driver:profiles!driver_locations_driver_id_fkey(full_name,email)`).eq("organization_id", profile.organization_id).order("recorded_at", { ascending: false }).limit(6),
  ]);
  const configuredCurrency = String(organizationSettings?.currency ?? "").trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(configuredCurrency) ? configuredCurrency : "USD";
  const dayCount = Math.max(1, Math.ceil((endExclusive.getTime() - start.getTime()) / 86400000)); const movementRows = movement.data ?? []; const dashboardDrivers = (driverLocations.data ?? []) as unknown as DashboardDriverLocation[];
  const movementBuckets = Array.from({ length: dayCount }, (_, index) => { const dayStart = addDays(start, index); const nextDay = addDays(dayStart, 1); const label = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", weekday: dayCount <= 10 ? "short" : undefined, day: dayCount > 10 ? "2-digit" : undefined, month: dayCount > 10 ? "short" : undefined }).format(dayStart); const count = movementRows.filter(row => { const bookedAt = new Date(row.booked_at); return bookedAt >= dayStart && bookedAt < nextDay; }).length; return { label, count }; });
  return <DashboardUI name={profile.full_name} currency={currency} stats={{ booked: booked.count ?? 0, inProgress: inProgress.count ?? 0, warehouse: warehouse.count ?? 0, delivered: delivered.count ?? 0, undelivered: undelivered.count ?? 0, returns: returns.count ?? 0, liveOutForDelivery: liveOutForDelivery.count ?? 0, liveWarehouse: liveWarehouse.count ?? 0, liveUndelivered: liveUndelivered.count ?? 0, liveReturns: liveReturns.count ?? 0, codCollected: (cod.data ?? []).reduce((sum,row) => sum + Number(row.cod_amount), 0) }} recent={(recent.data ?? []) as Pick<Shipment,"id"|"tracking_number"|"consignee_name"|"consignee_city"|"cod_amount"|"currency"|"status"|"booked_at">[]} range={{ key: range, label: formatRangeLabel(start,endExclusive), from: params.from ?? "", to: params.to ?? "" }} movement={movementBuckets} drivers={dashboardDrivers.map(row => ({ driverId: row.driver_id, name: row.driver?.full_name || row.driver?.email || "Driver", isOnline: Boolean(row.is_online), recordedAt: row.recorded_at }))} />;
}
