"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ReturnActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const returnRoles = [
  "super_admin",
  "operations_admin",
  "warehouse_staff",
  "dispatcher",
] as const;

const proofMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const manifestMimeTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function text(formData: FormData, key: string, min: number, max: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length >= min && value.length <= max ? value : null;
}

function numericId(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  return /^\d+$/.test(value) ? value : null;
}

export async function createReturnRunAction(
  _state: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const profile = await requireProfile(returnRoles);

  const shipperId = String(formData.get("shipper_id") ?? "");
  const driverId = String(formData.get("driver_id") ?? "");

  if (
    !profile.organization_id ||
    !/^[0-9a-f-]{36}$/i.test(shipperId) ||
    !/^[0-9a-f-]{36}$/i.test(driverId)
  ) {
    return {
      status: "error",
      message: "Select a shipper and driver.",
    };
  }

  const supabase = await createClient();

  const [{ data: shipper }, { data: driver }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", shipperId)
        .eq("organization_id", profile.organization_id)
        .eq("role", "shipper")
        .eq("status", "active")
        .maybeSingle(),

      supabase
        .from("profiles")
        .select("id")
        .eq("id", driverId)
        .eq("organization_id", profile.organization_id)
        .eq("role", "driver")
        .eq("status", "active")
        .maybeSingle(),
    ]);

  if (!shipper) {
    return {
      status: "error",
      message: "Selected shipper is not active.",
    };
  }

  if (!driver) {
    return {
      status: "error",
      message: "Selected driver is not active.",
    };
  }

  const { data, error } = await supabase
    .from("return_runs")
    .insert({
      organization_id: profile.organization_id,
      shipper_id: shipperId,
      route_name:
        shipper.full_name ||
        shipper.email ||
        "Shipper Return",
      driver_id: driverId,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      status: "error",
      message: "Return handover could not be created.",
    };
  }

  redirect(`/returns/${data.id}`);
}

export async function addReturnAwbAction(
  _state: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const profile = await requireProfile(returnRoles);

  const runId = numericId(formData, "run_id");
  const tracking = text(formData, "tracking_number", 3, 40)?.toUpperCase();

  if (!profile.organization_id || !runId || !tracking) {
    return {
      status: "error",
      message: "Scan or enter a valid AWB.",
    };
  }

  const supabase = await createClient();

  const [{ data: run }, { data: shipment }] =
    await Promise.all([
      supabase
        .from("return_runs")
        .select("id, shipper_id, status")
        .eq("id", Number(runId))
        .maybeSingle(),

      supabase
        .from("shipments")
        .select(
          "id, shipper_id, status, delivery_attempt_count, fourth_attempt_authorized, warehouse_received_at, assigned_driver_id",
        )
        .eq("tracking_number", tracking)
        .eq("organization_id", profile.organization_id)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);

  if (!run || run.status !== "draft") {
    return {
      status: "error",
      message: "This return handover is no longer open for scanning.",
    };
  }

  if (!shipment) {
    return {
      status: "error",
      message: `AWB ${tracking} was not found.`,
    };
  }

  if (
    run.shipper_id &&
    shipment.shipper_id !== run.shipper_id
  ) {
    return {
      status: "error",
      message: `AWB ${tracking} does not belong to the selected shipper.`,
    };
  }

  const eligible =
    shipment.status === "return_initiated" &&
    Boolean(shipment.warehouse_received_at) &&
    !shipment.assigned_driver_id &&
    !(
      shipment.delivery_attempt_count === 3 &&
      shipment.fourth_attempt_authorized
    );

  if (!eligible) {
    return {
      status: "error",
      message: `AWB ${tracking} is not physically ready for Return to Seller.`,
    };
  }

  const { error } = await supabase.from("return_run_items").insert({
    organization_id: profile.organization_id,
    run_id: Number(runId),
    shipment_id: shipment.id,
    added_by: profile.id,
  });

  if (error?.code === "23505") {
    return {
      status: "error",
      message: `AWB ${tracking} is already on an active return handover.`,
    };
  }

  if (error) {
    return {
      status: "error",
      message: `AWB ${tracking} could not be added to the return handover.`,
    };
  }

  revalidatePath(`/returns/${runId}`);
  revalidatePath("/returns");

  return {
    status: "success",
    message: `AWB ${tracking} added to the return handover.`,
  };
}

export async function removeReturnAwbAction(
  formData: FormData,
): Promise<void> {
  await requireProfile(returnRoles);

  const runId = numericId(formData, "run_id");
  const itemId = numericId(formData, "item_id");

  if (!runId || !itemId) return;

  const supabase = await createClient();

  await supabase
    .from("return_run_items")
    .delete()
    .eq("id", itemId)
    .eq("run_id", runId);

  revalidatePath(`/returns/${runId}`);
  revalidatePath("/returns");
}

export async function handoverReturnRunAction(
  formData: FormData,
): Promise<void> {
  await requireProfile(returnRoles);

  const runId = numericId(formData, "run_id");

  if (!runId) redirect("/returns?error=invalid");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("return_runs")
    .update({ status: "handed_over" })
    .eq("id", runId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(`/returns/${runId}?error=handover`);
  }

  revalidatePath("/returns");
  revalidatePath(`/returns/${runId}`);
  revalidatePath("/driver");
  revalidatePath("/shipments");

  redirect(`/returns/${runId}?handed_over=1`);
}

export async function completeSellerReturnAction(
  _state: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const profile = await requireProfile(["driver"]);

  const itemId = numericId(formData, "return_item_id");
  const notes = text(formData, "notes", 1, 500);
  const proof = formData.get("proof");

  if (!profile.organization_id || !itemId) {
    return {
      status: "error",
      message: "Invalid seller return assignment.",
    };
  }

  if (
    !(proof instanceof File) ||
    proof.size === 0 ||
    proof.size > 5 * 1024 * 1024 ||
    !proofMimeTypes.has(proof.type)
  ) {
    return {
      status: "error",
      message: "Attach a JPG, PNG or WebP seller POD photo up to 5 MB.",
    };
  }

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("return_run_items")
    .select("id, completed_at, return_runs!inner(driver_id, status)")
    .eq("id", itemId)
    .maybeSingle();

  const run = item?.return_runs as unknown as
    | { driver_id: string; status: string }
    | undefined;

  if (
    !item ||
    item.completed_at ||
    !run ||
    run.driver_id !== profile.id ||
    run.status !== "handed_over"
  ) {
    return {
      status: "error",
      message: "This seller return is not assigned to you or is already closed.",
    };
  }

  const extension = proofMimeTypes.get(proof.type)!;
  const proofPath =
    `${profile.organization_id}/${profile.id}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("delivery-proofs")
    .upload(proofPath, proof, {
      contentType: proof.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      status: "error",
      message: "Seller POD photo could not be uploaded. Retry.",
    };
  }

  const { error } = await supabase
    .from("return_run_items")
    .update({
      proof_path: proofPath,
      notes,
      completed_at: new Date().toISOString(),
    })
    .eq("id", Number(itemId))
    .is("completed_at", null);

  if (error) {
    await supabase.storage.from("delivery-proofs").remove([proofPath]);

    return {
      status: "error",
      message: "Seller return could not be completed. Please retry.",
    };
  }

  revalidatePath("/driver");
  revalidatePath("/returns");
  revalidatePath("/shipments");

  redirect("/driver?return_updated=1");
}


export async function completeReturnHandoverAction(
  _state: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const profile = await requireProfile(returnRoles);

  const runId = numericId(formData, "run_id");
  const receiverName = text(
    formData,
    "received_by_name",
    2,
    150,
  );
  const notes = String(
    formData.get("manifest_notes") ?? "",
  )
    .trim()
    .slice(0, 500);

  const proof = formData.get("signed_manifest");

  if (!profile.organization_id || !runId) {
    return {
      status: "error",
      message: "Invalid return handover.",
    };
  }

  if (
    !(proof instanceof File) ||
    proof.size === 0 ||
    proof.size > 10 * 1024 * 1024 ||
    !manifestMimeTypes.has(proof.type)
  ) {
    return {
      status: "error",
      message:
        "Attach the signed manifest as PDF, JPG, PNG or WebP up to 10 MB.",
    };
  }

  const supabase = await createClient();

  const { data: run } = await supabase
    .from("return_runs")
    .select(`
      id,
      organization_id,
      status,
      signed_manifest_path
    `)
    .eq("id", Number(runId))
    .maybeSingle();

  if (!run || run.status !== "handed_over") {
    return {
      status: "error",
      message:
        "This return handover is not ready for final completion.",
    };
  }

  const { data: items } = await supabase
    .from("return_run_items")
    .select("id, completed_at")
    .eq("run_id", Number(runId));

  const pendingItems = (items ?? []).filter(
    (item) => !item.completed_at,
  );

  if (pendingItems.length === 0) {
    return {
      status: "error",
      message:
        "There are no pending AWBs on this return handover.",
    };
  }

  const extension = manifestMimeTypes.get(proof.type)!;

  const manifestPath =
    `${profile.organization_id}/return-handovers/` +
    `${runId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("return-manifests")
    .upload(manifestPath, proof, {
      contentType: proof.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      status: "error",
      message:
        "Signed return manifest could not be uploaded.",
    };
  }

  const { error: runUpdateError } = await supabase
    .from("return_runs")
    .update({
      signed_manifest_path: manifestPath,
      received_by_name: receiverName,
      manifest_notes: notes || null,
    })
    .eq("id", Number(runId))
    .eq("status", "handed_over");

  if (runUpdateError) {
    await supabase.storage
      .from("return-manifests")
      .remove([manifestPath]);

    return {
      status: "error",
      message:
        "Signed manifest metadata could not be saved.",
    };
  }

  for (const item of pendingItems) {
    const { error } = await supabase
      .from("return_run_items")
      .update({
        proof_path: manifestPath,
        notes:
          notes ||
          "Completed against signed return handover manifest.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .is("completed_at", null);

    if (error) {
      return {
        status: "error",
        message:
          "Manifest was uploaded, but one or more AWBs could not be completed.",
      };
    }
  }

  revalidatePath(`/returns/${runId}`);
  revalidatePath("/returns");
  revalidatePath("/driver");
  revalidatePath("/shipments");
  revalidatePath("/reports");

  return {
    status: "success",
    message:
      `${pendingItems.length} AWB${
        pendingItems.length === 1 ? "" : "s"
      } returned to shipper successfully.`,
  };
}
