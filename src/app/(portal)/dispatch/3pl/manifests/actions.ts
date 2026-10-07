"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { manifestRoles, parseManifestAwbs, validManifestId } from "@/lib/three-pl-manifests";
import { createClient } from "@/lib/supabase/server";
export type ManifestState = { status: "idle" | "error" | "success"; message: string };
function refresh(id: string) {
  for (const path of ["/dispatch", "/dispatch/3pl", "/dispatch/3pl/manifests", `/dispatch/3pl/manifests/${id}`, `/print/3pl-manifests/${id}`, "/warehouse", "/shipments", "/shipper", "/dashboard"]) revalidatePath(path);
  revalidatePath("/shipments/[id]", "page");
}
function safeError(message: string) {
  return message.startsWith("3PL manifest: ") ? message.slice(14) : "Manifest could not be saved. Retry the same request or refresh to check its status.";
}
export async function createThreePLManifestAction(_state: ManifestState, formData: FormData): Promise<ManifestState> {
  const profile = await requireProfile(manifestRoles);
  if (!profile.organization_id) return { status: "error", message: "Organization is not configured." };
  const id = String(formData.get("request_id") ?? "");
  const carrierId = String(formData.get("carrier_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const awbs = parseManifestAwbs(formData);
  if (!validManifestId(id) || !validManifestId(carrierId)) return { status: "error", message: "Select a delivery partner. Refresh if the request expired." };
  if (!awbs.length || awbs.length > 500 || awbs.some((a) => !/^[A-Z0-9][A-Z0-9_-]{2,99}$/.test(a))) return { status: "error", message: "Select or scan 1 to 500 valid shipment AWBs." };
  if (notes.length > 1000) return { status: "error", message: "Keep notes within 1000 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manage_three_pl_manifest", { p_operation: "create", p_id: id, p_carrier_id: carrierId, p_awbs: awbs, p_receiver: null, p_notes: notes || null });
  if (error || data !== id) return { status: "error", message: error ? safeError(error.message) : "Manifest could not be saved. Please retry." };
  refresh(id);
  redirect(`/dispatch/3pl/manifests/${id}?created=1`);
}
export async function changeThreePLManifestAction(_state: ManifestState, formData: FormData): Promise<ManifestState> {
  const profile = await requireProfile(manifestRoles);
  if (!profile.organization_id) return { status: "error", message: "Organization is not configured." };
  const id = String(formData.get("manifest_id") ?? "");
  const operation = String(formData.get("operation") ?? "");
  const receiver = String(formData.get("receiver_name") ?? "").trim();
  if (!validManifestId(id) || !["confirm", "cancel"].includes(operation)) return { status: "error", message: "Invalid manifest action." };
  if (formData.get("acknowledge") !== "yes") return { status: "error", message: operation === "confirm" ? "Confirm that all listed parcels have physically been handed over." : "Confirm cancellation of this draft manifest." };
  if (operation === "confirm" && (receiver.length < 2 || receiver.length > 120)) return { status: "error", message: "Enter the receiver name (2 to 120 characters)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manage_three_pl_manifest", { p_operation: operation, p_id: id, p_carrier_id: null, p_awbs: null, p_receiver: receiver || null, p_notes: null });
  if (error || data !== id) return { status: "error", message: error ? safeError(error.message) : "Manifest could not be saved. Please retry." };
  refresh(id);
  return { status: "success", message: operation === "confirm" ? "Handover confirmed. Customer tracking is now In transit." : "Draft cancelled. The parcels are available for a new manifest." };
}
