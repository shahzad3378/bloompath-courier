"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import {
  parseBulkThreePLStatusFile,
  validateThreePLStatusInput,
  type BulkThreePLRowError,
  type ThreePLReturnReason,
  type ThreePLStatusInput,
  type ThreePLUndeliveredReason,
  type ThreePLUpdateStatus,
} from "@/lib/bulk-three-pl-statuses";
import { createClient } from "@/lib/supabase/server";

export type ThreePLState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type BulkThreePLState = {
  status: "idle" | "success" | "partial" | "error";
  message: string;
  errors: BulkThreePLRowError[];
  successCount: number;
  failedCount: number;
};

const roles = [
  "super_admin",
  "operations_admin",
  "warehouse_staff",
  "dispatcher",
] as const;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readStatusInput(formData: FormData): ThreePLStatusInput {
  const attemptText = value(formData, "attempt_number");
  const undeliveredReason = value(formData, "undelivered_reason");
  const returnReason = value(formData, "return_reason");
  const internalNotes = value(formData, "internal_notes");

  return {
    trackingNumber: value(formData, "tracking_number").toUpperCase(),
    status: value(formData, "status") as ThreePLUpdateStatus,
    attemptNumber: attemptText ? Number(attemptText) : null,
    undeliveredReason: undeliveredReason
      ? undeliveredReason as ThreePLUndeliveredReason
      : null,
    returnReason: returnReason ? returnReason as ThreePLReturnReason : null,
    internalNotes: internalNotes || null,
  };
}

function safeStatusError(message?: string) {
  const businessMessages = [
    "Attempt number cannot be lower",
    "3PL attempt number must be",
    "Select a valid undelivered reason",
    "Select a valid return reason",
    "Return reason is required",
    "Shipment is not assigned",
    "3PL shipment link was not found",
    "3PL carrier does not match",
  ];
  return businessMessages.find((item) => message?.includes(item))
    ? message!
    : "The 3PL status could not be saved. Please retry.";
}

function revalidateThreePLPages() {
  revalidatePath("/dispatch");
  revalidatePath("/dispatch/3pl");
  revalidatePath("/shipments");
  revalidatePath("/shipper");
  revalidatePath("/shipper/returns");
  revalidatePath("/shipments/[id]", "page");
}

async function findLinkedShipment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  trackingNumber: string,
) {
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, tracking_number, fulfillment_mode")
    .eq("organization_id", organizationId)
    .eq("tracking_number", trackingNumber)
    .is("deleted_at", null)
    .maybeSingle();

  if (shipmentError || !shipment || shipment.fulfillment_mode !== "third_party") {
    return null;
  }

  const { data: link, error: linkError } = await supabase
    .from("third_party_shipment_links")
    .select("carrier_id")
    .eq("organization_id", organizationId)
    .eq("shipment_id", shipment.id)
    .maybeSingle();

  if (linkError || !link) return null;
  return { id: Number(shipment.id), carrierId: link.carrier_id };
}

export async function createCarrierAction(
  _state: ThreePLState,
  formData: FormData,
): Promise<ThreePLState> {
  const profile = await requireProfile(roles);

  if (!profile.organization_id) {
    return { status: "error", message: "Organization is not configured." };
  }

  const name = value(formData, "name");
  const code = value(formData, "code").toUpperCase();
  const contactName = value(formData, "contact_name") || null;
  const contactPhone = value(formData, "contact_phone") || null;
  const contactEmail = value(formData, "contact_email") || null;

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { status: "error", message: "Enter a valid contact email." };

  if (name.length < 2 || code.length < 2) {
    return { status: "error", message: "Enter carrier name and code." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("third_party_carriers").insert({
    organization_id: profile.organization_id,
    name,
    code,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    created_by: profile.id,
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "23505"
        ? "This 3PL carrier code already exists."
        : "3PL carrier could not be created.",
    };
  }

  revalidatePath("/dispatch/3pl");

  return {
    status: "success",
    message: `${name} added successfully.`,
  };
}

export async function handoverToCarrierAction(
  _state: ThreePLState,
  formData: FormData,
): Promise<ThreePLState> {
  const profile = await requireProfile(roles);

  if (!profile.organization_id) {
    return { status: "error", message: "Organization is not configured." };
  }

  const tracking = value(formData, "tracking_number").toUpperCase();
  const carrierId = value(formData, "carrier_id");
  const partnerTracking = value(formData, "partner_tracking_number");

  if (!tracking || !carrierId) {
    return {
      status: "error",
      message: "Enter our AWB and select the 3PL carrier.",
    };
  }

  const supabase = await createClient();

  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, tracking_number, status, fulfillment_mode")
    .eq("organization_id", profile.organization_id)
    .eq("tracking_number", tracking)
    .is("deleted_at", null)
    .maybeSingle();

  if (!shipment) {
    return { status: "error", message: `AWB ${tracking} was not found.` };
  }

  if (shipment.status !== "at_warehouse") {
    return {
      status: "error",
      message: `AWB ${tracking} must be received at warehouse first.`,
    };
  }

  const { data: carrier } = await supabase
    .from("third_party_carriers")
    .select("id, name")
    .eq("id", carrierId)
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!carrier) {
    return { status: "error", message: "Selected 3PL carrier is not active." };
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("third_party_manifest_items")
    .select("manifest_id")
    .eq("organization_id", profile.organization_id)
    .eq("shipment_id", shipment.id)
    .eq("reserved", true)
    .maybeSingle();
  if (reservationError || reservation) {
    return { status: "error", message: reservation ? "This AWB belongs to a manifest. Open 3PL Manifests and confirm its handover there." : "Manifest reservations could not be checked. Please retry." };
  }

  // Carrier labels can be booked before physical warehouse handover.
  const { data: existingLink, error: existingLinkError } = await supabase
    .from("third_party_shipment_links")
    .select("carrier_id, partner_tracking_number, handed_over_at")
    .eq("organization_id", profile.organization_id)
    .eq("shipment_id", shipment.id)
    .maybeSingle();
  if (existingLinkError || (existingLink && (existingLink.carrier_id !== carrier.id
    || existingLink.handed_over_at
    || (partnerTracking && existingLink.partner_tracking_number !== partnerTracking)))) {
    return { status: "error", message: "Shipment has a different or already handed-over partner booking." };
  }

  const { error: shipmentError } = await supabase
    .from("shipments")
    .update({
      fulfillment_mode: "third_party",
      assigned_driver_id: null,
    })
    .eq("id", shipment.id);

  if (shipmentError) {
    return { status: "error", message: "Shipment could not be assigned to 3PL." };
  }

  const { error: linkError } = existingLink ? { error: null } : await supabase
    .from("third_party_shipment_links")
    .insert({
      organization_id: profile.organization_id,
      shipment_id: shipment.id,
      carrier_id: carrier.id,
      partner_tracking_number: partnerTracking || null,
      created_by: profile.id,
    });

  if (linkError) {
    await supabase
      .from("shipments")
      .update({ fulfillment_mode: "own_fleet" })
      .eq("id", shipment.id);

    return {
      status: "error",
      message: linkError.code === "23505"
        ? "This shipment or partner tracking number is already linked."
        : "3PL shipment link could not be created.",
    };
  }

  const { error: statusError } = await supabase
    .from("third_party_status_updates")
    .insert({
      organization_id: profile.organization_id,
      shipment_id: shipment.id,
      carrier_id: carrier.id,
      status: "handed_over",
      source: "manual",
      updated_by: profile.id,
    });

  if (statusError) {
    return {
      status: "error",
      message: `3PL linked, but handover status failed: ${statusError.message}`,
    };
  }

  revalidatePath("/dispatch");
  revalidatePath("/dispatch/3pl");
  revalidatePath("/shipments");
  revalidatePath("/shipper");
  revalidatePath("/shipper/returns");
  revalidatePath(`/shipments/${shipment.id}`);

  return {
    status: "success",
    message: `AWB ${tracking} transferred to delivery partner.`,
  };
}

export async function updateThreePLStatusAction(
  _state: ThreePLState,
  formData: FormData,
): Promise<ThreePLState> {
  const profile = await requireProfile(roles);
  if (!profile.organization_id) {
    return { status: "error", message: "Organization is not configured." };
  }

  const update = readStatusInput(formData);
  const issue = validateThreePLStatusInput(update);
  if (issue) return { status: "error", message: issue };

  const supabase = await createClient();
  const linkedShipment = await findLinkedShipment(
    supabase,
    profile.organization_id,
    update.trackingNumber,
  );
  if (!linkedShipment) {
    return {
      status: "error",
      message: `AWB ${update.trackingNumber} is not linked to an active 3PL shipment.`,
    };
  }

  const { error } = await supabase.from("third_party_status_updates").insert({
    organization_id: profile.organization_id,
    shipment_id: linkedShipment.id,
    carrier_id: linkedShipment.carrierId,
    status: update.status,
    attempt_number: update.attemptNumber,
    undelivered_reason: update.status === "undelivered" ? update.undeliveredReason : null,
    return_reason: update.returnReason,
    internal_notes: update.internalNotes,
    source: "manual",
    updated_by: profile.id,
  });

  if (error) return { status: "error", message: safeStatusError(error.message) };

  revalidateThreePLPages();
  return {
    status: "success",
    message: `AWB ${update.trackingNumber} updated to ${update.status.replaceAll("_", " ")}.`,
  };
}

export async function bulkUpdateThreePLStatusesAction(
  _state: BulkThreePLState,
  formData: FormData,
): Promise<BulkThreePLState> {
  const profile = await requireProfile(roles);
  const emptyResult = { errors: [], successCount: 0, failedCount: 0 };
  if (!profile.organization_id) {
    return { status: "error", message: "Organization is not configured.", ...emptyResult };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { status: "error", message: "Choose an Excel or CSV file to upload.", ...emptyResult };
  }

  const parsed = await parseBulkThreePLStatusFile(file);
  if (!parsed.ok) {
    return {
      status: "error",
      message: parsed.message,
      errors: parsed.errors,
      successCount: 0,
      failedCount: parsed.errors.length,
    };
  }

  const supabase = await createClient();
  const trackingNumbers = parsed.rows.map(({ update }) => update.trackingNumber);
  const shipmentByTracking = new Map<string, { id: number }>();

  for (let index = 0; index < trackingNumbers.length; index += 100) {
    const { data, error } = await supabase
      .from("shipments")
      .select("id, tracking_number")
      .eq("organization_id", profile.organization_id)
      .eq("fulfillment_mode", "third_party")
      .is("deleted_at", null)
      .in("tracking_number", trackingNumbers.slice(index, index + 100));

    if (error) {
      return { status: "error", message: "3PL shipments could not be checked. Please retry.", ...emptyResult };
    }
    for (const shipment of data ?? []) {
      shipmentByTracking.set(shipment.tracking_number, { id: Number(shipment.id) });
    }
  }

  const shipmentIds = [...shipmentByTracking.values()].map(({ id }) => id);
  const carrierByShipment = new Map<number, string>();
  for (let index = 0; index < shipmentIds.length; index += 100) {
    const { data, error } = await supabase
      .from("third_party_shipment_links")
      .select("shipment_id, carrier_id")
      .eq("organization_id", profile.organization_id)
      .in("shipment_id", shipmentIds.slice(index, index + 100));

    if (error) {
      return { status: "error", message: "3PL shipment links could not be checked. Please retry.", ...emptyResult };
    }
    for (const link of data ?? []) carrierByShipment.set(Number(link.shipment_id), link.carrier_id);
  }

  const errors: BulkThreePLRowError[] = [];
  let successCount = 0;

  for (const { row, update } of parsed.rows) {
    const shipment = shipmentByTracking.get(update.trackingNumber);
    const carrierId = shipment ? carrierByShipment.get(shipment.id) : null;
    if (!shipment || !carrierId) {
      errors.push({
        row,
        field: "tracking_number",
        message: `AWB ${update.trackingNumber} is not linked to an active 3PL shipment.`,
      });
      continue;
    }

    const { error } = await supabase.from("third_party_status_updates").insert({
      organization_id: profile.organization_id,
      shipment_id: shipment.id,
      carrier_id: carrierId,
      status: update.status,
      attempt_number: update.attemptNumber,
      undelivered_reason: update.status === "undelivered" ? update.undeliveredReason : null,
      return_reason: update.returnReason,
      internal_notes: update.internalNotes,
      source: "bulk",
      updated_by: profile.id,
    });

    if (error) {
      errors.push({ row, field: "status_update", message: safeStatusError(error.message) });
    } else {
      successCount += 1;
    }
  }

  if (successCount > 0) revalidateThreePLPages();
  const failedCount = errors.length;
  if (failedCount === 0) {
    return {
      status: "success",
      message: `${successCount} 3PL status update${successCount === 1 ? "" : "s"} saved successfully.`,
      errors: [],
      successCount,
      failedCount: 0,
    };
  }

  return {
    status: successCount > 0 ? "partial" : "error",
    message: successCount > 0
      ? `${successCount} update${successCount === 1 ? "" : "s"} saved; ${failedCount} failed. Review the rows below.`
      : `No statuses were updated. Review ${failedCount} row${failedCount === 1 ? "" : "s"} below.`,
    errors: errors.slice(0, 200),
    successCount,
    failedCount,
  };
}


