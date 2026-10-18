"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  buildShipmentAddress,
  geocodeAddress,
  geocodeInBatches,
  optimizeRouteStops,
  parseCoordinatePair,
} from "@/lib/google-maps";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type DispatchActionState = { status: "idle" | "success" | "error"; message: string };
export type CancelDraftRoutesState = {
  status: "idle" | "success" | "error";
  message: string;
  cancelledRoutes?: number;
  releasedShipments?: number;
};
const dispatchRoles = ["super_admin", "operations_admin", "warehouse_staff", "dispatcher"] as const;
const proofMimeTypes = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

function text(formData: FormData, key: string, min: number, max: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length >= min && value.length <= max ? value : null;
}

function numericId(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  return /^\d+$/.test(value) ? value : null;
}

export async function createDispatchRunAction(_state: DispatchActionState, formData: FormData): Promise<DispatchActionState> {
  const profile = await requireProfile(dispatchRoles);
  const driverId = String(formData.get("driver_id") ?? "");
  if (!profile.organization_id || !/^[0-9a-f-]{36}$/i.test(driverId)) return { status: "error", message: "Select an active driver." };
  const supabase = await createClient();
  const { data: driver } = await supabase.from("profiles").select("id, full_name").eq("id", driverId).eq("organization_id", profile.organization_id).eq("role", "driver").eq("status", "active").maybeSingle();
  if (!driver) return { status: "error", message: "Selected driver is not active." };
  const routeDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date());
  const routeName = `${driver.full_name || "Driver"} · ${routeDate}`.slice(0, 100);
  const { data, error } = await supabase.from("dispatch_runs").insert({ organization_id: profile.organization_id, route_name: routeName, driver_id: driverId, created_by: profile.id }).select("id").single();
  if (error || !data) return { status: "error", message: "Dispatch route could not be created." };
  redirect(`/dispatch/${data.id}`);
}

export async function addDispatchAwbAction(_state: DispatchActionState, formData: FormData): Promise<DispatchActionState> {
  const profile = await requireProfile(dispatchRoles);
  const runId = numericId(formData, "run_id");
  const tracking = text(formData, "tracking_number", 3, 40)?.toUpperCase();
  if (!profile.organization_id || !runId || !tracking) return { status: "error", message: "Scan or enter a valid AWB." };
  const supabase = await createClient();
  const [{ data: run }, { data: shipment }] = await Promise.all([
    supabase.from("dispatch_runs").select("id, status").eq("id", Number(runId)).eq("organization_id", profile.organization_id).maybeSingle(),
    supabase.from("shipments").select("id, status, delivery_attempt_count, fourth_attempt_authorized").eq("tracking_number", tracking).eq("organization_id", profile.organization_id).is("deleted_at", null).maybeSingle(),
  ]);
  if (!run || run.status !== "draft") return { status: "error", message: "This route is not an open draft in your courier account." };
  if (!shipment) return { status: "error", message: `AWB ${tracking} was not found.` };
  const eligible = shipment.status === "at_warehouse" || (shipment.status === "return_initiated" && shipment.delivery_attempt_count === 3 && shipment.fourth_attempt_authorized);
  if (!eligible) return { status: "error", message: `AWB ${tracking} must be physically scanned into warehouse before dispatch.` };
  const { error } = await supabase.from("dispatch_run_items").insert({ run_id: Number(runId), shipment_id: shipment.id, added_by: profile.id });
  if (error?.code === "23505") return { status: "error", message: `AWB ${tracking} is already on an active route.` };
  if (error) return { status: "error", message: `AWB ${tracking} could not be added.` };
  revalidatePath(`/dispatch/${runId}`);
  revalidatePath("/dispatch");
  return { status: "success", message: `AWB ${tracking} added to route.` };
}

export async function removeDispatchAwbAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(dispatchRoles);
  const runId = numericId(formData, "run_id");
  const itemId = numericId(formData, "item_id");
  if (!profile.organization_id || !runId || !itemId) return;

  const supabase = await createClient();
  const { data: draftRun } = await supabase
    .from("dispatch_runs")
    .select("id")
    .eq("id", runId)
    .eq("organization_id", profile.organization_id)
    .eq("status", "draft")
    .maybeSingle();
  if (!draftRun) return;

  await supabase.from("dispatch_run_items").delete().eq("id", itemId).eq("run_id", runId);
  revalidatePath(`/dispatch/${runId}`);
  revalidatePath("/dispatch");
  revalidatePath("/dispatch/route-optimization");
  revalidatePath("/warehouse");
}

export async function cancelDraftRoutesAction(
  _state: CancelDraftRoutesState,
  formData: FormData,
): Promise<CancelDraftRoutesState> {
  const profile = await requireProfile(dispatchRoles);
  if (!profile.organization_id) {
    return { status: "error", message: "Organization could not be identified." };
  }

  const routeIds = Array.from(
    new Set(
      formData
        .getAll("route_ids")
        .map((value) => String(value))
        .filter((value) => /^\d+$/.test(value))
        .map(Number)
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  );

  if (routeIds.length === 0) {
    return { status: "error", message: "Select at least one draft route." };
  }
  if (routeIds.length > 100) {
    return { status: "error", message: "A maximum of 100 draft routes can be cancelled at once." };
  }

  const supabase = await createClient();
  const db = supabase as any;
  const { data: selectedRuns, error: selectedError } = await supabase
    .from("dispatch_runs")
    .select("id,status")
    .eq("organization_id", profile.organization_id)
    .in("id", routeIds);

  if (selectedError || !selectedRuns || selectedRuns.length !== routeIds.length) {
    return { status: "error", message: "One or more selected routes could not be found." };
  }

  const lockedRoutes = selectedRuns.filter((run) => run.status !== "draft");
  if (lockedRoutes.length > 0) {
    return {
      status: "error",
      message: "Only draft routes can be cancelled. With-driver and completed routes stay locked for delivery audit.",
    };
  }

  const cancelledAt = new Date().toISOString();
  const { data: cancelledRuns, error: cancelError } = await db
    .from("dispatch_runs")
    .update({
      status: "cancelled",
      cancelled_by: profile.id,
      cancelled_at: cancelledAt,
      updated_at: cancelledAt,
    })
    .eq("organization_id", profile.organization_id)
    .eq("status", "draft")
    .in("id", routeIds)
    .select("id");

  if (cancelError || !cancelledRuns || cancelledRuns.length === 0) {
    return { status: "error", message: "The selected draft routes could not be cancelled. Refresh and try again." };
  }

  const cancelledIds = cancelledRuns.map((run: { id: number }) => Number(run.id));
  const { count: releasedShipments } = await db
    .from("dispatch_run_items")
    .select("id", { count: "exact", head: true })
    .in("run_id", cancelledIds);

  revalidatePath("/dispatch");
  revalidatePath("/dispatch/route-optimization");
  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  for (const routeId of cancelledIds) revalidatePath(`/dispatch/${routeId}`);

  const cancelledCount = cancelledIds.length;
  const shipmentCount = releasedShipments ?? 0;
  return {
    status: "success",
    message: `${cancelledCount} draft route${cancelledCount === 1 ? "" : "s"} cancelled. ${shipmentCount} shipment${shipmentCount === 1 ? "" : "s"} released back to route planning.`,
    cancelledRoutes: cancelledCount,
    releasedShipments: shipmentCount,
  };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function mapAndOptimizeDispatchRun(
  supabase: SupabaseServerClient,
  runId: number,
  organizationId: string,
) {
  const { data: items } = await supabase
    .from("dispatch_run_items")
    .select("id, created_at, shipment_id, shipments(id, delivery_latitude, delivery_longitude, consignee_address, consignee_address_2, consignee_city, consignee_state_province, consignee_postal_code, consignee_country_code)")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  const allItems = (items ?? []) as any[];
  const routeStopByItem = new Map<
    number,
    { id: number; latitude: number; longitude: number }
  >();

  await geocodeInBatches(
    allItems,
    async (item) => {
      const shipment = Array.isArray(item.shipments)
        ? item.shipments[0]
        : item.shipments;
      if (!shipment) return;

      let point = parseCoordinatePair(
        shipment.delivery_latitude,
        shipment.delivery_longitude,
      );

      if (!point) {
        const address = buildShipmentAddress({
          address1: shipment.consignee_address,
          address2: shipment.consignee_address_2,
          city: shipment.consignee_city,
          stateProvince: shipment.consignee_state_province,
          postalCode: shipment.consignee_postal_code,
          countryCode: shipment.consignee_country_code,
        });
        const geocoded = await geocodeAddress(address);

        if (geocoded) {
          point = {
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
          };
          await supabase
            .from("shipments")
            .update({
              delivery_latitude: point.latitude,
              delivery_longitude: point.longitude,
            })
            .eq("id", shipment.id)
            .eq("organization_id", organizationId);
        }
      }

      if (point) {
        routeStopByItem.set(Number(item.id), {
          id: Number(item.id),
          ...point,
        });
      }
    },
    5,
  );

  const routeStops = allItems.flatMap((item) => {
    const stop = routeStopByItem.get(Number(item.id));
    return stop ? [stop] : [];
  });
  const optimizedIds = await optimizeRouteStops(routeStops);
  const optimizedSet = new Set(optimizedIds);
  const fallbackIds = allItems
    .map((item) => Number(item.id))
    .filter((itemId) => !optimizedSet.has(itemId));
  const sequence = [...optimizedIds, ...fallbackIds];
  const optimizedAt = new Date().toISOString();

  for (let offset = 0; offset < sequence.length; offset += 25) {
    await Promise.all(
      sequence.slice(offset, offset + 25).map((itemId, batchIndex) =>
        supabase
          .from("dispatch_run_items")
          .update({
            stop_sequence: offset + batchIndex + 1,
            optimized_at: optimizedSet.has(itemId) ? optimizedAt : null,
          })
          .eq("id", itemId)
          .eq("run_id", runId),
      ),
    );
  }

  return {
    totalStops: allItems.length,
    mappedStops: routeStops.length,
    unmappedStops: allItems.length - routeStops.length,
  };
}

export async function optimizeDispatchRunAction(
  formData: FormData,
): Promise<void> {
  const profile = await requireProfile(dispatchRoles);
  const runId = numericId(formData, "run_id");
  if (!runId || !profile.organization_id) {
    redirect("/dispatch?error=invalid");
  }

  const supabase = await createClient();
  const { data: run } = await supabase
    .from("dispatch_runs")
    .select("id")
    .eq("id", Number(runId))
    .eq("organization_id", profile.organization_id)
    .in("status", ["draft", "handed_over"])
    .maybeSingle();

  if (!run) {
    redirect(`/dispatch/${runId}?error=route_map`);
  }

  const summary = await mapAndOptimizeDispatchRun(
    supabase,
    Number(runId),
    profile.organization_id,
  );

  revalidatePath(`/dispatch/${runId}`);
  redirect(
    `/dispatch/${runId}?route_mapped=${summary.mappedStops}&route_unmapped=${summary.unmappedStops}`,
  );
}

export async function handoverDispatchRunAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(dispatchRoles);
  const runId = numericId(formData, "run_id");
  if (!runId || !profile.organization_id) redirect("/dispatch?error=invalid");
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("dispatch_runs")
    .select("id")
    .eq("id", Number(runId))
    .eq("organization_id", profile.organization_id)
    .eq("status", "draft")
    .maybeSingle();

  if (!run) redirect(`/dispatch/${runId}?error=handover`);

  const summary = await mapAndOptimizeDispatchRun(
    supabase,
    Number(runId),
    profile.organization_id,
  );

  const { data, error } = await supabase
    .from("dispatch_runs")
    .update({ status: "handed_over" })
    .eq("id", Number(runId))
    .eq("organization_id", profile.organization_id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/dispatch/${runId}?error=handover`);

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${runId}`);
  revalidatePath("/driver");
  revalidatePath("/shipments");
  redirect(
    `/dispatch/${runId}?handed_over=1&route_mapped=${summary.mappedStops}&route_unmapped=${summary.unmappedStops}`,
  );
}

export async function completeDeliveryAction(_state: DispatchActionState, formData: FormData): Promise<DispatchActionState> {
  const profile = await requireProfile(["driver"]);
  const runItemId = numericId(formData, "run_item_id");
  const outcome = String(formData.get("outcome") ?? "");
  const reason = outcome === "undelivered" ? text(formData, "undelivered_reason", 2, 80) : null;
  const notes = text(formData, "notes", 1, 500);
  const proof = formData.get("proof");
  if (!profile.organization_id || !runItemId || !["delivered", "undelivered"].includes(outcome) || (outcome === "undelivered" && !reason)) return { status: "error", message: "Complete the delivery result and reason." };
  if (!(proof instanceof File) || proof.size === 0 || proof.size > 5 * 1024 * 1024 || !proofMimeTypes.has(proof.type)) return { status: "error", message: "Attach a JPG, PNG or WebP proof photo up to 5 MB." };

  const supabase = await createClient();
  const { data: item } = await supabase.from("dispatch_run_items").select("id, shipment_id, dispatch_runs!inner(driver_id, status)").eq("id", runItemId).maybeSingle();
  const run = item?.dispatch_runs as unknown as { driver_id: string; status: string } | undefined;
  if (!item || !run || run.driver_id !== profile.id || run.status !== "handed_over") return { status: "error", message: "This delivery is not assigned to you or is already closed." };

  const extension = proofMimeTypes.get(proof.type)!;
  const proofPath = `${profile.organization_id}/${profile.id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("delivery-proofs").upload(proofPath, proof, { contentType: proof.type, upsert: false });
  if (uploadError) return { status: "error", message: "Proof photo could not be uploaded. Check connection and retry." };

  const { error } = await supabase.from("delivery_attempts").insert({ organization_id: profile.organization_id, run_item_id: Number(runItemId), shipment_id: item.shipment_id, attempt_number: 1, outcome, undelivered_reason: reason, notes, proof_path: proofPath, performed_by: profile.id });
  if (error) {
    await supabase.storage.from("delivery-proofs").remove([proofPath]);
    return { status: "error", message: error.message.includes("fourth attempt") ? error.message : "Delivery result could not be saved. Please retry." };
  }
  revalidatePath("/driver");
  revalidatePath(`/driver/deliveries/${runItemId}`);
  revalidatePath("/dispatch");
  revalidatePath("/shipments");
  redirect("/driver?updated=1");
}

export async function authorizeFourthAttemptAction(formData: FormData): Promise<void> {
  const profile = await requireProfile([...internalRoles, "shipper"]);
  const shipmentId = numericId(formData, "shipment_id");
  if (!shipmentId) redirect("/shipments?error=fourth");
  const supabase = await createClient();
  const { data, error } = await supabase.from("shipments").update({ fourth_attempt_authorized: true, fourth_attempt_authorized_at: new Date().toISOString(), fourth_attempt_authorized_by: profile.id }).eq("id", shipmentId).eq("status", "return_initiated").eq("delivery_attempt_count", 3).eq("fourth_attempt_authorized", false).select("id").maybeSingle();
  if (error || !data) redirect(`/shipments/${shipmentId}?error=fourth`);
  revalidatePath(`/shipments/${shipmentId}`);
  revalidatePath("/dispatch");
  redirect(`/shipments/${shipmentId}?fourth=1`);
}
