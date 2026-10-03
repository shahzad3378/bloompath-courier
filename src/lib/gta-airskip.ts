import type { Shipment } from "@/lib/shipments";

export type GtaItem = { description: string; weight: number; hsCode: string; declaredValue: number; currency: string; quantity: number };
export type GtaOptions = { terminal: string; destinationTerminal: string; service: string; piecesType: string; length: number; width: number; height: number; signature: boolean; insurance: boolean; insuranceValue: number; items: GtaItem[] };
const text = (value: unknown, name: string, max = 300) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`Enter ${name} (${max} characters or fewer).`);
  return value.trim();
};
const positive = (value: number, name: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero.`);
  return value;
};
export function buildGtaShipment(shipment: Shipment, options: GtaOptions, idempotencyKey?: string) {
  if (Number(shipment.pieces) !== 1) throw new Error("Use one FastDrop shipment per physical parcel for this connector.");
  if (shipment.payment_type === "cod" && Number(shipment.cod_amount) > 0) throw new Error("GTA COD collection is not configured. A COD shipment cannot be booked as prepaid.");
  const country = (side: "sender" | "consignee") => {
    const value = text(shipment[`${side}_country_code`], `${side} country`, 2).toUpperCase();
    if (!["CA", "US"].includes(value)) throw new Error("This connector supports Canada and USA addresses.");
    return value;
  };
  const fromCountry = country("sender"), toCountry = country("consignee");
  const service = options.service.trim();
  if (service.length > 100 || options.destinationTerminal.length > 30) throw new Error("Service or destination terminal is too long.");
  if (/^(airskip|zoneskip)$/i.test(service) && !options.destinationTerminal.trim()) throw new Error("A destination terminal is required for a middle-mile service.");
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
    [`${prefix}Address2`]: shipment[`${side}_address_2`]?.trim() || "",
    [`${prefix}City`]: text(shipment[`${side}_city`], `${side} city`),
    [`${prefix}State`]: text(shipment[`${side}_state_province`], `${side} province/state`, 30),
    [`${prefix}PostalCode`]: text(shipment[`${side}_postal_code`], `${side} postal code`, 30),
  });
  return {
    ...(idempotencyKey ? { idempotencyKey } : {}), ...(service ? { service } : {}),
    reference1: text(shipment.tracking_number, "FastDrop AWB", 100),
    ...address("sender", "from"), ...address("consignee", "to"), fromCountry, toCountry,
    fromTerminal: text(options.terminal, "GTA induction terminal", 30),
    ...(options.destinationTerminal.trim() ? { toTerminal: options.destinationTerminal.trim() } : {}),
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
// Accept either envelope without changing request fields or nested response data.
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
export function gtaKnownTracking(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || !("packages" in data) || !Array.isArray(data.packages)) return;
  const tracking = data.packages[0]?.trackingNumber;
  return Array.isArray(tracking) && typeof tracking[0] === "string" && tracking[0].trim().length >= 2 && tracking[0].length <= 100 ? tracking[0].trim() : undefined;
}
export function parseGtaLabel(body: unknown) {
  const data = gtaData(body) as Record<string, unknown>;
  const tracking = gtaKnownTracking(data);
  const packages = data?.packages;
  if (!tracking || !Array.isArray(packages) || packages.length !== 1 || packages[0].trackingNumber.length !== 1) throw new Error("GTA returned unexpected parcel/tracking counts. Review the booking before retrying.");
  const pkg = packages[0];
  const label = typeof pkg.labelBase64 === "string" && pkg.labelBase64.trim() ? pkg.labelBase64.replace(/\s/g, "") : typeof pkg.labelZpl === "string" ? Buffer.from(pkg.labelZpl.trim()).toString("base64") : "";
  if (!label || label.length > 4 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(label)) throw new Error("GTA returned an invalid or oversized label. Recover it from GTA; do not rebook.");
  const bytes = Buffer.from(label, "base64");
  const format = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png" : bytes.toString().startsWith("^XA") && bytes.toString().endsWith("^XZ") ? "zpl" : null;
  if (!format) throw new Error("GTA label is not a supported PNG or ZPL document. Recover it from GTA; do not rebook.");
  if (typeof data.loadNumber !== "string" || !data.loadNumber.trim() || data.loadNumber.length > 100) throw new Error("GTA did not return a valid load number. Review the booking before retrying.");
  return { tracking, label, format, loadNumber: data.loadNumber, cost: typeof data.cost === "number" && Number.isFinite(data.cost) ? data.cost : null };
}
export function parseGtaRates(body: unknown) {
  const data = gtaData(body);
  if (!Array.isArray(data) || !data.length || data.length > 100) throw new Error("GTA returned no available rates. Confirm route coverage and terminal settings.");
  return data.map(rate => {
    if (!rate || typeof rate.cost !== "number" || !Number.isFinite(rate.cost) || rate.cost < 0) throw new Error("GTA returned invalid rates.");
    return { service: typeof rate.service === "string" ? rate.service.slice(0,100) : "Automatic service", cost: rate.cost, tax: typeof rate.taxAmount === "number" && Number.isFinite(rate.taxAmount) ? rate.taxAmount : null };
  });
}
export function parseGtaTracking(body: unknown, tracking: string) {
  const data = gtaData(body);
  const match = Array.isArray(data) ? data.find(row => row?.trackingNumber === tracking) : null;
  if (!match) throw new Error("No GTA tracking record is available for this saved partner AWB.");
  const clip = (value: unknown) => typeof value === "string" ? value.slice(0,500) : "";
  return { status: clip(match.status), standardStatus: Number.isSafeInteger(match.standardStatus) ? match.standardStatus : null,
    date: clip(match.lastStatusDate), events: (Array.isArray(match.events) ? match.events : []).slice(-30).map((event: Record<string, unknown> | null) => ({ name: clip(event?.name), location: clip(event?.location), date: clip(event?.eventDateTime) })) };
}
