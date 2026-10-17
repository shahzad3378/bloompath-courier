"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { manifestRoles, parseManifestAwbs, validManifestId } from "@/lib/three-pl-manifests";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ManifestRateQuote = { carrierId: string; carrierName: string; service: string; amount: number; currency: string; margin: number | null };
type ManifestShipmentRates = { trackingNumber: string; customer: string; billedAmount: number | null; billedCurrency: string | null; quotes: ManifestRateQuote[]; note: string | null };
export type ManifestRateState = { status: "idle" | "success" | "error"; message: string; awbsKey: string; shipments: ManifestShipmentRates[] };
const emptyManifestRates: ManifestRateState = { status: "idle", message: "", awbsKey: "", shipments: [] };
type RateRow = { rate_card_id: string; service_code: string; origin_terminal: string; zone_code: string; weight_value: number; weight_unit: "kg" | "lb"; base_rate: number; fuel_surcharge_pct: number; rate_basis: "weight_break" | "minimum_per_package" | "per_weight_unit" };
type DefaultShipRate = { shipper_id: string; delivery_rate: number; currency: string; effective_from: string; effective_to: string | null };
type CustomerZoneRate = { shipper_id: string; service_zone_id: number; service_type: string; delivery_rate: number; currency: string; weight_from_kg: number; weight_to_kg: number | null; additional_kg_rate: number; cod_fee: number; effective_from: string; effective_to: string | null; is_active: boolean };
function postalPrefixes(postal: string) { const normalized = postal.toUpperCase().replace(/[^A-Z0-9]/g, ""); return normalized.length >= 3 ? Array.from({ length: normalized.length - 2 }, (_, index) => normalized.slice(0, index + 3)) : []; }
function estimateCarrierRate(rows: RateRow[], weightKg: number) {
  const lbs = weightKg * 2.2046226218;
  const breaks = rows.filter((row) => row.rate_basis === "weight_break").map((row) => ({ row, weight: row.weight_unit === "lb" ? lbs : weightKg })).filter(({ row, weight }) => Number(row.weight_value) + 0.0001 >= weight).sort((a, b) => Number(a.row.weight_value) - Number(b.row.weight_value));
  if (breaks[0]) return Number(breaks[0].row.base_rate) * (1 + Number(breaks[0].row.fuel_surcharge_pct) / 100);
  const perUnit = rows.filter((row) => row.rate_basis === "per_weight_unit").map((row) => ({ row, weight: row.weight_unit === "lb" ? lbs : weightKg })).filter(({ row, weight }) => Number(row.weight_value) <= weight + 0.0001).sort((a, b) => Number(b.row.weight_value) - Number(a.row.weight_value))[0];
  if (perUnit) { const floor = Math.max(0, ...rows.filter((row) => row.rate_basis === "minimum_per_package").map((row) => Number(row.base_rate))); return Math.max(floor, perUnit.weight * Number(perUnit.row.base_rate)) * (1 + Number(perUnit.row.fuel_surcharge_pct) / 100); }
  return null;
}

export async function compareManifestRatesAction(_state: ManifestRateState, formData: FormData): Promise<ManifestRateState> {
  const profile = await requireProfile(manifestRoles);
  if (!profile.organization_id) return { ...emptyManifestRates, status: "error", message: "Organization is not configured." };
  const awbs = parseManifestAwbs(formData);
  if (!awbs.length || awbs.length > 500 || awbs.some((awb) => awb.length > 80)) return { ...emptyManifestRates, status: "error", message: "Enter between 1 and 500 valid AWBs to compare." };
  const awbsKey = JSON.stringify(awbs);
  const db = await createClient();
  const { data: shipments, error: shipmentError } = await db.from("shipments")
    .select("id,tracking_number,shipper_id,consignee_name,consignee_country_code,consignee_postal_code,weight_kg,chargeable_weight_kg,pieces,service_zone_id,service_type,payment_type,currency,status")
    .eq("organization_id", profile.organization_id).is("deleted_at", null).in("tracking_number", awbs);
  if (shipmentError) return { ...emptyManifestRates, status: "error", awbsKey, message: "Shipments could not be checked. Please retry." };
  const eligible = new Map((shipments ?? []).filter((shipment) => shipment.status === "at_warehouse").map((shipment) => [shipment.tracking_number, shipment]));
  if (eligible.size !== awbs.length) return { ...emptyManifestRates, status: "error", awbsKey, message: "Some AWBs were not found at warehouse. Check the list and compare again." };
  const admin = createAdminClient();
  const shipperIds = [...new Set([...eligible.values()].map((shipment) => shipment.shipper_id).filter((id): id is string => Boolean(id)))];
  const now = new Date().toISOString();
  const [{ data: defaults, error: defaultError }, { data: customerRates, error: zoneRateError }] = await Promise.all([
    shipperIds.length ? admin.from("shipper_rates").select("shipper_id,delivery_rate,currency,effective_from,effective_to").eq("organization_id", profile.organization_id).in("shipper_id", shipperIds).lte("effective_from", now).or(`effective_to.is.null,effective_to.gt.${now}`).order("effective_from", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    shipperIds.length ? admin.from("shipper_zone_rates").select("shipper_id,service_zone_id,service_type,delivery_rate,currency,weight_from_kg,weight_to_kg,additional_kg_rate,cod_fee,effective_from,effective_to,is_active").eq("organization_id", profile.organization_id).in("shipper_id", shipperIds).eq("is_active", true).lte("effective_from", now).or(`effective_to.is.null,effective_to.gt.${now}`) : Promise.resolve({ data: [], error: null }),
  ]);
  if (defaultError || zoneRateError) return { ...emptyManifestRates, status: "error", awbsKey, message: "Customer rates could not be checked. Please retry." };
  const defaultsByShipper = new Map<string, DefaultShipRate>();
  for (const row of (defaults ?? []) as DefaultShipRate[]) if (!defaultsByShipper.has(row.shipper_id)) defaultsByShipper.set(row.shipper_id, row);
  const zones = [...new Set([...eligible.values()].map((shipment) => shipment.consignee_country_code).filter((code): code is string => Boolean(code)).map((code) => code.toUpperCase()))];
  const cardsQuery = shipperIds.length && zones.length ? admin.from("carrier_rate_cards").select("id,shipper_id,carrier_id,card_name,country_code,currency,rate_notes").eq("organization_id", profile.organization_id).in("shipper_id", shipperIds).in("country_code", zones).eq("is_active", true).eq("import_status", "active").lte("effective_from", now) : null;
  const { data: cards, error: cardsError } = cardsQuery ? await cardsQuery : { data: [], error: null };
  if (cardsError) return { ...emptyManifestRates, status: "error", awbsKey, message: "Mapped 3PL rate cards could not be loaded. Please retry." };
  const cardIds = [...new Set((cards ?? []).map((card) => card.id))];
  const prefixes = [...new Set([...eligible.values()].flatMap((shipment) => postalPrefixes(shipment.consignee_postal_code || "")))];
  const { data: mappings, error: mapError } = cardIds.length && prefixes.length ? await admin.from("carrier_postal_zone_map").select("rate_card_id,service_code,origin_terminal,postal_code,zone_code").in("rate_card_id", cardIds).in("postal_code", prefixes) : { data: [], error: null };
  if (mapError) return { ...emptyManifestRates, status: "error", awbsKey, message: "Postal zones could not be checked. Please retry." };
  const serviceCodes = [...new Set((mappings ?? []).map((map) => map.service_code))];
  const zoneCodes = [...new Set((mappings ?? []).map((map) => map.zone_code))];
  const gridRows: RateRow[] = [];
  if (cardIds.length && serviceCodes.length && zoneCodes.length) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("carrier_rate_grid").select("rate_card_id,service_code,origin_terminal,zone_code,weight_value,weight_unit,base_rate,fuel_surcharge_pct,rate_basis").in("rate_card_id", cardIds).in("service_code", serviceCodes).in("zone_code", zoneCodes).order("weight_value").range(from, from + 999);
      if (error) return { ...emptyManifestRates, status: "error", awbsKey, message: "Carrier rate rows could not be checked. Please retry." };
      gridRows.push(...(data ?? []) as RateRow[]);
      if ((data?.length ?? 0) < 1000) break;
    }
  }
  const carrierIds = [...new Set((cards ?? []).map((card) => card.carrier_id))];
  const { data: carriers, error: carriersError } = carrierIds.length ? await admin.from("third_party_carriers").select("id,name").eq("organization_id", profile.organization_id).in("id", carrierIds) : { data: [], error: null };
  if (carriersError) return { ...emptyManifestRates, status: "error", awbsKey, message: "Carrier names could not be loaded. Please retry." };
  const carrierNames = new Map((carriers ?? []).map((carrier) => [carrier.id, carrier.name]));
  const results: ManifestShipmentRates[] = [];
  for (const awb of awbs) {
    const shipment = eligible.get(awb)!;
    const weightKg = Number(shipment.chargeable_weight_kg || shipment.weight_kg);
    const seller = shipment.shipper_id ? defaultsByShipper.get(shipment.shipper_id) : null;
    const zoneRate = shipment.shipper_id ? ((customerRates ?? []) as CustomerZoneRate[]).filter((rate) => rate.shipper_id === shipment.shipper_id && rate.service_zone_id === shipment.service_zone_id && rate.service_type === shipment.service_type && Number(rate.weight_from_kg) <= Number(shipment.weight_kg)).sort((a, b) => Number(b.weight_from_kg) - Number(a.weight_from_kg) || b.effective_from.localeCompare(a.effective_from))[0] : null;
    let billedAmount: number | null = null; let billedCurrency: string | null = null;
    if (zoneRate) { const extra = zoneRate.weight_to_kg && Number(shipment.weight_kg) > Number(zoneRate.weight_to_kg) ? Math.ceil(Number(shipment.weight_kg) - Number(zoneRate.weight_to_kg)) * Number(zoneRate.additional_kg_rate) : 0; billedAmount = Number(zoneRate.delivery_rate) + extra + (shipment.payment_type === "cod" ? Number(zoneRate.cod_fee) : 0); billedCurrency = zoneRate.currency; }
    else if (seller) { billedAmount = Number(seller.delivery_rate); billedCurrency = seller.currency; }
    const cardRows = (cards ?? []).filter((card) => card.shipper_id === shipment.shipper_id && card.country_code === (shipment.consignee_country_code || "").toUpperCase());
    const shipmentMaps = (mappings ?? []).filter((map) => cardRows.some((card) => card.id === map.rate_card_id) && postalPrefixes(shipment.consignee_postal_code || "").includes(map.postal_code));
    const mostPreciseLength = Math.max(0, ...shipmentMaps.map((map) => map.postal_code.length));
    const preciseMaps = shipmentMaps.filter((map) => map.postal_code.length === mostPreciseLength);
    const quotes: ManifestRateQuote[] = [];
    if (Number(shipment.pieces) === 1) for (const card of cardRows) {
      for (const map of preciseMaps.filter((item) => item.rate_card_id === card.id)) {
        const sameKey = gridRows.filter((row) => row.rate_card_id === card.id && row.service_code === map.service_code && row.zone_code === map.zone_code);
        const exactOrigin = sameKey.filter((row) => row.origin_terminal === map.origin_terminal);
        const rows = exactOrigin.length ? exactOrigin : sameKey.filter((row) => row.origin_terminal === "ANY");
        const amount = estimateCarrierRate(rows, weightKg);
        if (amount !== null) quotes.push({ carrierId: card.carrier_id, carrierName: carrierNames.get(card.carrier_id) || "3PL", service: map.service_code, amount, currency: card.currency, margin: billedAmount !== null && billedCurrency === card.currency ? billedAmount - amount : null });
      }
    }
    const cheapestByCarrier = new Map<string, ManifestRateQuote>();
    for (const quote of quotes) {
      const current = cheapestByCarrier.get(quote.carrierId);
      if (!current || quote.amount < current.amount) cheapestByCarrier.set(quote.carrierId, quote);
    }
    const bestQuotes = [...cheapestByCarrier.values()].sort((a, b) => (a.margin === null || b.margin === null ? Infinity : b.margin - a.margin) || a.amount - b.amount);
    const note = !shipment.shipper_id ? "No customer account is linked to this AWB." : Number(shipment.pieces) !== 1 ? "Multi-piece shipment: per-piece weights are not stored, so carrier tariffs were not compared." : !cardRows.length ? "No active mapped carrier rate cards for this customer and destination." : billedAmount === null ? "Customer billing rate is missing; profit/loss is unavailable." : null;
    results.push({ trackingNumber: awb, customer: shipment.consignee_name, billedAmount, billedCurrency, quotes: bestQuotes, note });
  }
  return { ...emptyManifestRates, status: "success", awbsKey, shipments: results, message: `${results.length} warehouse shipment${results.length === 1 ? "" : "s"} checked. Comparison uses active customer-mapped carrier cards; choose a 3PL after reviewing the rates.` };
}
export type ManifestState = { status: "idle" | "error" | "success"; message: string };
function refresh(id: string) {
  for (const path of ["/dispatch", "/dispatch/3pl", "/dispatch/3pl/manifests", `/dispatch/3pl/manifests/${id}`, `/print/3pl-manifests/${id}`, "/warehouse", "/shipments", "/shipper", "/dashboard"]) revalidatePath(path);
  revalidatePath("/shipments/[id]", "page");
}
function safeError(message: string) {
  return message.startsWith("3PL manifest: ") ? message.slice(14) : "Manifest could not be saved. Retry the same request or refresh to check its status.";
}
export async function createThreePLManifestAction(_state: ManifestState, formData: FormData): Promise<ManifestState> {
  const profile = await requireProfile(manifestRoles);
  if (!profile.organization_id) return { status: "error", message: "Organization is not configured." };
  const id = String(formData.get("request_id") ?? "");
  const carrierId = String(formData.get("carrier_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const awbs = parseManifestAwbs(formData);
  if (!validManifestId(id) || !validManifestId(carrierId)) return { status: "error", message: "Select a delivery partner. Refresh if the request expired." };
  if (!awbs.length || awbs.length > 500 || awbs.some((a) => !/^[A-Z0-9][A-Z0-9_-]{2,99}$/.test(a))) return { status: "error", message: "Select or scan 1 to 500 valid shipment AWBs." };
  if (notes.length > 1000) return { status: "error", message: "Keep notes within 1000 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manage_three_pl_manifest", { p_operation: "create", p_id: id, p_carrier_id: carrierId, p_awbs: awbs, p_receiver: null, p_notes: notes || null });
  if (error || data !== id) return { status: "error", message: error ? safeError(error.message) : "Manifest could not be saved. Please retry." };
  refresh(id);
  redirect(`/dispatch/3pl/manifests/${id}?created=1`);
}
export async function changeThreePLManifestAction(_state: ManifestState, formData: FormData): Promise<ManifestState> {
  const profile = await requireProfile(manifestRoles);
  if (!profile.organization_id) return { status: "error", message: "Organization is not configured." };
  const id = String(formData.get("manifest_id") ?? "");
  const operation = String(formData.get("operation") ?? "");
  const receiver = String(formData.get("receiver_name") ?? "").trim();
  if (!validManifestId(id) || !["confirm", "cancel"].includes(operation)) return { status: "error", message: "Invalid manifest action." };
  if (formData.get("acknowledge") !== "yes") return { status: "error", message: operation === "confirm" ? "Confirm that all listed parcels have physically been handed over." : "Confirm cancellation of this draft manifest." };
  if (operation === "confirm" && (receiver.length < 2 || receiver.length > 120)) return { status: "error", message: "Enter the receiver name (2 to 120 characters)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manage_three_pl_manifest", { p_operation: operation, p_id: id, p_carrier_id: null, p_awbs: null, p_receiver: receiver || null, p_notes: null });
  if (error || data !== id) return { status: "error", message: error ? safeError(error.message) : "Manifest could not be saved. Please retry." };
  refresh(id);
  return { status: "success", message: operation === "confirm" ? "Handover confirmed. Customer tracking is now In transit." : "Draft cancelled. The parcels are available for a new manifest." };
}
