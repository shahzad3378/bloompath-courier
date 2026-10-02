import type { Shipment } from "@/lib/shipments";

export const broadReachServices = { CA: "CA_Rateshop", US: "US_Rateshop" } as const;

export type BroadReachItem = {
  description: string;
  qty: number;
  unit: string;
  value: number;
  sku?: string;
  hscode?: string;
  origin?: string;
};

export type BroadReachOptions = {
  test: boolean;
  currency: string;
  items: BroadReachItem[];
  dimensions?: { length: number; width: number; height: number };
};

function required(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Add ${name} to the shipment before generating a label.`);
  return value.trim();
}

export function buildBroadReachShipment(shipment: Shipment, account: string, options: BroadReachOptions) {
  const country = required(shipment.consignee_country_code, "destination country").toUpperCase();
  if (country !== "CA" && country !== "US") throw new Error("BroadReach booking supports Canada and USA destinations only.");
  if (Number(shipment.pieces) !== 1) throw new Error("Book each physical parcel separately. This connector generates one label per shipment.");
  if (shipment.payment_type === "cod" && Number(shipment.cod_amount) > 0) throw new Error("BroadReach COD collection has not been configured. This shipment cannot be booked as prepaid.");
  const weight = Number(shipment.weight_kg);
  if (!Number.isFinite(weight) || weight <= 0) throw new Error("Shipment weight must be greater than zero.");
  const currency = options.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Enter a three-letter declared-value currency.");
  const address = (side: "sender" | "consignee") => ({
    name: required(shipment[`${side}_name`], `${side} name`),
    addr1: required(shipment[`${side}_address`], `${side} street address`),
    addr2: shipment[`${side}_address_2`]?.trim() || "",
    city: required(shipment[`${side}_city`], `${side} city`),
    state: required(shipment[`${side}_state_province`], `${side} state/province`),
    postal: required(shipment[`${side}_postal_code`], `${side} postal/ZIP code`),
    country: required(shipment[`${side}_country_code`], `${side} country`).toUpperCase(),
    phone: shipment[`${side}_phone`]?.trim() || "",
  });
  const shipper = address("sender");
  const consignee = address("consignee");
  if (!/^[A-Z]{2}$/.test(shipper.country)) throw new Error("Sender country must be a two-letter country code.");
  if (!Array.isArray(options.items) || options.items.length < 1 || options.items.length > 100) throw new Error("Add between 1 and 100 content items.");
  const items = options.items.map((item) => {
    const description = required(item.description, "item description");
    if (!Number.isSafeInteger(item.qty) || item.qty <= 0 || !Number.isFinite(item.value) || item.value < 0) throw new Error("Item quantity must be a positive whole number and unit value must be zero or greater.");
    const unit = required(item.unit, "item unit");
    const origin = item.origin?.trim().toUpperCase();
    const hscode = item.hscode?.trim();
    const sku = item.sku?.trim();
    if (origin && !/^[A-Z]{2}$/.test(origin)) throw new Error("Item origin must be a two-letter country code.");
    if (hscode && !/^\d{10}$/.test(hscode)) throw new Error("HS code must contain 10 digits.");
    if (country === "US" && shipper.country !== "US" && (!origin || !hscode || !sku)) throw new Error("For USA cross-border booking, add item origin, 10-digit HS code and SKU.");
    return { description, qty: item.qty, unit, value: item.value, ...(sku ? { sku } : {}), ...(origin ? { origin } : {}), ...(hscode ? { hscode } : {}) };
  });
  const value = Math.round(items.reduce((total, item) => total + item.qty * item.value, 0) * 100) / 100;
  if (!Number.isFinite(value)) throw new Error("Declared value is too large.");
  if (options.dimensions && Object.values(options.dimensions).some((n) => !Number.isFinite(n) || n <= 0)) throw new Error("Enter positive length, width and height, or leave all dimensions blank.");
  return { shipment: {
    account: required(account, "BroadReach account"),
    service: broadReachServices[country],
    reference: required(shipment.tracking_number, "FastDrop AWB"),
    ...(shipment.reference_number ? { reference2: shipment.reference_number } : {}),
    test: options.test ? 1 : 0,
    uom: "kg", weight, dimunit: "cm",
    ...(options.dimensions ?? {}),
    currency, value, shipper, consignee, item: items,
  } };
}

export function parseBroadReachResponse(body: unknown) {
  if (!body || typeof body !== "object" || !("shipmentresponse" in body)) throw new Error("BroadReach did not return a shipment response. Review the booking in BroadReach before trying again.");
  const result = body.shipmentresponse as Record<string, unknown>;
  if (!result || typeof result !== "object") throw new Error("BroadReach returned an invalid shipment response.");
  const text = (name: string) => typeof result[name] === "string" ? result[name].trim() : "";
  const tracking = text("tracknbr");
  const label = text("label").replace(/\s/g, "");
  const format = text("labelformat").toLowerCase();
  if (tracking.length < 2 || tracking.length > 100 || !label || label.length > 4 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(label) || !["pdf", "png", "zpl"].includes(format)) throw new Error("BroadReach returned incomplete tracking or label data. Review this booking before retrying.");
  const bytes = Buffer.from(label, "base64");
  if ((format === "pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") || (format === "png" && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) || (format === "zpl" && !bytes.toString().includes("^XA"))) throw new Error("BroadReach label content does not match its format. Review this booking before retrying.");
  return { tracking, label, format, carrier: text("carrier"), service: text("service"), alternateTracking: text("alttracknbr"), scn: text("scn"), rate: text("rate"), currency: text("currency") };
}
