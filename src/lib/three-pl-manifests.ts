import { getThreePLLoadNumbers } from "@/lib/three-pl-load-numbers";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const manifestRoles = ["super_admin", "operations_admin", "warehouse_staff", "dispatcher"] as const;
export const manifestStatusLabels = { draft: "Draft", handed_over: "Handed over", cancelled: "Cancelled" } as const;
export type Manifest = {
  id: string; manifest_number: string; status: keyof typeof manifestStatusLabels;
  carrier_name: string; shipment_count: number; notes: string | null;
  created_at: string; handed_over_at: string | null; receiver_name: string | null;
  cancelled_at: string | null; created_by: string; handed_over_by: string | null;
};
export type ManifestItem = {
  shipment_id: number; tracking_number: string; consignee_name: string;
  consignee_city: string; pieces: number; partner_tracking_number: string | null; load_number: string | null;
};
export function validManifestId(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id); }
export function parseManifestAwbs(formData: FormData) {
  return [...new Set([...formData.getAll("tracking_number").map(String), ...String(formData.get("awbs") ?? "").split(/[\s,;]+/)]
    .map((s) => s.trim().toUpperCase()).filter(Boolean))];
}
export async function getManifest(id: string) {
  const profile = await requireProfile(manifestRoles);
  if (!profile.organization_id || !validManifestId(id)) notFound();
  const supabase = await createClient();
  const { data: manifest, error } = await supabase.from("third_party_manifests").select("*")
    .eq("organization_id", profile.organization_id).eq("id", id).maybeSingle();
  if (error) throw new Error("Manifest could not be loaded. Please retry.");
  if (!manifest) notFound();
  const { data: items, error: itemError } = await supabase.from("third_party_manifest_items")
    .select("shipment_id,tracking_number,consignee_name,consignee_city,pieces,partner_tracking_number")
    .eq("organization_id", profile.organization_id).eq("manifest_id", id).order("tracking_number");
  if (itemError) throw new Error("Manifest parcels could not be loaded. Please retry.");
  const loads = await getThreePLLoadNumbers(profile.organization_id, items ?? []);
  const parcels: ManifestItem[] = (items ?? []).map((item) => ({ ...item, load_number: loads.get(item.shipment_id) || null }));
  return { manifest: manifest as Manifest, items: parcels, profile, supabase };
}
