"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { parseBulkShipmentFile, type BulkRowError } from "@/lib/bulk-shipments";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type ImportedShipment = {
  id: number;
  trackingNumber: string;
  referenceNumber: string | null;
};

export type BulkUploadState = {
  status: "idle" | "error" | "success";
  message: string;
  errors: BulkRowError[];
  imported: ImportedShipment[];
};

export async function importShipmentsAction(
  _previousState: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  if (!profile.organization_id) {
    return { status: "error", message: "Your account is not linked to an organization.", errors: [], imported: [] };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { status: "error", message: "Choose an Excel or CSV file to upload.", errors: [], imported: [] };
  }

  const parsed = await parseBulkShipmentFile(file);
  if (!parsed.ok) {
    return { status: "error", message: parsed.message, errors: parsed.errors, imported: [] };
  }

  const supabase = await createClient();
  const references = parsed.rows
    .map(({ shipment }) => shipment.reference_number)
    .filter((reference): reference is string => Boolean(reference));

  if (references.length > 0) {
    const existingReferences = new Set<string>();
    for (let index = 0; index < references.length; index += 100) {
      const { data: existing, error: referenceError } = await supabase
        .from("shipments")
        .select("reference_number")
        .is("deleted_at", null)
        .in("reference_number", references.slice(index, index + 100));

      if (referenceError) {
        return { status: "error", message: "Existing shipment references could not be checked. Please retry.", errors: [], imported: [] };
      }
      for (const item of existing ?? []) {
        if (item.reference_number) existingReferences.add(item.reference_number);
      }
    }

    const referenceErrors = parsed.rows
      .filter(({ shipment }) => shipment.reference_number && existingReferences.has(shipment.reference_number))
      .map(({ row }) => ({ row, field: "reference_number", message: "This reference number already exists." }));

    if (referenceErrors.length > 0) {
      return {
        status: "error",
        message: `${referenceErrors.length} existing reference${referenceErrors.length === 1 ? "" : "s"} found. No shipments were imported.`,
        errors: referenceErrors,
        imported: [],
      };
    }
  }

  const insertRows = parsed.rows.map(({ shipment }) => ({
    ...shipment,
    organization_id: profile.organization_id,
    shipper_id: profile.role === "shipper" ? profile.id : null,
    created_by: profile.id,
  }));

  const { data, error } = await supabase
    .from("shipments")
    .insert(insertRows)
    .select("id, tracking_number, reference_number");

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        status: "error",
        message: "One or more reference numbers are already in use. No shipments were imported.",
        errors: [],
        imported: [],
      };
    }
    return {
      status: "error",
      message: "The batch could not be booked. No shipments were imported; review the file and retry.",
      errors: [],
      imported: [],
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/shipments");

  return {
    status: "success",
    message: `${data.length} shipment${data.length === 1 ? "" : "s"} booked and AWBs generated successfully.`,
    errors: [],
    imported: data.map((shipment) => ({
      id: Number(shipment.id),
      trackingNumber: shipment.tracking_number,
      referenceNumber: shipment.reference_number,
    })),
  };
}
