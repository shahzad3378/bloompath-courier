"use server";

import { readSheet } from "read-excel-file/node";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type ManifestActionState = { status: "idle" | "success" | "error"; message: string };

const pickupRoles = ["super_admin", "operations_admin", "warehouse_staff", "dispatcher"] as const;
const warehouseRoles = ["super_admin", "operations_admin", "warehouse_staff"] as const;

function validId(value: FormDataEntryValue | null) {
  const id = String(value ?? "");
  return /^\d+$/.test(id) ? id : null;
}

function cleanText(value: FormDataEntryValue | null, min: number, max: number) {
  const text = String(value ?? "").trim();
  return text.length >= min && text.length <= max ? text : null;
}

function workflowMessage(message: string | undefined, fallback: string) {
  const allowed = ["Add at least one AWB", "Every AWB must be active and booked", "Only authorized operations staff", "Select an active driver", "Only warehouse staff", "already been received", "must be picked up", "not available for warehouse receiving"];
  return message && allowed.some((part) => message.includes(part)) ? message : fallback;
}

function parseCsvFirstColumn(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.replace(/^"|"$/g, "").trim() ?? "")
    .filter(Boolean);
}

async function trackingNumbersFromFile(file: File) {
  if (!file.name || !file.size) throw new Error("Choose a non-empty file.");
  if (file.size > 20 * 1024 * 1024) throw new Error("File must be 20 MB or smaller.");
  const extension = file.name.toLowerCase().split(".").pop();
  let values: string[] = [];
  if (extension === "xlsx") {
    const rows = await readSheet(Buffer.from(await file.arrayBuffer()), 1);
    values = rows.flatMap((row) => row.map((cell) => String(cell ?? "").trim()));
  } else if (extension === "csv" || extension === "txt") {
    values = parseCsvFirstColumn(await file.text());
  } else {
    throw new Error("Use an .xlsx, .csv or .txt file.");
  }

  const tracking = Array.from(new Set(values
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value && value !== "TRACKING_NUMBER" && value !== "AWB" && value !== "TRACKING NO" && value.length <= 40)));
  if (!tracking.length) throw new Error("No AWB / tracking numbers were found in the file.");
  if (tracking.length > 5000) throw new Error("Upload no more than 5,000 AWBs at a time.");
  return tracking;
}

async function shipmentIdsForTracking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  trackingNumbers: string[],
  options?: { status?: string; shipperId?: string | null },
) {
  const rows: Array<{ id: number; tracking_number: string; status: string }> = [];
  for (let index = 0; index < trackingNumbers.length; index += 200) {
    let query = supabase
      .from("shipments")
      .select("id, tracking_number, status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("tracking_number", trackingNumbers.slice(index, index + 200));
    if (options?.status) query = query.eq("status", options.status);
    if (options?.shipperId) query = query.eq("shipper_id", options.shipperId);
    const { data } = await query;
    rows.push(...((data ?? []) as Array<{ id: number; tracking_number: string; status: string }>));
  }
  return rows;
}

export async function createPickupManifestAction(_previousState: ManifestActionState, formData: FormData): Promise<ManifestActionState> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  if (!profile.organization_id) return { status: "error", message: "Your account is not linked to an organization." };
  const shipperName = cleanText(formData.get("shipper_name"), 2, 120);
  if (!shipperName) return { status: "error", message: "Enter a shipper or pickup account name." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("pickup_manifests").insert({ organization_id: profile.organization_id, shipper_id: profile.role === "shipper" ? profile.id : null, shipper_name: shipperName, created_by: profile.id }).select("id").single();
  if (error || !data) return { status: "error", message: "Pickup manifest could not be created." };
  redirect(`/pickup-manifests/${data.id}`);
}

export async function addManifestShipmentAction(_previousState: ManifestActionState, formData: FormData): Promise<ManifestActionState> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const manifestId = validId(formData.get("manifest_id"));
  const trackingNumber = cleanText(formData.get("tracking_number"), 3, 40)?.toUpperCase();
  if (!manifestId || !trackingNumber) return { status: "error", message: "Scan or enter a valid AWB number." };
  const supabase = await createClient();
  const [{ data: manifest }, { data: shipment }] = await Promise.all([
    supabase.from("pickup_manifests").select("id, status").eq("id", manifestId).maybeSingle(),
    supabase.from("shipments").select("id, status").eq("organization_id", profile.organization_id).eq("tracking_number", trackingNumber).is("deleted_at", null).maybeSingle(),
  ]);
  if (!manifest || manifest.status !== "draft") return { status: "error", message: "This manifest is no longer open for scanning." };
  if (!shipment) return { status: "error", message: `AWB ${trackingNumber} was not found or is not accessible.` };
  if (shipment.status !== "booked") return { status: "error", message: `AWB ${trackingNumber} is ${String(shipment.status).replaceAll("_", " ")} and cannot be added.` };
  const { error } = await supabase.from("pickup_manifest_items").insert({ manifest_id: Number(manifestId), shipment_id: shipment.id, added_by: profile.id });
  if (error?.code === "23505") return { status: "error", message: `AWB ${trackingNumber} is already assigned to a pickup manifest.` };
  if (error) return { status: "error", message: `AWB ${trackingNumber} could not be added.` };
  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/pickup-manifests");
  return { status: "success", message: `AWB ${trackingNumber} added.` };
}

export async function bulkAddManifestShipmentsAction(_previousState: ManifestActionState, formData: FormData): Promise<ManifestActionState> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  if (!profile.organization_id) return { status: "error", message: "Organization is missing." };
  const manifestId = validId(formData.get("manifest_id"));
  const file = formData.get("file");
  if (!manifestId || !(file instanceof File)) return { status: "error", message: "Choose a manifest and AWB file." };

  let tracking: string[];
  try { tracking = await trackingNumbersFromFile(file); }
  catch (error) { return { status: "error", message: error instanceof Error ? error.message : "File could not be read." }; }

  const supabase = await createClient();
  const { data: manifest } = await supabase.from("pickup_manifests").select("id,status,shipper_id").eq("id", manifestId).eq("organization_id", profile.organization_id).maybeSingle();
  if (!manifest || manifest.status !== "draft") return { status: "error", message: "This manifest is not open for bulk adding." };

  const shipments = await shipmentIdsForTracking(supabase, profile.organization_id, tracking, { status: "booked", shipperId: manifest.shipper_id });
  const shipmentIds = shipments.map((row) => row.id);
  const assigned = new Set<number>();
  for (let index = 0; index < shipmentIds.length; index += 200) {
    const { data } = await supabase.from("pickup_manifest_items").select("shipment_id").in("shipment_id", shipmentIds.slice(index, index + 200));
    for (const row of data ?? []) assigned.add(Number(row.shipment_id));
  }
  const eligible = shipments.filter((row) => !assigned.has(row.id));

  let added = 0;
  for (let index = 0; index < eligible.length; index += 500) {
    const rows = eligible.slice(index, index + 500).map((shipment) => ({ manifest_id: Number(manifestId), shipment_id: shipment.id, added_by: profile.id }));
    const { data, error } = await supabase.from("pickup_manifest_items").insert(rows).select("id");
    if (error) return { status: "error", message: `Bulk add stopped after ${added} AWBs. ${error.message}` };
    added += data?.length ?? 0;
  }

  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/pickup-manifests");
  return { status: "success", message: `${added} AWBs added to manifest. ${tracking.length - added} skipped because they were not Booked, not found, or already assigned.` };
}

export async function removeManifestShipmentAction(formData: FormData): Promise<void> {
  await requireProfile([...internalRoles, "shipper"]);
  const manifestId = validId(formData.get("manifest_id"));
  const itemId = validId(formData.get("item_id"));
  if (!manifestId || !itemId) return;
  const supabase = await createClient();
  await supabase.from("pickup_manifest_items").delete().eq("id", itemId).eq("manifest_id", manifestId);
  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/pickup-manifests");
}

export async function submitPickupManifestAction(formData: FormData): Promise<void> {
  await requireProfile([...internalRoles, "shipper"]);
  const manifestId = validId(formData.get("manifest_id"));
  if (!manifestId) redirect("/pickup-manifests?error=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.from("pickup_manifests").update({ status: "ready_for_pickup" }).eq("id", manifestId).eq("status", "draft").select("id").maybeSingle();
  if (error || !data) redirect(`/pickup-manifests/${manifestId}?error=submit`);
  revalidatePath("/pickup-manifests");
  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/shipments");
  redirect(`/pickup-manifests/${manifestId}?submitted=1`);
}

export async function markManifestPickedUpAction(_previousState: ManifestActionState, formData: FormData): Promise<ManifestActionState> {
  await requireProfile(pickupRoles);
  const manifestId = validId(formData.get("manifest_id"));
  const driverId = String(formData.get("assigned_driver_id") ?? "").trim();
  if (!manifestId || (driverId && !/^[0-9a-f-]{36}$/i.test(driverId))) return { status: "error", message: "Pickup details are invalid." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("pickup_manifests").update({ status: "picked_up", assigned_driver_id: driverId || null }).eq("id", manifestId).eq("status", "ready_for_pickup").select("id").maybeSingle();
  if (error || !data) return { status: "error", message: workflowMessage(error?.message, "Manifest could not be marked as picked up.") };
  revalidatePath("/pickup-manifests");
  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  return { status: "success", message: "Pickup confirmed. Manifest is ready for warehouse receiving." };
}

export async function receiveManifestShipmentAction(_previousState: ManifestActionState, formData: FormData): Promise<ManifestActionState> {
  const profile = await requireProfile(warehouseRoles);
  const manifestId = validId(formData.get("manifest_id"));
  const trackingNumber = cleanText(formData.get("tracking_number"), 3, 40)?.toUpperCase();
  if (!manifestId || !trackingNumber) return { status: "error", message: "Scan or enter a valid AWB number." };
  const supabase = await createClient();
  const { data: shipment } = await supabase.from("shipments").select("id").eq("organization_id", profile.organization_id).eq("tracking_number", trackingNumber).is("deleted_at", null).maybeSingle();
  if (!shipment) return { status: "error", message: `AWB ${trackingNumber} was not found.` };
  const { data: item } = await supabase.from("pickup_manifest_items").select("id, received_at").eq("manifest_id", manifestId).eq("shipment_id", shipment.id).maybeSingle();
  if (!item) return { status: "error", message: `AWB ${trackingNumber} does not belong to this manifest.` };
  if (item.received_at) return { status: "error", message: `AWB ${trackingNumber} was already received.` };
  const { data, error } = await supabase.from("pickup_manifest_items").update({ received_at: new Date().toISOString() }).eq("id", item.id).is("received_at", null).select("id").maybeSingle();
  if (error || !data) return { status: "error", message: workflowMessage(error?.message, `AWB ${trackingNumber} could not be received.`) };
  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/pickup-manifests");
  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  return { status: "success", message: `AWB ${trackingNumber} received at warehouse.` };
}

export async function bulkReceiveManifestShipmentsAction(_previousState: ManifestActionState, formData: FormData): Promise<ManifestActionState> {
  const profile = await requireProfile(warehouseRoles);
  if (!profile.organization_id) return { status: "error", message: "Organization is missing." };
  const manifestId = validId(formData.get("manifest_id"));
  const file = formData.get("file");
  if (!manifestId || !(file instanceof File)) return { status: "error", message: "Choose a manifest and AWB file." };

  let tracking: string[];
  try { tracking = await trackingNumbersFromFile(file); }
  catch (error) { return { status: "error", message: error instanceof Error ? error.message : "File could not be read." }; }

  const supabase = await createClient();
  const { data: manifest } = await supabase.from("pickup_manifests").select("id,status").eq("id", manifestId).eq("organization_id", profile.organization_id).maybeSingle();
  if (!manifest || !["picked_up", "partially_received"].includes(manifest.status)) return { status: "error", message: "Manifest must be picked up before warehouse bulk receiving." };

  const shipments = await shipmentIdsForTracking(supabase, profile.organization_id, tracking);
  const shipmentIds = shipments.map((row) => row.id);
  const pendingItemIds: number[] = [];
  for (let index = 0; index < shipmentIds.length; index += 200) {
    const { data } = await supabase
      .from("pickup_manifest_items")
      .select("id")
      .eq("manifest_id", Number(manifestId))
      .is("received_at", null)
      .in("shipment_id", shipmentIds.slice(index, index + 200));
    pendingItemIds.push(...(data ?? []).map((row) => Number(row.id)));
  }

  let received = 0;
  const receivedAt = new Date().toISOString();
  for (let index = 0; index < pendingItemIds.length; index += 500) {
    const { data, error } = await supabase
      .from("pickup_manifest_items")
      .update({ received_at: receivedAt })
      .eq("manifest_id", Number(manifestId))
      .is("received_at", null)
      .in("id", pendingItemIds.slice(index, index + 500))
      .select("id");
    if (error) return { status: "error", message: `Bulk receive stopped after ${received} AWBs. ${workflowMessage(error.message, "Please retry.")}` };
    received += data?.length ?? 0;
  }

  revalidatePath(`/pickup-manifests/${manifestId}`);
  revalidatePath("/pickup-manifests");
  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  return { status: "success", message: `${received} AWBs received at warehouse. ${tracking.length - received} skipped because they were not on this manifest, already received, or not found.` };
}
