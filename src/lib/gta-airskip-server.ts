import "server-only";
import { gtaData, gtaKnownTracking, parseGtaLabel, parseGtaRates, parseGtaTracking } from "@/lib/gta-airskip";
export const gtaQaUrl = "https://tms-api-qa.gtagsm.com";
export function getGtaConfig(organizationId: string | null) {
  if (!organizationId || organizationId !== process.env.GTA_AIRSKIP_ORGANIZATION_ID) return null;
  const accountKey = process.env.GTA_AIRSKIP_ACCOUNT_KEY, apiKey = process.env.GTA_AIRSKIP_API_KEY;
  if (!accountKey?.trim() || !apiKey?.trim() || /[\r\n]/.test(accountKey + apiKey)) return null;
  let url: URL;
  try { url = new URL(process.env.GTA_AIRSKIP_BASE_URL || gtaQaUrl); } catch { return null; }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".gtagsm.com") || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
  const baseUrl = url.origin, test = baseUrl === gtaQaUrl;
  return { accountKey, apiKey, baseUrl, test, liveEnabled: process.env.GTA_AIRSKIP_LIVE_ENABLED === "true" };
}
// Configuration diagnostics contain setting names only, never API-key values.
export function getGtaSetupIssue(organizationId: string | null) {
  const required = ["GTA_AIRSKIP_ORGANIZATION_ID", "GTA_AIRSKIP_ACCOUNT_KEY", "GTA_AIRSKIP_API_KEY"];
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) return `Missing deployment settings: ${missing.join(", ")}. Add them to the Vercel Production environment and redeploy.`;
  if (!organizationId) return "This user is not assigned to a courier company. Contact the administrator.";
  if (organizationId !== process.env.GTA_AIRSKIP_ORGANIZATION_ID) return `GTA_AIRSKIP_ORGANIZATION_ID does not match this courier company. Expected value: ${organizationId}. Update the Production setting and redeploy.`;
  if (/[\r\n]/.test((process.env.GTA_AIRSKIP_ACCOUNT_KEY ?? "") + (process.env.GTA_AIRSKIP_API_KEY ?? ""))) return "GTA_AIRSKIP_ACCOUNT_KEY or GTA_AIRSKIP_API_KEY contains a line break. Paste each complete key on one line and redeploy.";
  if (!getGtaConfig(organizationId)) return "GTA_AIRSKIP_BASE_URL is invalid. For QA, use https://tms-api-qa.gtagsm.com with no documentation path, query string or credentials, then redeploy.";
  return null;
}
type Config = NonNullable<ReturnType<typeof getGtaConfig>>;
export class GtaApiError extends Error { constructor(message: string, public tracking?: string) { super(message); } }
export function describeGtaRejection(body: unknown) {
  if (!body || typeof body !== "object" || !("isSuccess" in body) || typeof body.isSuccess !== "boolean") return "GTA returned an undocumented response format: the isSuccess flag is missing or invalid. Ask GTA to confirm the response contract.";
  const message = "errorMessage" in body && typeof body.errorMessage === "string" ? body.errorMessage.toLowerCase() : "";
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
  if (!response.ok) throw new GtaApiError([401,403].includes(response.status) ? `GTA rejected the API keys or account access. HTTP ${response.status}.` : `GTA rejected the request. HTTP ${response.status}. Verify fields and route coverage with GTA.`);
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
