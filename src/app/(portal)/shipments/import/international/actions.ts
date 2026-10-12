"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { bulkUploadMaxBytes, parseBulkShipmentFile, readBulkFileRows, type BulkRowError } from "@/lib/bulk-shipments";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { prepareInternationalRows, type InternationalCalculation } from "@/lib/international-bulk";

export type InternationalUploadState = {
  status: "idle" | "error" | "ready" | "success";
  message: string;
  errors: BulkRowError[];
  calculations: InternationalCalculation[];
  imported: { id: number; trackingNumber: string; referenceNumber: string | null }[];
};

const idle: InternationalUploadState = { status: "idle", message: "", errors: [], calculations: [], imported: [] };

async function preparedFile(formData: FormData) {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  if (!profile.organization_id) return { error: "Your account is not linked to a courier company.", profile, rows: [], supabase: null, calculations: [] as InternationalCalculation[] };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a non-empty CSV or Excel file.", profile, rows: [], supabase: null, calculations: [] as InternationalCalculation[] };
  if (file.size > bulkUploadMaxBytes) return { error: "The file is larger than the 20 MB limit.", profile, rows: [], supabase: null, calculations: [] as InternationalCalculation[] };

  const supabase = await createClient();
  const [{ data: settings }, { data: primaryCountry }] = await Promise.all([
    supabase.from("organization_settings").select("currency").eq("organization_id", profile.organization_id).maybeSingle(),
    supabase.from("organization_countries").select("country_code").eq("organization_id", profile.organization_id).eq("is_primary", true).maybeSingle(),
  ]);
  const defaultCountryCode = String(primaryCountry?.country_code ?? "AE").toUpperCase();
  const parsed = await parseBulkShipmentFile(file, {
    defaultCountryCode,
    currency: String(settings?.currency ?? "AED").toUpperCase(),
  });
  if (!parsed.ok) return { error: parsed.message, errors: parsed.errors, profile, rows: [], supabase, calculations: [] as InternationalCalculation[] };
  let rawRows: unknown[][];
  try {
    rawRows = await readBulkFileRows(file);
  } catch {
    return { error: "The international file could not be read. Download a fresh template and retry.", profile, rows: [], supabase, calculations: [] as InternationalCalculation[] };
  }
  const prepared = prepareInternationalRows(parsed.rows, rawRows);
  if (!prepared.ok) return { error: prepared.message, errors: prepared.errors, profile, rows: [], supabase, calculations: [] as InternationalCalculation[] };
  return { error: "", profile, rows: prepared.rows, supabase, calculations: prepared.rows.map((item) => item.calculation) };
}

async function selectedShipper(formData: FormData, profile: Awaited<ReturnType<typeof requireProfile>>, supabase: Awaited<ReturnType<typeof createClient>>) {
  if (profile.role === "shipper") return { id: profile.id, error: "" };
  const id = String(formData.get("shipper_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { id: "", error: "Select an active shipper before importing the international batch." };
  const { data } = await supabase.from("profiles").select("id").eq("id", id).eq("organization_id", profile.organization_id).eq("role", "shipper").eq("status", "active").maybeSingle();
  return data ? { id: data.id, error: "" } : { id: "", error: "The selected shipper is not active in this courier company." };
}

export async function previewInternationalUploadAction(_previous: InternationalUploadState, formData: FormData): Promise<InternationalUploadState> {
  const result = await preparedFile(formData);
  if (result.error) return { ...idle, status: "error", message: result.error, errors: result.errors ?? [] };
  const shipper = await selectedShipper(formData, result.profile, result.supabase!);
  if (shipper.error) return { ...idle, status: "error", message: shipper.error, errors: [] };
  return { ...idle, status: "ready", message: result.rows.length + " international shipments ready. Review the air/sea weight calculations before creating them.", calculations: result.calculations };
}

export async function importInternationalShipmentsAction(_previous: InternationalUploadState, formData: FormData): Promise<InternationalUploadState> {
  const result = await preparedFile(formData);
  if (result.error) return { ...idle, status: "error", message: result.error, errors: result.errors ?? [] };
  const supabase = result.supabase!;
  const profile = result.profile;
  const shipper = await selectedShipper(formData, profile, supabase);
  if (shipper.error) return { ...idle, status: "error", message: shipper.error, errors: [] };

  const references = result.rows.map((item) => item.shipment.reference_number).filter((value): value is string => Boolean(value));
  if (references.length) {
    const existingReferences = new Set<string>();
    for (let offset = 0; offset < references.length; offset += 200) {
      const { data } = await supabase.from("shipments").select("reference_number").eq("organization_id", profile.organization_id!).is("deleted_at", null).in("reference_number", references.slice(offset, offset + 200));
      for (const row of data ?? []) if (row.reference_number) existingReferences.add(row.reference_number);
    }
    const duplicates = result.rows.filter((item) => item.shipment.reference_number && existingReferences.has(item.shipment.reference_number));
    if (duplicates.length) {
      const errors = duplicates.slice(0, 500).map((item) => ({ row: item.row, field: "reference_number", message: "This reference number already exists." }));
      return { ...idle, status: "error", message: "Existing reference numbers were found. No shipments were imported.", errors };
    }
  }

  const insertRows = result.rows.map((item) => ({
    ...item.shipment,
    ...item.shipmentFields,
    organization_id: profile.organization_id,
    shipper_id: shipper.id,
    created_by: profile.id,
  }));
  const imported: InternationalUploadState["imported"] = [];
  for (let offset = 0; offset < insertRows.length; offset += 500) {
    const { data, error } = await supabase.from("shipments").insert(insertRows.slice(offset, offset + 500)).select("id,tracking_number,reference_number");
    if (error || !data) {
      return { ...idle, status: "error", message: "Import stopped after " + imported.length + " shipment(s). Review the result and retry the remaining rows.", imported };
    }
    imported.push(...data.map((row) => ({ id: Number(row.id), trackingNumber: row.tracking_number, referenceNumber: row.reference_number })));
  }
  revalidatePath("/shipments");
  revalidatePath("/dashboard");
  return { status: "success", message: imported.length + " international shipment(s) created with saved Air/Sea calculations.", errors: [], calculations: result.calculations, imported };
}
