"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function createReverseOrderAction(
  formData: FormData,
) {
  const profile = await requireProfile([
    ...internalRoles,
    "shipper",
  ]);

  if (!profile.organization_id) {
    redirect("/reverse-exchange/new?error=organization");
  }

  const orderType = text(formData, "order_type");
  const originalAwb = text(
    formData,
    "original_awb",
  ).toUpperCase();

  const replacementAwb = text(
    formData,
    "replacement_awb",
  ).toUpperCase();

  const reason = text(formData, "reason");
  const expectedItemDescription = text(
    formData,
    "expected_item_description",
  );

  const expectedPieces = Math.max(
    1,
    Number(text(formData, "expected_pieces")) || 1,
  );

  const customerNotes = text(
    formData,
    "customer_notes",
  );

  if (
    !["reverse_pickup", "exchange"].includes(
      orderType,
    ) ||
    !originalAwb
  ) {
    redirect("/reverse-exchange/new?error=missing");
  }

  if (
    orderType === "exchange" &&
    !replacementAwb
  ) {
    redirect(
      "/reverse-exchange/new?error=replacement",
    );
  }

  const supabase = await createClient();

  const { data: original } = await supabase
    .from("shipments")
    .select(`
      id,
      organization_id,
      shipper_id,
      created_by,
      tracking_number,
      status,
      consignee_name,
      consignee_phone,
      consignee_alt_phone,
      consignee_address,
      consignee_city,
      consignee_area,
      consignee_country_code,
      consignee_postal_code,
      sender_name,
      sender_phone,
      sender_address,
      sender_city,
      sender_country_code,
      sender_postal_code,
      service_zone_id,
      service_zone_name,
      parcel_description,
      pieces,
      weight_kg,
      service_type,
      currency
    `)
    .eq(
      "organization_id",
      profile.organization_id,
    )
    .eq("tracking_number", originalAwb)
    .is("deleted_at", null)
    .maybeSingle();

  if (!original) {
    redirect(
      "/reverse-exchange/new?error=original_not_found",
    );
  }

  if (original.status !== "delivered") {
    redirect(
      "/reverse-exchange/new?error=not_delivered",
    );
  }

  if (
    profile.role === "shipper" &&
    original.shipper_id !== profile.id
  ) {
    redirect(
      "/reverse-exchange/new?error=original_not_found",
    );
  }

  let replacementId: number | null = null;

  if (orderType === "exchange") {
    const { data: replacement } = await supabase
      .from("shipments")
      .select(`
        id,
        shipper_id,
        status,
        tracking_number
      `)
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq("tracking_number", replacementAwb)
      .is("deleted_at", null)
      .maybeSingle();

    if (!replacement) {
      redirect(
        "/reverse-exchange/new?error=replacement_not_found",
      );
    }

    if (
      replacement.shipper_id !==
      original.shipper_id
    ) {
      redirect(
        "/reverse-exchange/new?error=replacement_shipper",
      );
    }

    replacementId = replacement.id;
  }

  const shipperId =
    original.shipper_id ||
    original.created_by;

  if (!shipperId) {
    redirect(
      "/reverse-exchange/new?error=shipper",
    );
  }

  /*
   * Step 1:
   * Create the reverse/exchange case.
   * REV-/EXC- is the operational case number.
   */
  const {
    data: reverseOrder,
    error: reverseOrderError,
  } = await supabase
    .from("reverse_orders")
    .insert({
      organization_id:
        profile.organization_id,

      order_type: orderType,

      shipper_id: shipperId,

      original_shipment_id:
        original.id,

      replacement_shipment_id:
        replacementId,

      customer_name:
        original.consignee_name,

      customer_phone:
        original.consignee_phone,

      customer_alt_phone:
        original.consignee_alt_phone || null,

      pickup_address:
        original.consignee_address,

      pickup_city:
        original.consignee_city,

      pickup_area:
        original.consignee_area || null,

      country_code:
        original.consignee_country_code || null,

      postal_code:
        original.consignee_postal_code || null,

      service_zone_id:
        original.service_zone_id || null,

      service_zone_name:
        original.service_zone_name || null,

      expected_item_description:
        expectedItemDescription ||
        original.parcel_description ||
        null,

      expected_pieces:
        expectedPieces ||
        original.pieces ||
        1,

      reason: reason || null,

      customer_notes:
        customerNotes || null,
    })
    .select("id, reverse_number")
    .single();

  if (
    reverseOrderError ||
    !reverseOrder
  ) {
    console.error(
      "Reverse / Exchange creation failed:",
      reverseOrderError,
    );

    redirect(
      "/reverse-exchange/new?error=create",
    );
  }

  /*
   * Step 2:
   * Create the physical reverse parcel.
   *
   * Reverse direction:
   * Customer (original consignee) -> Seller (original sender)
   *
   * DB tracking trigger generates:
   * tenant prefix + R + date + sequence
   * e.g. BPR26081610000045.
   */
  const {
    data: reverseShipment,
    error: reverseShipmentError,
  } = await supabase
    .from("shipments")
    .insert({
      organization_id:
        profile.organization_id,

      shipper_id: shipperId,
      created_by: profile.id,

      shipment_flow: "reverse_pickup",
      reverse_order_id: reverseOrder.id,

      reference_number:
        reverseOrder.reverse_number,

      service_type:
        original.service_type || "next_day",

      payment_type: "prepaid",
      cod_amount: 0,

      currency:
        original.currency || "AED",

      sender_name:
        original.consignee_name,

      sender_phone:
        original.consignee_phone,

      sender_address:
        original.consignee_address,

      sender_city:
        original.consignee_city,

      sender_country_code:
        original.consignee_country_code || null,

      sender_postal_code:
        original.consignee_postal_code || null,

      consignee_name:
        original.sender_name,

      consignee_phone:
        original.sender_phone,

      consignee_address:
        original.sender_address,

      consignee_city:
        original.sender_city,

      consignee_country_code:
        original.sender_country_code || null,

      consignee_postal_code:
        original.sender_postal_code || null,

      pieces:
        expectedPieces ||
        original.pieces ||
        1,

      weight_kg:
        original.weight_kg || 1,

      parcel_description:
        expectedItemDescription ||
        original.parcel_description ||
        "Reverse pickup",

      delivery_instructions:
        [
          `Reverse case ${reverseOrder.reverse_number}`,
          reason ? `Reason: ${reason}` : null,
          customerNotes || null,
        ]
          .filter(Boolean)
          .join(" · "),
    })
    .select(
      "id, tracking_number",
    )
    .single();

  if (
    reverseShipmentError ||
    !reverseShipment
  ) {
    console.error(
      "Reverse AWB creation failed:",
      reverseShipmentError,
    );

    redirect(
      `/reverse-exchange?error=reverse_awb&case=${reverseOrder.id}`,
    );
  }

  /*
   * Step 3:
   * Link reverse case back to the generated physical AWB.
   */
  const { error: linkError } =
    await supabase
      .from("reverse_orders")
      .update({
        reverse_shipment_id:
          reverseShipment.id,
      })
      .eq("id", reverseOrder.id)
      .eq(
        "organization_id",
        profile.organization_id,
      );

  if (linkError) {
    console.error(
      "Reverse AWB link failed:",
      linkError,
    );

    redirect(
      `/reverse-exchange?error=reverse_link&case=${reverseOrder.id}`,
    );
  }

  revalidatePath("/reverse-exchange");
  revalidatePath("/shipments");

  redirect(
    `/reverse-exchange?created=1&reverse_awb=${encodeURIComponent(
      reverseShipment.tracking_number,
    )}`,
  );
}
