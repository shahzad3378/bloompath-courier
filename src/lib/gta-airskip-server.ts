import "server-only";
import { gtaData, gtaKnownTracking, parseGtaLabel, parseGtaRates, parseGtaTracking } from "@/lib/gta-airskip";
export const gtaQaUrl = "https://tms-api-qa.gtagsm.com";
export function getGtaConfig(organizationId: string | null) {
  if (!organizationId || organizationId !== process.env.GTA_AIRSKIP_ORGANIZATION_ID) return null;
  const accountKey = process.env.GTA_AIRSKIP_ACCOUNT_KEY, apiKey = process.env.GTA_AIRSKIP_API_KEY;
  if (!accountKey || !apiKey || /[\r\n]/.test(accountKey + apiKey)) return null;
  let url: URL;
  try { url = new URL(process.env.GTA_AIRSKIP_BASE_URL || gtaQaUrl); } catch { return null; }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".gtagsm.com") || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
  const baseUrl = url.origin, test = baseUrl === gtaQaUrl;
  return { accountKey, apiKey, baseUrl, test, liveEnabled: process.env.GTA_AIRSKIP_LIVE_ENABLED === "true" };
}
type Config = NonNullable<ReturnType<typeof getGtaConfig>>;
export class GtaApiError extends Error { constructor(message: string, public tracking?: string) { super(message); } }
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
  try { gtaData(body); } catch { throw new GtaApiError("GTA rejected the request or returned an invalid response. Verify fields and account access with GTA."); }
  return body;
}
export async function requestGtaLabel(payload: unknown, config: Config) {
  // No automatic booking retries. Preserve the reservation and the known partner AWB on label failure.
  const body = await request("/shipment?pngLabel=true", payload, config);
  try { return parseGtaLabel(body); } catch (issue) { throw new GtaApiError(issue instanceof Error ? issue.message : "GTA label needs review.", gtaKnownTracking(gtaData(body))); }
}
export async function requestGtaRates(payload: unknown, config: Config) { return parseGtaRates(await request("/shipment/rate", payload, config)); }
export async function requestGtaTracking(tracking: string, config: Config) { return parseGtaTracking(await request("/trackings/get", { trackingNumbers: [tracking], includeHistory: true, page: 1, pageSize: 10 }, config), tracking); }
export function safeGtaError(issue: unknown) { return issue instanceof GtaApiError ? issue.message : "GTA response could not be verified. Confirm the request with GTA."; }
