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
import { createAdminClient } from "@/lib/supabase/admin";

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

export type ThreePLRateQuote = {
  carrierId: string;
  carrierName: string;
  cardName: string;
  service: string;
  origin: string;
  zone: string;
  currency: string;
  amount: number;
  weightKg: number;
  rateNotes: string | null;
  margin: number | null;
};

export type ThreePLRateCheckState = {
  status: "idle" | "success" | "error";
  message: string;
  quotes: ThreePLRateQuote[];
  unmatchedCards: string[];
  trackingNumber: string;
  shipperName: string;
  weightKg: number | null;
  weightSource: string;
  billedAmount: number | null;
  billedCurrency: string | null;
};

const initialRateCheck: ThreePLRateCheckState = {
  status: "idle", message: "", quotes: [], unmatchedCards: [], trackingNumber: "",
  shipperName: "", weightKg: null, weightSource: "", billedAmount: null, billedCurrency: null,
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

async function fetchRateRows(admin: ReturnType<typeof createAdminClient>, cardId: string, services: string[], zones: string[]) {
  const rows: Array<{ service_code: string; origin_terminal: string; zone_code: string; weight_value: number; weight_unit: "kg" | "lb"; base_rate: number; fuel_surcharge_pct: number; rate_basis: "weight_break" | "minimum_per_package" | "per_weight_unit" }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("carrier_rate_grid")
      .select("service_code,origin_terminal,zone_code,weight_value,weight_unit,base_rate,fuel_surcharge_pct,rate_basis")
      .eq("rate_card_id", cardId).in("service_code", services).in("zone_code", zones)
      .order("weight_value").range(from, from + 999);
    if (error) throw new Error("Rate rows could not be checked.");
    rows.push(...(data ?? []) as typeof rows);
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

function estimateRate(rows: Awaited<ReturnType<typeof fetchRateRows>>, weightKg: number) {
  if (!rows.length) return null;
  const lbs = weightKg * 2.2046226218;
  const breaks = rows.filter((row) => row.rate_basis === "weight_break");
  if (breaks.length) {
    const matching = breaks.map((row) => ({ row, weight: row.weight_unit === "lb" ? lbs : weightKg }))
      .filter(({ row, weight }) => Number(row.weight_value) + 0.0001 >= weight)
      .sort((a, b) => Number(a.row.weight_value) - Number(b.row.weight_value))[0];
    if (matching) return matching.row.base_rate * (1 + matching.row.fuel_surcharge_pct / 100);
  }
  const perUnit = rows.filter((row) => row.rate_basis === "per_weight_unit")
    .map((row) => ({ row, weight: row.weight_unit === "lb" ? lbs : weightKg }))
    .filter(({ row, weight }) => Number(row.weight_value) <= weight + 0.0001)
    .sort((a, b) => Number(b.row.weight_value) - Number(a.row.weight_value))[0];
  if (perUnit) {
    const floor = Math.max(0, ...rows.filter((row) => row.rate_basis === "minimum_per_package").map((row) => Number(row.base_rate)));
    return Math.max(floor, perUnit.weight * Number(perUnit.row.base_rate)) * (1 + perUnit.row.fuel_surcharge_pct / 100);
  }
  return null;
}

export async function compareThreePLRatesAction(_state: ThreePLRateCheckState, formData: FormData): Promise<ThreePLRateCheckState> {
  const profile = await requireProfile(roles);
  if (!profile.organization_id) return { ...initialRateCheck, status: "error", message: "Organization is not configured." };
  const tracking = value(formData, "tracking_number").toUpperCase();
  if (!tracking) return { ...initialRateCheck, status: "error", message: "Select or scan a shipment first." };
  const db = await createClient();
  const { data: shipment, error: shipmentError } = await db.from("shipments")
    .select("id,tracking_number,shipper_id,consignee_country_code,consignee_postal_code,weight_kg,chargeable_weight_kg,pieces,service_zone_id,service_type,payment_type")
    .eq("organization_id", profile.organization_id).eq("tracking_number", tracking).is("deleted_at", null).maybeSingle();
  if (shipmentError || !shipment) return { ...initialRateCheck, status: "error", trackingNumber: tracking, message: "Shipment was not found. Confirm its AWB and try again." };
  if (!shipment.shipper_id) return { ...initialRateCheck, status: "error", trackingNumber: tracking, message: "This shipment has no customer account mapped, so its customer-specific 3PL cards cannot be checked." };
  const enteredWeight = value(formData, "confirmed_weight_kg");
  const weightKg = Number(enteredWeight || shipment.chargeable_weight_kg || shipment.weight_kg);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 1000) return { ...initialRateCheck, status: "error", trackingNumber: tracking, message: "Enter a confirmed parcel weight greater than 0 and no more than 1000 kg." };
  const weightSource = enteredWeight ? "weight confirmed at 3PL handover" : shipment.chargeable_weight_kg ? "recorded chargeable weight" : "actual shipment weight (no chargeable weight recorded)";
  const admin = createAdminClient();
  const [{ data: shipper }, { data: cards, error: cardsError }] = await Promise.all([
    admin.from("profiles").select("full_name,email").eq("id", shipment.shipper_id).eq("organization_id", profile.organization_id).maybeSingle(),
    admin.from("carrier_rate_cards").select("id,carrier_id,card_name,country_code,currency,rate_notes,effective_from")
      .eq("organization_id", profile.organization_id).eq("shipper_id", shipment.shipper_id).eq("country_code", (shipment.consignee_country_code || "").toUpperCase())
      .eq("is_active", true).eq("import_status", "active").lte("effective_from", new Date().toISOString().slice(0, 10)),
  ]);
  if (cardsError) return { ...initialRateCheck, status: "error", trackingNumber: tracking, message: "The saved rate cards could not be loaded. Please retry." };
  const shipperName = shipper?.full_name || shipper?.email || "Customer account";
  const [defaultRateResult, zoneRateResult] = await Promise.all([
    admin.from("shipper_rates").select("delivery_rate,currency,effective_from,effective_to").eq("organization_id", profile.organization_id).eq("shipper_id", shipment.shipper_id).lte("effective_from", new Date().toISOString()).or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`).order("effective_from", { ascending: false }).limit(1).maybeSingle(),
    shipment.service_zone_id ? admin.from("shipper_zone_rates").select("delivery_rate,currency,weight_from_kg,weight_to_kg,additional_kg_rate,cod_fee,effective_from,effective_to").eq("organization_id", profile.organization_id).eq("shipper_id", shipment.shipper_id).eq("service_zone_id", shipment.service_zone_id).eq("service_type", shipment.service_type).eq("is_active", true).lte("weight_from_kg", Number(shipment.weight_kg)).lte("effective_from", new Date().toISOString()).or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`).order("weight_from_kg", { ascending: false }).order("effective_from", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (defaultRateResult.error || zoneRateResult.error) return { ...initialRateCheck, status: "error", trackingNumber: tracking, message: "Customer billing rates could not be checked. Please retry." };
  let billedAmount: number | null = null;
  let billedCurrency: string | null = null;
  if (zoneRateResult.data) {
    const rate = zoneRateResult.data;
    const extra = rate.weight_to_kg && Number(shipment.weight_kg) > Number(rate.weight_to_kg) ? Math.ceil(Number(shipment.weight_kg) - Number(rate.weight_to_kg)) * Number(rate.additional_kg_rate) : 0;
    billedAmount = Number(rate.delivery_rate) + extra + (shipment.payment_type === "cod" ? Number(rate.cod_fee) : 0);
    billedCurrency = rate.currency;
  } else if (defaultRateResult.data) {
    billedAmount = Number(defaultRateResult.data.delivery_rate);
    billedCurrency = defaultRateResult.data.currency;
  }
  if (!cards?.length) return { ...initialRateCheck, status: "success", trackingNumber: tracking, shipperName, weightKg, weightSource, billedAmount, billedCurrency, message: `No active rate card is mapped to ${shipperName} for ${(shipment.consignee_country_code || "unknown destination").toUpperCase()}.`, quotes: [], unmatchedCards: [] };
  const postal = (shipment.consignee_postal_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const prefixes = postal.length >= 3 ? Array.from({ length: postal.length - 2 }, (_, i) => postal.slice(0, i + 3)) : [];
  if (!prefixes.length) return { ...initialRateCheck, status: "success", trackingNumber: tracking, shipperName, weightKg, weightSource, billedAmount, billedCurrency, message: "Shipment has no usable destination postal code; saved postal-zone cards cannot be compared.", quotes: [], unmatchedCards: cards.map((card) => card.card_name) };
  const carrierIds = [...new Set(cards.map((card) => card.carrier_id))];
  const { data: carrierRows, error: carrierError } = await admin.from("third_party_carriers").select("id,name").eq("organization_id", profile.organization_id).in("id", carrierIds);
  if (carrierError) return { ...initialRateCheck, status: "error", trackingNumber: tracking, message: "Carrier names could not be loaded. Please retry." };
  const carrierNames = new Map((carrierRows ?? []).map((row) => [row.id, row.name]));
  const quotes: ThreePLRateQuote[] = [];
  const unmatchedCards: string[] = [];
  if (Number(shipment.pieces) !== 1) unmatchedCards.push("Multi-piece shipment: per-piece weights are not stored, so package tariffs were not compared.");
  else for (const card of cards) {
    const { data: maps, error: mapError } = await admin.from("carrier_postal_zone_map")
      .select("service_code,origin_terminal,postal_code,zone_code").eq("rate_card_id", card.id).in("postal_code", prefixes);
    if (mapError) return { ...initialRateCheck, status: "error", trackingNumber: tracking, message: "Postal-zone mappings could not be checked. Please retry." };
    if (!maps?.length) { unmatchedCards.push(`${card.card_name}: no postal-zone mapping for ${postal || "destination"}.`); continue; }
    const longest = Math.max(...maps.map((row) => row.postal_code.length));
    const preciseMaps = maps.filter((row) => row.postal_code.length === longest);
    const serviceCodes = [...new Set(preciseMaps.map((row) => row.service_code))];
    const zoneCodes = [...new Set(preciseMaps.map((row) => row.zone_code))];
    const rows = await fetchRateRows(admin, card.id, serviceCodes, zoneCodes);
    const quoteCountBeforeCard = quotes.length;
    for (const map of preciseMaps) {
      const sameRateKey = rows.filter((row) => row.service_code === map.service_code && row.zone_code === map.zone_code);
      const exactOrigin = sameRateKey.filter((row) => row.origin_terminal === map.origin_terminal);
      const matchingRows = exactOrigin.length ? exactOrigin : sameRateKey.filter((row) => row.origin_terminal === "ANY");
      const amount = estimateRate(matchingRows, weightKg);
      if (amount === null) continue;
      quotes.push({ carrierId: card.carrier_id, carrierName: carrierNames.get(card.carrier_id) || "3PL", cardName: card.card_name, service: map.service_code, origin: map.origin_terminal, zone: map.zone_code, currency: card.currency, amount, weightKg, rateNotes: card.rate_notes, margin: billedAmount !== null && billedCurrency === card.currency ? billedAmount - amount : null });
    }
    if (quotes.length === quoteCountBeforeCard) unmatchedCards.push(`${card.card_name}: no matching rate row for this weight and postal zone.`);
  }
  // A carrier may have multiple mapped cards or services (for example Ground/Air).
  // Show one comparable option per carrier: prefer the customer's billing currency,
  // then choose that carrier's lowest applicable tariff.
  const bestQuoteByCarrier = new Map<string, ThreePLRateQuote>();
  for (const quote of quotes) {
    const current = bestQuoteByCarrier.get(quote.carrierId);
    const quoteMatchesBilling = Boolean(billedCurrency && quote.currency === billedCurrency);
    const currentMatchesBilling = Boolean(billedCurrency && current?.currency === billedCurrency);
    if (!current || (quoteMatchesBilling && !currentMatchesBilling) || (quoteMatchesBilling === currentMatchesBilling && quote.amount < current.amount)) {
      bestQuoteByCarrier.set(quote.carrierId, quote);
    }
  }
  const bestQuotes = [...bestQuoteByCarrier.values()].sort((a, b) => a.amount - b.amount);
  return { ...initialRateCheck, status: "success", trackingNumber: tracking, shipperName, weightKg, weightSource, billedAmount, billedCurrency,
    message: bestQuotes.length ? `${bestQuotes.length} carrier${bestQuotes.length === 1 ? "" : "s"} matched. Showing the lowest applicable rate per carrier.` : "No applicable rates were found in the mapped cards.", quotes: bestQuotes, unmatchedCards };
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


