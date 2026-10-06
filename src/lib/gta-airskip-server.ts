import "server-only";
import { gtaData, gtaEnvelope, gtaKnownTracking, gtaLabelFormat, gtaTrackingRecord, parseGtaLabel, parseGtaRates, parseGtaTracking, type GtaPickup } from "@/lib/gta-airskip";
export const gtaQaUrl = "https://tms-api-qa.gtagsm.com";
export const gtaProductionUrl = "https://tms-api.gtagsm.com";
export function getGtaConfig(organizationId: string | null) {
  if (!organizationId || organizationId !== process.env.GTA_AIRSKIP_ORGANIZATION_ID) return null;
  const accountKey = process.env.GTA_AIRSKIP_ACCOUNT_KEY, apiKey = process.env.GTA_AIRSKIP_API_KEY;
  if (!accountKey?.trim() || !apiKey?.trim() || /[\r\n]/.test(accountKey + apiKey)) return null;
  let url: URL;
  try { url = new URL(process.env.GTA_AIRSKIP_BASE_URL || gtaQaUrl); } catch { return null; }
  if (url.protocol !== "https:" || ![gtaQaUrl, gtaProductionUrl].includes(url.origin) || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
  const baseUrl = url.origin, test = baseUrl === gtaQaUrl;
  return { accountKey, apiKey, baseUrl, test, liveEnabled: process.env.GTA_AIRSKIP_LIVE_ENABLED === "true" };
}
// Existing QA bookings remain readable after production activation; keys never cross hosts.
export function getGtaBookingConfig(organizationId: string | null, baseUrl: string) {
  const active = getGtaConfig(organizationId);
  if (!active) return null;
  if (baseUrl === active.baseUrl) return active;
  if (baseUrl !== gtaQaUrl) return null;
  const accountKey = process.env.GTA_AIRSKIP_QA_ACCOUNT_KEY, apiKey = process.env.GTA_AIRSKIP_QA_API_KEY;
  if (!accountKey?.trim() || !apiKey?.trim() || /[\r\n]/.test(accountKey + apiKey)) return null;
  return { ...active, accountKey, apiKey, baseUrl: gtaQaUrl, test: true, liveEnabled: false };
}
// Configuration diagnostics contain setting names only, never API-key values.
export function getGtaSetupIssue(organizationId: string | null) {
  const required = ["GTA_AIRSKIP_ORGANIZATION_ID", "GTA_AIRSKIP_ACCOUNT_KEY", "GTA_AIRSKIP_API_KEY"];
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) return `Missing deployment settings: ${missing.join(", ")}. Add them to the Vercel Production environment and redeploy.`;
  if (!organizationId) return "This user is not assigned to a courier company. Contact the administrator.";
  if (organizationId !== process.env.GTA_AIRSKIP_ORGANIZATION_ID) return `GTA_AIRSKIP_ORGANIZATION_ID does not match this courier company. Expected value: ${organizationId}. Update the Production setting and redeploy.`;
  if (/[\r\n]/.test((process.env.GTA_AIRSKIP_ACCOUNT_KEY ?? "") + (process.env.GTA_AIRSKIP_API_KEY ?? ""))) return "GTA_AIRSKIP_ACCOUNT_KEY or GTA_AIRSKIP_API_KEY contains a line break. Paste each complete key on one line and redeploy.";
  if (!getGtaConfig(organizationId)) return "GTA_AIRSKIP_BASE_URL is invalid. Use https://tms-api-qa.gtagsm.com for QA or https://tms-api.gtagsm.com for production with no documentation path, query string or credentials, then redeploy.";
  return null;
}
type Config = NonNullable<ReturnType<typeof getGtaConfig>>;
export class GtaApiError extends Error { constructor(message: string, public tracking?: string) { super(message); } }
export function describeGtaRejection(body: unknown) {
  const envelope = gtaEnvelope(body);
  if (!envelope) return "GTA returned an undocumented response format: the isSuccess flag is missing or invalid. Ask GTA to confirm the response contract.";
  const message = typeof envelope.errorMessage === "string" ? envelope.errorMessage.toLowerCase() : "";
  // Only fixed categories leave the server. Never expose arbitrary provider text or PII.
  if (/api.?key|access.?key|account.?key|credential|unauthori|authenticat|authorization/.test(message)) return "GTA could not validate x-account-key / x-api-key. Confirm the account-key format and matching QA/production Access Key with GTA.";
  if (/account|customer.*(?:invalid|not found|inactive)/.test(message)) return "GTA rejected the account or its API access. Ask GTA to confirm the account key and account activation for this environment.";
  if (/(?:tracking|shipment|package).*(?:not found|not exist|no record)|(?:no|not found).*?(?:tracking|shipment|package)/.test(message)) return "GTA found no matching verification tracking reference. This lookup cannot conclusively verify credentials; a real parcel rate check is needed.";
  if (/permission|access denied|not allowed|forbidden/.test(message)) return "GTA denied access to this API operation. Ask GTA to verify endpoint permissions for this account.";
  return "GTA reported an unsuccessful API operation. Ask GTA to confirm the request contract and account access.";
}
async function request(path: string, payload: unknown, config: Config) {
  let response: Response;
  try { response = await fetch(config.baseUrl + path, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "x-account-key": config.accountKey, "x-api-key": config.apiKey }, body: JSON.stringify(payload), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000) }); }
  catch { throw new GtaApiError("GTA could not be reached or timed out."); }
  if (!response.ok) throw new GtaApiError([401,403].includes(response.status) ? `GTA rejected the API keys or account access. HTTP ${response.status}.` : path.startsWith("/shipment?") ? `GTA returned HTTP ${response.status}. A shipment may already be stored. Verify the existing booking and recover its label before any new creation.` : `GTA rejected the request. HTTP ${response.status}. Verify fields and route coverage with GTA.`);
  const reader = response.body?.getReader();
  if (!reader) throw new GtaApiError("GTA returned an empty response.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 5*1024*1024) { await reader.cancel(); throw new GtaApiError("GTA returned an oversized response."); } chunks.push(value); } }
  catch (issue) { if (issue instanceof GtaApiError) throw issue; throw new GtaApiError("GTA response could not be read."); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new GtaApiError("GTA returned invalid JSON."); }
  try { gtaData(body); } catch { throw new GtaApiError(describeGtaRejection(body)); }
  return body;
}
export async function requestGtaLabel(payload: unknown, config: Config) {
  // No automatic booking retries. Preserve the reservation and the known partner AWB on label failure.
  const body = await request("/shipment?pngLabel=true", payload, config);
  try { return parseGtaLabel(body); } catch (issue) { throw new GtaApiError(issue instanceof Error ? issue.message : "GTA label needs review.", gtaKnownTracking(gtaData(body))); }
}
export async function requestGtaRates(payload: unknown, config: Config) { return parseGtaRates(await request("/shipment/rate", payload, config)); }
export async function verifyGtaCredentials(config: Config) {
  // Read-only exact filter: never query all account shipments or create/reserve a booking.
  const tracking = `CONNECTIONCHECK-${crypto.randomUUID()}`;
  const body = await request("/trackings/get", { trackingNumbers: [tracking], includeHistory: false, page: 1, pageSize: 1 }, config);
  const data = gtaData(body);
  if (!Array.isArray(data)) throw new GtaApiError("GTA returned an unexpected tracking response. API access could not be verified.");
}
export async function requestGtaTracking(tracking: string, config: Config) { return parseGtaTracking(await request("/trackings/get", { trackingNumbers: [tracking], includeHistory: true, page: 1, pageSize: 10 }, config), tracking); }
export function safeGtaError(issue: unknown) { return issue instanceof GtaApiError ? issue.message : "GTA response could not be verified. Confirm the request with GTA."; }

export async function requestGtaTrackingRecord(tracking: string, config: Config) {
  return gtaTrackingRecord(await request("/trackings/get", { trackingNumbers: [tracking], includeHistory: false, page: 1, pageSize: 10 }, config), tracking);
}
export async function requestGtaReprint(tracking: string, format: "PDF" | "PNG" | "ZPL", config: Config) {
  if (!/^[A-Za-z0-9-]{2,100}$/.test(tracking)) throw new GtaApiError("Invalid saved tracking number.");
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/label/format?${new URLSearchParams({trackingNumber: tracking, format})}`, {
      headers: { "x-account-key": config.accountKey, "x-api-key": config.apiKey, Accept: "application/pdf, image/png, text/plain" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000),
    });
  } catch { throw new GtaApiError("GTA label reprint could not be reached. No new shipment was created."); }
  if (!response.ok) throw new GtaApiError(`GTA label reprint failed. HTTP ${response.status}. No new shipment was created.`);
  const reader = response.body?.getReader();
  if (!reader) throw new GtaApiError("GTA returned no label.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const {value,done} = await reader.read(); if(done) break; size += value.length; if(size > 3*1024*1024) { await reader.cancel(); throw new GtaApiError("GTA label is oversized."); } chunks.push(value); } }
  catch(issue) { if(issue instanceof GtaApiError) throw issue; throw new GtaApiError("GTA label could not be read."); }
  const bytes = Buffer.concat(chunks);
  if (gtaLabelFormat(bytes) !== format.toLowerCase()) throw new GtaApiError("GTA returned an invalid label document.");
  return bytes;
}

export function getGtaPickup(organizationId: string | null): GtaPickup | null {
  if (!getGtaConfig(organizationId)) return null;
  try {
    const pickup = JSON.parse(process.env.GTA_AIRSKIP_PICKUP_ADDRESS || "null");
    const fields = ["name", "phone", "address", "address2", "city", "state", "postalCode", "country"] as const;
    if (!pickup || fields.some(key => typeof pickup[key] !== "string" || pickup[key].length > 300)) return null;
    if (["name", "address", "city", "state", "postalCode"].some(key => !pickup[key].trim()) || !["CA", "US"].includes(pickup.country)) return null;
    return Object.fromEntries(fields.map(key => [key, pickup[key].trim()])) as GtaPickup;
  } catch { return null; }
}
