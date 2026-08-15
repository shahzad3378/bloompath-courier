"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { canDeleteShipments, internalRoles } from "@/lib/roles";
import { paymentTypes, serviceTypes } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export type CreateShipmentState = { message: string };
export type ArchiveShipmentState = { message: string };

function requiredText(formData: FormData, key: string, min: number, max: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length >= min && value.length <= max ? value : null;
}

function optionalText(formData: FormData, key: string, max: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value && value.length <= max ? value : null;
}

export async function createShipmentAction(
  _previousState: CreateShipmentState,
  formData: FormData,
): Promise<CreateShipmentState> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  if (!profile.organization_id) return { message: "Your account is not linked to an organization." };

  const senderName = requiredText(formData, "sender_name", 2, 120);
  const senderPhone = requiredText(formData, "sender_phone", 7, 20);
  const senderAddress = requiredText(formData, "sender_address", 5, 500);
  const senderCity = requiredText(formData, "sender_city", 2, 80);
  const consigneeName = requiredText(formData, "consignee_name", 2, 120);
  const consigneePhone = requiredText(formData, "consignee_phone", 7, 20);
  const consigneeAddress = requiredText(formData, "consignee_address", 5, 500);
  const consigneeCity = requiredText(formData, "consignee_city", 2, 80);
  const parcelDescription = requiredText(formData, "parcel_description", 2, 500);
  const serviceType = String(formData.get("service_type") ?? "");
  const paymentType = String(formData.get("payment_type") ?? "");
  const pieces = Number(formData.get("pieces"));
  const weightKg = Number(formData.get("weight_kg"));
  const submittedCod = Number(formData.get("cod_amount"));

  if (
    !senderName || !senderPhone || !senderAddress || !senderCity ||
    !consigneeName || !consigneePhone || !consigneeAddress || !consigneeCity ||
    !parcelDescription ||
    !serviceTypes.includes(serviceType as (typeof serviceTypes)[number]) ||
    !paymentTypes.includes(paymentType as (typeof paymentTypes)[number]) ||
    !Number.isInteger(pieces) || pieces < 1 || pieces > 999 ||
    !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 1000 ||
    !Number.isFinite(submittedCod) || submittedCod < 0 || submittedCod > 9999999999
  ) {
    return { message: "Please check the required shipment details and try again." };
  }

  const supabase = await createClient();

  let shipperId = profile.id;

  if (profile.role !== "shipper") {
    const selectedShipperId = String(formData.get("shipper_id") ?? "");

    if (!/^[0-9a-f-]{36}$/i.test(selectedShipperId)) {
      return { message: "Select an active shipper before booking the shipment." };
    }

    const { data: selectedShipper, error: shipperError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", selectedShipperId)
      .eq("organization_id", profile.organization_id)
      .eq("role", "shipper")
      .eq("status", "active")
      .maybeSingle();

    if (shipperError || !selectedShipper) {
      return { message: "The selected shipper is not active or does not belong to your organization." };
    }

    shipperId = selectedShipper.id;
  }

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      organization_id: profile.organization_id,
      shipper_id: shipperId,
      created_by: profile.id,
      reference_number: optionalText(formData, "reference_number", 80),
      service_type: serviceType,
      payment_type: paymentType,
      sender_name: senderName,
      sender_phone: senderPhone,
      sender_address: senderAddress,
      sender_city: senderCity,
      consignee_name: consigneeName,
      consignee_phone: consigneePhone,
      consignee_alt_phone: optionalText(formData, "consignee_alt_phone", 20),
      consignee_address: consigneeAddress,
      consignee_city: consigneeCity,
      consignee_area: optionalText(formData, "consignee_area", 120),
      consignee_landmark: optionalText(formData, "consignee_landmark", 200),
      pieces,
      weight_kg: weightKg,
      parcel_description: parcelDescription,
      cod_amount: paymentType === "cod" ? submittedCod : 0,
      delivery_instructions: optionalText(formData, "delivery_instructions", 500),
    })
    .select("id, tracking_number")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { message: "This reference number is already used for another shipment." };
    }
    return { message: "Shipment could not be booked. Please review the details and retry." };
  }

  redirect(`/shipments/${data.id}?created=1`);
}

export async function archiveShipmentAction(
  _previousState: ArchiveShipmentState,
  formData: FormData,
): Promise<ArchiveShipmentState> {
  const profile = await requireProfile(internalRoles);
  if (!profile.organization_id || !canDeleteShipments(profile)) {
    return { message: "You do not have permission to archive AWBs." };
  }

  const shipmentId = String(formData.get("shipment_id") ?? "");
  const reason = requiredText(formData, "delete_reason", 3, 500);
  if (!/^\d+$/.test(shipmentId) || !reason) {
    return { message: "Enter an archive reason between 3 and 500 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipments")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
      delete_reason: reason,
    })
    .eq("id", shipmentId)
    .eq("organization_id", profile.organization_id)
    .eq("status", "booked")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { message: error?.message || "Only an active booked AWB can be archived." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/shipments");
  redirect("/shipments?archived=1");
}
