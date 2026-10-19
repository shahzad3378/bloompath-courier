import type { Shipment } from "@/lib/shipments";

export type GtaItem = { description: string; weight: number; hsCode: string; declaredValue: number; currency: string; quantity: number };
// GTA requires the complete account terminal list for rate shopping.
export const gtaSenderTerminals = "ONDM,MISS2,MISSF,BRA";
// Physical handover instructions only; never use this as the shipment sender.
export const gtaDropoffAddress = "GTA AIRSKIP LTD, 2710 Britannia Road East, Cargo 2, Entrance 6, Mississauga, ON, L4W 2P7, CA";
export function normalizeGtaSenderTerminals(value: string): string {
  const terminal = value.trim();
  if (terminal === gtaSenderTerminals || ["ONDM", "MISS2", "MISSF", "BRA"].includes(terminal)) return gtaSenderTerminals;
  throw new Error("Use GTA sender terminals ONDM,MISS2,MISSF,BRA.");
}
// Canada Post's first postal character identifies these provinces unambiguously.
// X spans NT and NU, so it still requires a saved province.
function savedProvince(shipment: Shipment, side: "sender" | "consignee"): string {
  const saved = shipment[`${side}_state_province`]?.trim();
  if (saved) return saved;
  const country = shipment[`${side}_country_code`]?.trim().toUpperCase();
  const postal = shipment[`${side}_postal_code`]?.trim().toUpperCase().replace(/\s/g, "") || "";
  if (country === "CA" && /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ]\d[ABCEGHJKLMNPRSTVWXYZ]\d$/.test(postal)) {
    const provinces: Record<string, string> = { A: "NL", B: "NS", C: "PE", E: "NB", G: "QC", H: "QC", J: "QC", K: "ON", L: "ON", M: "ON", N: "ON", P: "ON", R: "MB", S: "SK", T: "AB", V: "BC", Y: "YT" };
    if (provinces[postal[0]]) return provinces[postal[0]];
  }
  throw new Error(`Saved ${side} province/state is missing. Update the shipment address before booking.`);
}
export type GtaPickup = { name: string; phone: string; address: string; address2: string; city: string; state: string; postalCode: string; country: string };
export type GtaOptions = { pickup?: GtaPickup; terminal: string; destinationTerminal: string; service: string; piecesType: string; length: number; width: number; height: number; signature: boolean; insurance: boolean; insuranceValue: number; items: GtaItem[] };
const text = (value: unknown, name: string, max = 300) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`Enter ${name} (${max} characters or fewer).`);
  return value.trim();
};
const positive = (value: number, name: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero.`);
  return value;
};
export function buildGtaShipment(shipment: Shipment, options: GtaOptions, idempotencyKey?: string) {
  // The carrier leg uses the configured FastDrop sender without rewriting the original shipper.
  if (options.pickup) {
    const pickup = options.pickup;
    shipment = { ...shipment, sender_name: pickup.name, sender_phone: pickup.phone, sender_address: pickup.address,
      sender_address_2: pickup.address2, sender_city: pickup.city, sender_state_province: pickup.state,
      sender_postal_code: pickup.postalCode, sender_country_code: pickup.country };
  }
  if (Number(shipment.pieces) !== 1) throw new Error("Use one FastDrop shipment per physical parcel for this connector.");
  if (shipment.payment_type === "cod" && Number(shipment.cod_amount) > 0) throw new Error("GTA COD collection is not configured. A COD shipment cannot be booked as prepaid.");
  const country = (side: "sender" | "consignee") => {
    const value = text(shipment[`${side}_country_code`], `${side} country`, 2).toUpperCase();
    if (!["CA", "US"].includes(value)) throw new Error("This connector supports Canada and USA addresses.");
    return value;
  };
  const fromCountry = country("sender"), toCountry = country("consignee");
  const service = options.service.trim();
  if (/^domestic$/i.test(service)) throw new Error("GTA Domestic service is not enabled. Use Air Skip.");
  if (service.length > 100 || options.destinationTerminal.length > 30) throw new Error("Service or destination terminal is too long.");
  if (!Array.isArray(options.items) || options.items.length > 100) throw new Error("Use at most 100 customs items.");
  if ((fromCountry !== toCountry || /usps/i.test(service)) && !options.items.length) throw new Error("Cross-border and USPS shipments require customs items with HS codes and actual item weights.");
  const items = options.items.map(item => {
    const hsCode = text(item.hsCode, "item HS code", 10);
    if (!/^\d{4,10}$/.test(hsCode)) throw new Error("GTA HS codes must contain 4 to 10 digits.");
    const currency = text(item.currency, "item currency", 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Enter a three-letter item currency.");
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.declaredValue) || item.declaredValue < 0) throw new Error("Enter a positive whole quantity and a non-negative declared item value.");
    return { description: text(item.description, "item description"), weight: positive(item.weight, "Item weight (kg)"), weightType: 0, hsCode, declaredValue: item.declaredValue, currency, quantity: item.quantity };
  });
  const address = (side: "sender" | "consignee", prefix: "from" | "to") => ({
    [prefix]: text(shipment[`${side}_name`], `${side} name`),
    [`${prefix}ContactName`]: text(shipment[`${side}_name`], `${side} name`),
    [`${prefix}Phone`]: shipment[`${side}_phone`]?.trim() || "",
    [`${prefix}Address1`]: text(shipment[`${side}_address`], `${side} street address`),
    ...(prefix === "from" ? { fromAddress2: shipment.sender_address_2?.trim() || "" } : {}),
    [`${prefix}City`]: text(shipment[`${side}_city`], `${side} city`),
    [`${prefix}State`]: text(savedProvince(shipment, side), `${side} province/state`, 30),
    [`${prefix}PostalCode`]: text(shipment[`${side}_postal_code`], `${side} postal code`, 30),
  });
  return {
    ...(idempotencyKey ? { IdempotencyKey: idempotencyKey } : {}), ...(service ? { service } : {}),
    reference1: text(shipment.tracking_number, "FastDrop AWB", 100),
    ...address("sender", "from"), ...address("consignee", "to"), ToAddress2: shipment.consignee_address_2?.trim() || "", fromCountry, toCountry,
    fromTerminal: normalizeGtaSenderTerminals(options.terminal),
    signatureRequired: options.signature, insuranceRequired: options.insurance,
    packages: [{ customerTrackingReference1: shipment.tracking_number, description: shipment.parcel_description || "Parcel",
      sizeLength: positive(options.length, "Length (cm)"), sizeWidth: positive(options.width, "Width (cm)"), sizeHeight: positive(options.height, "Height (cm)"), sizeType: 0,
      weight: positive(Number(shipment.weight_kg), "Shipment weight (kg)"), weightType: 0, pieces: 1,
      piecesType: text(options.piecesType, "provider-approved package type", 50),
      ...(options.insurance ? { insuranceDeclaredValue: positive(options.insuranceValue, "Insurance value") } : {}),
      ...(items.length ? { items } : {}),
    }],
  };
}
// Swagger documents camelCase; the verified QA response uses PascalCase.
// Accept either envelope. Known nested fields are read through explicit casing aliases.
export function gtaEnvelope(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const pascal = Object.hasOwn(row, "IsSuccess");
  if (pascal && Object.hasOwn(row, "isSuccess")) return null;
  const success = row[pascal ? "IsSuccess" : "isSuccess"];
  if (typeof success !== "boolean") return null;
  const dataKey = pascal ? "Data" : "data";
  return { success, hasData: Object.hasOwn(row, dataKey), data: row[dataKey], errorMessage: row[pascal ? "ErrorMessage" : "errorMessage"] };
}
export function gtaData(body: unknown): unknown {
  const envelope = gtaEnvelope(body);
  if (!envelope?.success || !envelope.hasData) throw new Error("GTA rejected the request or returned an invalid response. Verify fields and account access with GTA.");
  return envelope.data;
}
// Reject ambiguous aliases instead of choosing an attacker-controlled duplicate field.
export function gtaField(row: unknown, key: string): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const data = row as Record<string, unknown>, pascal = key[0].toUpperCase() + key.slice(1);
  if (Object.hasOwn(data, key) && Object.hasOwn(data, pascal)) throw new Error("GTA returned conflicting response fields.");
  return Object.hasOwn(data, pascal) ? data[pascal] : data[key];
}
export function gtaKnownTracking(data: unknown): string | undefined {
  const packages = gtaField(data, "packages");
  if (!Array.isArray(packages)) return;
  const tracking = gtaField(packages[0], "trackingNumber");
  return Array.isArray(tracking) && typeof tracking[0] === "string" && tracking[0].trim().length >= 2 && tracking[0].length <= 100 ? tracking[0].trim() : undefined;
}
export function parseGtaLabel(body: unknown) {
  const data = gtaData(body), tracking = gtaKnownTracking(data), packages = gtaField(data, "packages");
  if (!tracking || !Array.isArray(packages) || packages.length !== 1) throw new Error("GTA returned unexpected parcel/tracking counts. Review the booking before retrying.");
  const numbers = gtaField(packages[0], "trackingNumber");
  if (!Array.isArray(numbers) || numbers.length !== 1) throw new Error("GTA returned unexpected parcel/tracking counts. Review the booking before retrying.");
  const base64 = gtaField(packages[0], "labelBase64"), zpl = gtaField(packages[0], "labelZpl");
  const label = typeof base64 === "string" && base64.trim() ? base64.replace(/\s/g, "") : typeof zpl === "string" ? Buffer.from(zpl.trim()).toString("base64") : "";
  if (!label || label.length > 4 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(label)) throw new Error("GTA returned an invalid or oversized label. Recover it from GTA; do not rebook.");
  const bytes = Buffer.from(label, "base64"), format = gtaLabelFormat(bytes);
  if (!format || format === "pdf") throw new Error("GTA label is not a supported PNG or ZPL document. Recover it from GTA; do not rebook.");
  const loadNumber = gtaField(data, "loadNumber"), cost = gtaField(data, "cost");
  if (typeof loadNumber !== "string" || !loadNumber.trim() || loadNumber.length > 100) throw new Error("GTA did not return a valid load number. Review the booking before retrying.");
  return { tracking, label, format, loadNumber, cost: typeof cost === "number" && Number.isFinite(cost) ? cost : null };
}
export function gtaLabelFormat(bytes: Buffer) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png" as const;
  if (bytes.subarray(0,5).toString() === "%PDF-") return "pdf" as const;
  if (bytes.toString().trim().startsWith("^XA") && bytes.toString().trim().endsWith("^XZ")) return "zpl" as const;
  return null;
}
export function parseGtaRates(body: unknown) {
  const data = gtaData(body), rates = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  if (!rates.length || rates.length > 100) throw new Error("GTA returned no available rates. Confirm route coverage and terminal settings.");
  return rates.map(rate => {
    const cost = gtaField(rate, "cost"), service = gtaField(rate, "service"), tax = gtaField(rate, "taxAmount");
    if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) throw new Error("GTA returned invalid rates.");
    return { service: typeof service === "string" ? service.slice(0,100) : "Automatic service", cost, tax: typeof tax === "number" && Number.isFinite(tax) ? tax : null };
  });
}
export function gtaTrackingRecord(body: unknown, tracking: string) {
  const data = gtaData(body), matches = Array.isArray(data) ? data.filter(row => gtaField(row, "trackingNumber") === tracking) : [];
  if (matches.length !== 1) throw new Error("No unique GTA tracking record is available for this saved partner AWB.");
  return matches[0];
}
export function parseGtaTracking(body: unknown, tracking: string) {
  const match = gtaTrackingRecord(body, tracking), clip = (value: unknown) => typeof value === "string" ? value.slice(0,500) : "";
  const status = gtaField(match, "standardStatus"), events = gtaField(match, "events");
  return { status: clip(gtaField(match, "status")), standardStatus: Number.isSafeInteger(status) ? status as number : null,
    date: clip(gtaField(match, "lastStatusDate")), events: (Array.isArray(events) ? events : []).slice(-30).map(event => ({ name: clip(gtaField(event, "name")), location: clip(gtaField(event, "location")), date: clip(gtaField(event, "eventDateTime")) })) };
}
