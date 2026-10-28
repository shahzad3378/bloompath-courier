import "server-only";
import { parseBroadReachResponse, type BroadReachSender, type buildBroadReachShipment, type buildBroadReachRates } from "@/lib/broadreach";

export function getBroadReachConfig(organizationId: string | null) {
  if (!organizationId || organizationId !== process.env.BROADREACH_ORGANIZATION_ID) return null;
  const username = process.env.BROADREACH_USERNAME;
  const password = process.env.BROADREACH_PASSWORD;
  const account = process.env.BROADREACH_ACCOUNT;
  if (!username || !password || !account || username.includes(":")) return null;
  return { username, password, account, liveEnabled: process.env.BROADREACH_LIVE_ENABLED === "true" };
}

export function getBroadReachSender(organizationId: string | null): BroadReachSender | null {
  if (!organizationId || organizationId !== process.env.BROADREACH_ORGANIZATION_ID) return null;
  try {
    const pickup = JSON.parse(process.env.GTA_AIRSKIP_PICKUP_ADDRESS || "null");
    const fields = ["name", "phone", "address", "address2", "city", "state", "postalCode", "country"] as const;
    if (!pickup || fields.some(key => typeof pickup[key] !== "string" || pickup[key].length > 300)) return null;
    if (["name", "address", "city", "state", "postalCode"].some(key => !pickup[key].trim()) || !["CA", "US"].includes(pickup.country)) return null;
    return Object.fromEntries(fields.map(key => [key, pickup[key].trim()])) as BroadReachSender;
  } catch { return null; }
}

export type BroadReachDiagnostic = {
  stage: "transport" | "http" | "response" | "label" | "rates";
  reason: "network_error" | "credentials_rejected" | "access_rejected" | "bad_request" | "upstream_error" | "empty_response" | "response_too_large" | "invalid_json" | "invalid_label" | "account_rejected" | "service_rejected" | "address_rejected" | "weight_rejected" | "no_rates" | "label_host_rejected" | "label_download_failed";
  httpStatus?: number;
};

const explanations: Record<BroadReachDiagnostic["reason"], string> = {
  network_error: "BroadReach could not be reached or timed out.",
  credentials_rejected: "BroadReach rejected the API credentials. Verify the Shipping API username/password; portal login details may be different.",
  access_rejected: "BroadReach rejected API access. The required request header is included; ask BroadReach to verify account/API access.",
  bad_request: "BroadReach rejected the request fields.",
  upstream_error: "BroadReach returned an API error.",
  empty_response: "BroadReach returned an empty response.",
  response_too_large: "BroadReach returned an oversized response.",
  invalid_json: "BroadReach returned a response that is not valid JSON.",
  invalid_label: "BroadReach responded but did not return a valid supported PDF, PNG or ZPL label with tracking.",
  account_rejected: "BroadReach rejected the account code. Check BROADREACH_ACCOUNT and its access for these API credentials.",
  service_rejected: "BroadReach rejected the requested service. Confirm ca_rateshop / us_rateshop are enabled for this account.",
  address_rejected: "BroadReach rejected an address or postal/ZIP code. Check sender and recipient address fields.",
  weight_rejected: "BroadReach rejected the weight or parcel dimensions.",
  no_rates: "BroadReach responded but returned no valid rates. Confirm account service coverage for these addresses.",
  label_host_rejected: "BroadReach returned a label URL on an unapproved host. An administrator must verify and configure BROADREACH_LABEL_HOSTS before downloading it. Recover the generated label from BroadReach; do not rebook.",
  label_download_failed: "BroadReach generated a shipment but its label download failed. Recover the label from BroadReach; do not rebook.",
};

export class BroadReachApiError extends Error {
  constructor(public diagnostic: BroadReachDiagnostic, public tracking?: string) {
    super(explanations[diagnostic.reason] + (diagnostic.httpStatus ? ` HTTP ${diagnostic.httpStatus}.` : ""));
    this.name = "BroadReachApiError";
  }
}

function providerReason(body: unknown): BroadReachDiagnostic["reason"] | null {
  if (!body || typeof body !== "object") return null;
  const response = body as Record<string, unknown>;
  const scopes = [response, response.rateshipmentresponse, response.shipmentresponse];
  const error = scopes.flatMap(scope => scope && typeof scope === "object" && !Array.isArray(scope) ? ["errorresponse", "error", "errors"].map(key => (scope as Record<string, unknown>)[key]) : [])
    .find(value => Array.isArray(value) ? value.length > 0 : value && (typeof value !== "object" || Object.keys(value).length > 0));
  if (!error) return null;
  // Match known error categories only. Never return/log arbitrary provider text or PII.
  const text = JSON.stringify(error).toLowerCase();
  if (/credential|unauthori|authentication|invalid.*password/.test(text)) return "credentials_rejected";
  if (/account/.test(text)) return "account_rejected";
  if (/service/.test(text)) return "service_rejected";
  if (/postal|zip|address|province/.test(text)) return "address_rejected";
  if (/weight|dimension|length|width|height/.test(text)) return "weight_rejected";
  return "upstream_error";
}

async function requestBroadReach(payload: unknown, config: NonNullable<ReturnType<typeof getBroadReachConfig>>) {
  let response: Response;
  try {
    response = await fetch("https://shipping-api.brdrch.com/api/v1", {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(25000),
      headers: {
        "Content-Type": "application/json", "Accept": "application/json", "X-Requested-With": "XMLHttpRequest",
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
      },
      body: JSON.stringify(payload),
    });
  } catch { throw new BroadReachApiError({ stage: "transport", reason: "network_error" }); }
  const httpStatus = response.status;
  if ([401, 403].includes(httpStatus)) throw new BroadReachApiError({ stage: "http", reason: httpStatus === 401 ? "credentials_rejected" : "access_rejected", httpStatus });
  const bytes = await readBoundedResponse(response);
  let body: unknown;
  try { body = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")); }
  catch { throw new BroadReachApiError({ stage: "response", reason: response.ok ? "invalid_json" : httpStatus === 400 ? "bad_request" : "upstream_error", httpStatus }); }
  const reason = providerReason(body);
  if (!response.ok || reason) throw new BroadReachApiError({ stage: response.ok ? "response" : "http", reason: reason ?? (httpStatus === 400 ? "bad_request" : "upstream_error"), httpStatus });
  return { body, httpStatus };
}

async function readBoundedResponse(response: Response, limit = 5 * 1024 * 1024) {
  const httpStatus = response.status;
  const reader = response.body?.getReader();
  if (!reader) throw new BroadReachApiError({ stage: "response", reason: "empty_response", httpStatus });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new BroadReachApiError({ stage: "response", reason: "response_too_large", httpStatus }); }
      chunks.push(value);
    }
  } catch (issue) {
    if (issue instanceof BroadReachApiError) throw issue;
    throw new BroadReachApiError({ stage: "transport", reason: "network_error", httpStatus });
  }
  return Buffer.concat(chunks);
}

export async function requestBroadReachLabel(payload: ReturnType<typeof buildBroadReachShipment>, config: NonNullable<ReturnType<typeof getBroadReachConfig>>) {
  // No automatic retries: this API does not document a booking idempotency key.
  const { body, httpStatus } = await requestBroadReach(payload, config);
  const result = body && typeof body === "object" && "shipmentresponse" in body && body.shipmentresponse && typeof body.shipmentresponse === "object" ? body.shipmentresponse as Record<string, unknown> : null;
  const rawTracking = result?.trackingNumber ?? result?.tracknbr;
  const tracking = typeof rawTracking === "string" && rawTracking.trim().length >= 2 && rawTracking.trim().length <= 100 ? rawTracking.trim() : undefined;
  try {
    if (result && tracking && !result.label) {
      const document = Array.isArray(result.documents) ? result.documents.find(doc => doc && doc.type === "shipping_label" && typeof doc.url === "string") : undefined;
      const rawUrl = result.labelUrl ?? document?.url;
      if (typeof rawUrl === "string") {
        let url: URL;
        try { url = new URL(rawUrl); } catch { throw new BroadReachApiError({ stage: "label", reason: "label_host_rejected" }, tracking); }
        const allowed = new Set(["shipping-api.brdrch.com", ...(process.env.BROADREACH_LABEL_HOSTS ?? "").split(",").map(host => host.trim().toLowerCase()).filter(Boolean)]);
        if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !allowed.has(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":") || /(^|\.)(localhost|local|internal)$/.test(url.hostname)) throw new BroadReachApiError({ stage: "label", reason: "label_host_rejected" }, tracking);
        const headers: Record<string, string> = { Accept: "application/pdf,image/png,text/plain", "X-Requested-With": "XMLHttpRequest" };
        // Never forward API credentials to a separate CDN or follow redirects.
        if (url.origin === "https://shipping-api.brdrch.com") headers.Authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
        let downloaded: Response;
        try { downloaded = await fetch(url.href, { method: "GET", headers, redirect: "error", cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(25000) }); }
        catch { throw new BroadReachApiError({ stage: "label", reason: "label_download_failed" }, tracking); }
        if (!downloaded.ok) throw new BroadReachApiError({ stage: "label", reason: "label_download_failed", httpStatus: downloaded.status }, tracking);
        const bytes = await readBoundedResponse(downloaded, 3 * 1024 * 1024);
        return parseBroadReachResponse({ shipmentresponse: { ...result, label: bytes.toString("base64"), labelformat: result.labelFormat ?? result.labelformat ?? document?.format } });
      }
    }
    return parseBroadReachResponse(body);
  } catch (issue) {
    if (issue instanceof BroadReachApiError) { issue.tracking ??= tracking; throw issue; }
    throw new BroadReachApiError({ stage: "label", reason: "invalid_label", httpStatus }, tracking);
  }
}

export async function requestBroadReachRates(payload: ReturnType<typeof buildBroadReachRates>, config: NonNullable<ReturnType<typeof getBroadReachConfig>>) {
  // Rates only: no shipment/label creation and no booking reservation.
  const { body, httpStatus } = await requestBroadReach(payload, config);
  const response = body && typeof body === "object" && "rateshipmentresponse" in body ? body.rateshipmentresponse : null;
  const rates = Array.isArray(response) ? response : response && typeof response === "object" && "services" in response ? response.services : null;
  if (!Array.isArray(rates) || !rates.length || !rates.every((rate) => { const total = rate?.total ?? rate?.rate; return rate && typeof rate.service === "string" && total !== "" && total !== null && total !== undefined && Number.isFinite(Number(total)); })) throw new BroadReachApiError({ stage: "rates", reason: "no_rates", httpStatus });
  return rates.length;
}

export function safeBroadReachError(issue: unknown) {
  const error = issue instanceof BroadReachApiError ? issue : new BroadReachApiError({ stage: "response", reason: "upstream_error" });
  return { message: error.message, diagnostic: error.diagnostic, tracking: error.tracking };
}
