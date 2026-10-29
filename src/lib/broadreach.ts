import type { Shipment } from "@/lib/shipments";

export const broadReachServices = { CA: "ca_rateshop", US: "us_rateshop" } as const;

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
  sender?: BroadReachSender;
};

export type BroadReachSender = { name: string; phone: string; address: string; address2: string; city: string; state: string; postalCode: string; country: string };

function required(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Add ${name} to the shipment before generating a label.`);
  return value.trim();
}

function reference(value: unknown, name: string) {
  const text = required(value, name);
  if ([...text].length > 35) throw new Error(`${name} must be 35 characters or fewer for BroadReach. Update the shipment reference before generating a label.`);
  return text;
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
    company: required(shipment[`${side}_name`], `${side} name`),
    address1: required(shipment[`${side}_address`], `${side} street address`),
    address2: shipment[`${side}_address_2`]?.trim() || "",
    city: required(shipment[`${side}_city`], `${side} city`),
    province: required(shipment[`${side}_state_province`], `${side} state/province`),
    postalCode: required(shipment[`${side}_postal_code`], `${side} postal/ZIP code`),
    country: required(shipment[`${side}_country_code`], `${side} country`).toUpperCase(),
    phone: shipment[`${side}_phone`]?.trim() || "",
  });
  const shipper = options.sender ? {
    name: required(options.sender.name, "FastDrop sender name"),
    company: required(options.sender.name, "FastDrop sender name"),
    address1: required(options.sender.address, "FastDrop sender address"),
    address2: options.sender.address2.trim(),
    city: required(options.sender.city, "FastDrop sender city"),
    province: required(options.sender.state, "FastDrop sender province/state"),
    postalCode: required(options.sender.postalCode, "FastDrop sender postal code"),
    country: required(options.sender.country, "FastDrop sender country").toUpperCase(),
    phone: options.sender.phone.trim(),
  } : address("sender");
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
    reference: reference(shipment.tracking_number, "FastDrop AWB"),
    ...(shipment.reference_number?.trim() ? { reference2: reference(shipment.reference_number, "Additional reference") } : {}),
    test: options.test ? 1 : 0,
    weightUnit: "kg", weight, pieces: 1, dimUnit: "cm",
    ...(options.dimensions ?? {}),
    currency, value, shipper, consignee, item: items,
  } };
}

export function buildBroadReachRates(
  shipment: Pick<Shipment, "weight_kg" | "consignee_country_code" | "consignee_postal_code" | "consignee_state_province">,
  account: string,
  sender: BroadReachSender,
) {
  const country = required(shipment.consignee_country_code, "destination country").toUpperCase();
  const weight = Number(shipment.weight_kg);
  if (!["CA", "US"].includes(country) || !Number.isFinite(weight) || weight <= 0) throw new Error("Rates require a Canada/USA destination and positive shipment weight.");
  const shipper = {
    name: required(sender.name, "FastDrop sender name"),
    company: required(sender.name, "FastDrop sender name"),
    address1: required(sender.address, "FastDrop sender address"),
    address2: sender.address2.trim(),
    city: required(sender.city, "FastDrop sender city"),
    province: required(sender.state, "FastDrop sender province/state"),
    postalCode: required(sender.postalCode, "FastDrop sender postal code").replace(/\s+/g, ""),
    country: required(sender.country, "FastDrop sender country").toUpperCase(),
    phone: sender.phone.trim(),
  };
  if (!/^[A-Z]{2}$/.test(shipper.country)) throw new Error("FastDrop sender country must be a two-letter country code.");
  return { rateshipment: {
    account: required(account, "BroadReach account"), weight, weightUnit: "kg", pieces: 1, dimUnit: "cm",
    shipper, consignee: { province: required(shipment.consignee_state_province, "destination province/state"), postalCode: required(shipment.consignee_postal_code, "destination postal code").replace(/\s+/g, ""), country },
  } };
}

export function parseBroadReachResponse(body: unknown) {
  if (!body || typeof body !== "object" || !("shipmentresponse" in body)) throw new Error("BroadReach did not return a shipment response. Review the booking in BroadReach before trying again.");
  const result = body.shipmentresponse as Record<string, unknown>;
  if (!result || typeof result !== "object") throw new Error("BroadReach returned an invalid shipment response.");
  const text = (name: string) => typeof result[name] === "string" ? result[name].trim() : "";
  const tracking = text("trackingNumber") || text("tracknbr");
  const rawLabel = text("label");
  const label = rawLabel.startsWith("^XA") && rawLabel.endsWith("^XZ") ? Buffer.from(rawLabel).toString("base64") : rawLabel.replace(/\s/g, "");
  const bytes = Buffer.from(label, "base64");
  const detected = bytes.subarray(0, 5).toString() === "%PDF-" ? "pdf" : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png" : bytes.toString().trim().startsWith("^XA") ? "zpl" : "";
  const format = (text("labelFormat") || text("labelformat") || detected).toLowerCase();
  if (tracking.length < 2 || tracking.length > 100 || !label || label.length > 4 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(label) || !["pdf", "png", "zpl"].includes(format)) throw new Error("BroadReach returned incomplete tracking or label data. Review this booking before retrying.");
  if ((format === "pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") || (format === "png" && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) || (format === "zpl" && !bytes.toString().includes("^XA"))) throw new Error("BroadReach label content does not match its format. Review this booking before retrying.");
  const rate = result.totalCost ?? result.rate;
  return { tracking, label, format, carrier: text("carrier"), service: text("serviceLevel") || text("service"), alternateTracking: text("alttracknbr"), scn: text("scn"), rate: typeof rate === "string" || typeof rate === "number" ? String(rate) : "", currency: text("currency") };
}
