"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  canDeleteShipments,
  internalRoles,
} from "@/lib/roles";
import {
  paymentTypes,
  serviceTypes,
} from "@/lib/shipments";
import {
  resolveServiceZone,
  type ServiceZone,
} from "@/lib/service-zones";
import { createClient } from "@/lib/supabase/server";
import { calculateInternationalWeights, internationalPieceReference, splitInternationalAmount, splitInternationalWeight, type InternationalMode } from "@/lib/international-bulk";

export type CreateShipmentState = {
  message: string;
};

export type ArchiveShipmentState = {
  message: string;
};

function requiredText(
  formData: FormData,
  key: string,
  min: number,
  max: number,
) {
  const value = String(
    formData.get(key) ?? "",
  ).trim();

  return value.length >= min &&
    value.length <= max
    ? value
    : null;
}

function optionalText(
  formData: FormData,
  key: string,
  max: number,
) {
  const value = String(
    formData.get(key) ?? "",
  ).trim();

  return value && value.length <= max
    ? value
    : null;
}

export async function createShipmentAction(
  _previousState: CreateShipmentState,
  formData: FormData,
): Promise<CreateShipmentState> {
  const profile = await requireProfile([
    ...internalRoles,
    "shipper",
  ]);

  if (!profile.organization_id) {
    return {
      message:
        "Your account is not linked to an organization.",
    };
  }

  const senderName = requiredText(
    formData,
    "sender_name",
    2,
    120,
  );

  const senderPhone = requiredText(
    formData,
    "sender_phone",
    7,
    20,
  );

  const senderAddress = requiredText(
    formData,
    "sender_address",
    5,
    500,
  );

  const senderCity = requiredText(
    formData,
    "sender_city",
    2,
    80,
  );

  const consigneeName = requiredText(
    formData,
    "consignee_name",
    2,
    120,
  );

  const consigneePhone = requiredText(
    formData,
    "consignee_phone",
    7,
    20,
  );

  const consigneeAddress = requiredText(
    formData,
    "consignee_address",
    5,
    500,
  );

  const consigneeCity = requiredText(
    formData,
    "consignee_city",
    2,
    80,
  );

  const parcelDescription = requiredText(
    formData,
    "parcel_description",
    2,
    500,
  );

  const senderCountryCode = String(
    formData.get("sender_country_code") ?? "",
  )
    .trim()
    .toUpperCase();

  const consigneeCountryCode = String(
    formData.get("consignee_country_code") ?? "",
  )
    .trim()
    .toUpperCase();

  const senderPostalCode = optionalText(
    formData,
    "sender_postal_code",
    30,
  );

  const consigneePostalCode = optionalText(
    formData,
    "consignee_postal_code",
    30,
  );

  const consigneeArea = optionalText(
    formData,
    "consignee_area",
    120,
  );

  const serviceType = String(
    formData.get("service_type") ?? "",
  );

  const paymentType = String(
    formData.get("payment_type") ?? "",
  );

  const pieces = Number(
    formData.get("pieces"),
  );

  const weightKg = Number(
    formData.get("weight_kg"),
  );

  const submittedCod = Number(formData.get("cod_amount"));
  const isInternational = formData.get("is_international") === "1";
  const transportModeText = String(formData.get("transport_mode") ?? "").toLowerCase();
  const transportMode = transportModeText === "air" || transportModeText === "sea" ? transportModeText as InternationalMode : null;
  const lengthCm = Number(formData.get("length_cm"));
  const widthCm = Number(formData.get("width_cm"));
  const heightCm = Number(formData.get("height_cm"));
  const declaredValue = isInternational ? Number(formData.get("declared_value")) : 0;
  const hsCodeValue = String(formData.get("hs_code") ?? "").trim();
  const hsCode = hsCodeValue || null;

  if (
    !senderName ||
    !senderPhone ||
    !senderAddress ||
    !senderCity ||
    !consigneeName ||
    !consigneePhone ||
    !consigneeAddress ||
    !consigneeCity ||
    !parcelDescription ||
    !/^[A-Z]{2}$/.test(senderCountryCode) ||
    !/^[A-Z]{2}$/.test(consigneeCountryCode) ||
    !serviceTypes.includes(
      serviceType as (typeof serviceTypes)[number],
    ) ||
    !paymentTypes.includes(
      paymentType as (typeof paymentTypes)[number],
    ) ||
    !Number.isInteger(pieces) ||
    pieces < 1 ||
    pieces > 999 ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    weightKg > 1000 ||
    !Number.isFinite(submittedCod) ||
    submittedCod < 0 ||
    submittedCod > 9999999999
  ) {
    return {
      message:
        "Please check the required shipment details and try again.",
    };
  }

  if (!isInternational && senderCountryCode !== consigneeCountryCode) {
    return { message: "Sender and destination must be in the same country. Use the International shipment tab for cross-border bookings." };
  }

  if (isInternational) {
    if (senderCountryCode === consigneeCountryCode) {
      return { message: "International shipments must have different sender and destination countries." };
    }
    if (
      !transportMode ||
      ![lengthCm, widthCm, heightCm].every((value) => Number.isFinite(value) && value > 0 && value <= 10000) ||
      !Number.isFinite(declaredValue) ||
      declaredValue < 0 ||
      declaredValue > 9999999999 ||
      (hsCode !== null && !/^[0-9]{4,10}$/.test(hsCode))
    ) {
      return { message: "Enter Air or Sea mode, positive dimensions up to 10,000 cm, a valid goods value, and an optional 4–10 digit HS code." };
    }
  }

  const supabase = await createClient();

  /*
   * Resolve shipment currency on the server.
   * Never trust a browser-submitted currency value.
   */
  const [
    { data: baseCurrencyRow },
    { data: organizationSettings },
  ] = await Promise.all([
    supabase
      .from("organization_currencies")
      .select("currency_code")
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq("is_base", true)
      .eq("is_active", true)
      .maybeSingle(),

    supabase
      .from("organization_settings")
      .select("currency")
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .maybeSingle(),
  ]);

  /*
   * Final shipment currency is resolved after destination
   * country validation. Organization base currency remains
   * a safe fallback.
   */
  const organizationBaseCurrency =
    baseCurrencyRow?.currency_code ||
    organizationSettings?.currency ||
    "AED";

  /*
   * Validate tenant markets.
   * Existing pre-global tenants may have no mapping yet,
   * therefore UAE remains a temporary backward-compatible fallback.
   */
  const { data: configuredCountries } =
    await supabase
      .from("organization_countries")
      .select("country_code")
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq("is_active", true);

  const allowedCountries =
    configuredCountries &&
    configuredCountries.length > 0
      ? configuredCountries.map(
          (row) => row.country_code,
        )
      : ["AE"];

  if (
    !allowedCountries.includes(senderCountryCode) ||
    !allowedCountries.includes(consigneeCountryCode)
  ) {
    return {
      message:
        "This country is not enabled for your courier company.",
    };
  }

  const { data: countryRows } =
    await supabase
      .from("countries")
      .select(`
        code,
        name,
        location_strategy,
        postal_code_label
      `)
      .in("code", [
        senderCountryCode,
        consigneeCountryCode,
      ])
      .eq("is_active", true);

  const destinationCountry =
    (countryRows ?? []).find(
      (country) =>
        country.code ===
        consigneeCountryCode,
    );

  if (!destinationCountry) {
    return {
      message:
        "The delivery country is not available.",
    };
  }

  const { data: destinationCurrency } =
    await supabase
      .from("countries")
      .select("default_currency_code")
      .eq("code", consigneeCountryCode)
      .maybeSingle();

  const shipmentCurrency =
    destinationCurrency?.default_currency_code ||
    organizationBaseCurrency;

  if (
    [
      "postal_code",
      "zip_code",
      "postcode",
    ].includes(
      destinationCountry.location_strategy,
    ) &&
    !consigneePostalCode
  ) {
    return {
      message:
        `${destinationCountry.postal_code_label || "Postal Code"} is required for ${destinationCountry.name}.`,
    };
  }

  /*
   * Resolve destination service zone.
   */
  const { data: zoneData } =
    await supabase
      .from("service_zones")
      .select(`
        id,
        name,
        zone_type,
        postal_prefix,
        postal_from,
        postal_to,
        city,
        district,
        area
      `)
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq(
        "country_code",
        consigneeCountryCode,
      )
      .eq("is_active", true);

  const zones =
    (zoneData ?? []) as ServiceZone[];

  const matchedZone =
    resolveServiceZone(
      zones,
      consigneePostalCode,
      consigneeCity,
      consigneeArea,
    );

  /*
   * If zones exist, destination must match one.
   * If no zones are configured yet, booking remains
   * possible for backward compatibility.
   */
  if (
    zones.length > 0 &&
    !matchedZone
  ) {
    return {
      message:
        "This delivery location is outside your configured service zones.",
    };
  }

  let shipperId = profile.id;

  if (profile.role !== "shipper") {
    const selectedShipperId = String(
      formData.get("shipper_id") ?? "",
    );

    if (
      !/^[0-9a-f-]{36}$/i.test(
        selectedShipperId,
      )
    ) {
      return {
        message:
          "Select an active shipper before booking the shipment.",
      };
    }

    const {
      data: selectedShipper,
      error: shipperError,
    } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", selectedShipperId)
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq("role", "shipper")
      .eq("status", "active")
      .maybeSingle();

    if (
      shipperError ||
      !selectedShipper
    ) {
      return {
        message:
          "The selected shipper is not active or does not belong to your organization.",
      };
    }

    shipperId = selectedShipper.id;
  }

  const pieceWeights = isInternational ? splitInternationalWeight(weightKg, pieces) : null;
  if (isInternational && !pieceWeights) {
    return { message: "Total actual weight must be at least 0.001 kg per bag so every AWB has a positive weight." };
  }
  const pieceValues = isInternational ? splitInternationalAmount(declaredValue, pieces) : [];
  const pieceCod = isInternational ? splitInternationalAmount(paymentType === "cod" ? submittedCod : 0, pieces) : [];
  const commonShipmentValues = {
    organization_id: profile.organization_id,
    currency: shipmentCurrency,
    transport_mode: isInternational ? transportMode : null,
    hs_code: isInternational ? hsCode : null,
    shipper_id: shipperId,
    created_by: profile.id,
    service_type: serviceType,
    payment_type: paymentType,
    sender_name: senderName,
    sender_phone: senderPhone,
    sender_address: senderAddress,
    sender_city: senderCity,
    sender_country_code: senderCountryCode,
    sender_postal_code: senderPostalCode,
    consignee_name: consigneeName,
    consignee_phone: consigneePhone,
    consignee_alt_phone: optionalText(formData, "consignee_alt_phone", 20),
    consignee_address: consigneeAddress,
    consignee_city: consigneeCity,
    consignee_area: consigneeArea,
    consignee_landmark: optionalText(formData, "consignee_landmark", 200),
    consignee_country_code: consigneeCountryCode,
    consignee_postal_code: consigneePostalCode,
    service_zone_id: matchedZone?.id ?? null,
    service_zone_name: matchedZone?.name ?? null,
    parcel_description: parcelDescription,
    delivery_instructions: optionalText(formData, "delivery_instructions", 500),
  };
  const baseReference = optionalText(formData, "reference_number", 80);
  const insertRows = isInternational
    ? Array.from({ length: pieces }, (_, pieceIndex) => {
        const weights = calculateInternationalWeights(transportMode!, lengthCm, widthCm, heightCm, 1, pieceWeights![pieceIndex]);
        return {
          ...commonShipmentValues,
          reference_number: internationalPieceReference(baseReference, pieceIndex, pieces),
          pieces: 1,
          weight_kg: pieceWeights![pieceIndex],
          declared_value: pieceValues[pieceIndex],
          cod_amount: pieceCod[pieceIndex],
          length_cm: lengthCm,
          width_cm: widthCm,
          height_cm: heightCm,
          volume_cbm: weights.volumeCbm,
          volumetric_weight_kg: weights.volumetricWeightKg,
          chargeable_weight_kg: weights.chargeableWeightKg,
          chargeable_wm: weights.chargeableWm,
        };
      })
    : [{
        ...commonShipmentValues,
        reference_number: baseReference,
        pieces,
        weight_kg: weightKg,
        declared_value: 0,
        cod_amount: paymentType === "cod" ? submittedCod : 0,
        length_cm: null,
        width_cm: null,
        height_cm: null,
        volume_cbm: null,
        volumetric_weight_kg: null,
        chargeable_weight_kg: null,
        chargeable_wm: null,
      }];

  const { data, error } = await supabase
    .from("shipments")
    .insert(insertRows)
    .select("id, tracking_number");

  if (error || !data || data.length !== insertRows.length) {
    if (error?.code === "23505") {
      return {
        message: "This reference number is already used for another shipment.",
      };
    }
    return {
      message: "Shipment could not be booked. Please review the details and retry.",
    };
  }

  revalidatePath("/shipments");
  revalidatePath("/dashboard");
  if (isInternational && data.length > 1) {
    redirect("/shipments?generated=international&ids=" + data.map((row) => row.id).join(","));
  }

  redirect(`/shipments/${data[0].id}?created=1`);
}

export async function archiveShipmentAction(
  _previousState: ArchiveShipmentState,
  formData: FormData,
): Promise<ArchiveShipmentState> {
  const profile =
    await requireProfile(internalRoles);

  if (
    !profile.organization_id ||
    !canDeleteShipments(profile)
  ) {
    return {
      message:
        "You do not have permission to archive AWBs.",
    };
  }

  const shipmentId = String(
    formData.get("shipment_id") ?? "",
  );

  const reason = requiredText(
    formData,
    "delete_reason",
    3,
    500,
  );

  if (
    !/^\d+$/.test(shipmentId) ||
    !reason
  ) {
    return {
      message:
        "Enter an archive reason between 3 and 500 characters.",
    };
  }

  const supabase = await createClient();

  const { data, error } =
    await supabase
      .from("shipments")
      .update({
        deleted_at:
          new Date().toISOString(),
        deleted_by: profile.id,
        delete_reason: reason,
      })
      .eq("id", shipmentId)
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq("status", "booked")
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

  if (error || !data) {
    return {
      message:
        error?.message ||
        "Only an active booked AWB can be archived.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/shipments");

  redirect(
    "/shipments?archived=1",
  );
}
