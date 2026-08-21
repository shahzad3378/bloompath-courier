"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { parseBulkShipmentFile, type BulkRowError } from "@/lib/bulk-shipments";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type ImportedShipment = { id: number; trackingNumber: string; referenceNumber: string | null };
export type BulkUploadState = { status: "idle" | "error" | "success"; message: string; errors: BulkRowError[]; imported: ImportedShipment[] };

type Zone = { id: number; name: string; country_code: string; postal_prefix: string | null; city: string | null; is_active: boolean };

function matchZone(zones: Zone[], country: string, postal: string | null, city: string) {
  const normalizedPostal = (postal ?? "").toUpperCase().replace(/\s+/g, "");
  const normalizedCity = city.trim().toLowerCase();
  const candidates = zones.filter((zone) => zone.is_active && zone.country_code === country);
  const postalMatch = candidates
    .filter((zone) => zone.postal_prefix && normalizedPostal.startsWith(zone.postal_prefix.toUpperCase().replace(/\s+/g, "")))
    .sort((a, b) => (b.postal_prefix?.length ?? 0) - (a.postal_prefix?.length ?? 0))[0];
  if (postalMatch) return postalMatch;
  return candidates.find((zone) => zone.city?.trim().toLowerCase() === normalizedCity) ?? null;
}

export async function importShipmentsAction(_previousState: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  if (!profile.organization_id) return { status: "error", message: "Your account is not linked to an organization.", errors: [], imported: [] };

  const file = formData.get("file");
  if (!(file instanceof File)) return { status: "error", message: "Choose an Excel or CSV file to upload.", errors: [], imported: [] };

  const supabase = await createClient();
  const [{ data: settings }, { data: primaryCountry }, { data: zoneData }] = await Promise.all([
    supabase.from("organization_settings").select("currency").eq("organization_id", profile.organization_id).maybeSingle(),
    supabase.from("organization_countries").select("country_code").eq("organization_id", profile.organization_id).eq("is_primary", true).maybeSingle(),
    supabase.from("service_zones").select("id,name,country_code,postal_prefix,city,is_active").eq("organization_id", profile.organization_id).eq("is_active", true),
  ]);

  const currency = String(settings?.currency ?? "AED").toUpperCase();
  const defaultCountryCode = String(primaryCountry?.country_code ?? "AE").toUpperCase();
  const parsed = await parseBulkShipmentFile(file, { defaultCountryCode, currency });
  if (!parsed.ok) return { status: "error", message: parsed.message, errors: parsed.errors, imported: [] };

  let shipperId = profile.id;
  if (profile.role !== "shipper") {
    const selectedShipperId = String(formData.get("shipper_id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(selectedShipperId)) return { status: "error", message: "Select an active shipper before importing the batch.", errors: [], imported: [] };
    const { data: selectedShipper } = await supabase.from("profiles").select("id").eq("id", selectedShipperId).eq("organization_id", profile.organization_id).eq("role", "shipper").eq("status", "active").maybeSingle();
    if (!selectedShipper) return { status: "error", message: "The selected shipper is not active or does not belong to your organization.", errors: [], imported: [] };
    shipperId = selectedShipper.id;
  }

  const references = parsed.rows.map(({ shipment }) => shipment.reference_number).filter((reference): reference is string => Boolean(reference));
  if (references.length) {
    const existingReferences = new Set<string>();
    for (let index = 0; index < references.length; index += 100) {
      const { data: existing } = await supabase.from("shipments").select("reference_number").eq("organization_id", profile.organization_id).is("deleted_at", null).in("reference_number", references.slice(index, index + 100));
      for (const item of existing ?? []) if (item.reference_number) existingReferences.add(item.reference_number);
    }
    const referenceErrors = parsed.rows.filter(({ shipment }) => shipment.reference_number && existingReferences.has(shipment.reference_number)).map(({ row }) => ({ row, field: "reference_number", message: "This reference number already exists." }));
    if (referenceErrors.length) return { status: "error", message: `${referenceErrors.length} existing reference${referenceErrors.length === 1 ? "" : "s"} found. No shipments were imported.`, errors: referenceErrors, imported: [] };
  }

  const zones = (zoneData ?? []) as Zone[];
  const insertRows = parsed.rows.map(({ shipment }) => {
    const zone = matchZone(zones, shipment.consignee_country_code, shipment.consignee_postal_code, shipment.consignee_city);
    return {
      ...shipment,
      organization_id: profile.organization_id,
      shipper_id: shipperId,
      created_by: profile.id,
      service_zone_id: zone?.id ?? null,
      service_zone_name: zone?.name ?? null,
    };
  });

  const { data, error } = await supabase.from("shipments").insert(insertRows).select("id, tracking_number, reference_number");
  if (error || !data) return { status: "error", message: error?.code === "23505" ? "One or more reference numbers are already in use. No shipments were imported." : "The batch could not be booked. No shipments were imported; review the file and retry.", errors: [], imported: [] };

  revalidatePath("/dashboard");
  revalidatePath("/shipments");
  revalidatePath("/dispatch");
  return { status: "success", message: `${data.length} shipment${data.length === 1 ? "" : "s"} booked. Postal/city zones were matched automatically where configured.`, errors: [], imported: data.map((shipment) => ({ id: Number(shipment.id), trackingNumber: shipment.tracking_number, referenceNumber: shipment.reference_number })) };
}
