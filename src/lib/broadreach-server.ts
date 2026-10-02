import "server-only";
import { parseBroadReachResponse, type buildBroadReachShipment } from "@/lib/broadreach";

export function getBroadReachConfig(organizationId: string | null) {
  if (!organizationId || organizationId !== process.env.BROADREACH_ORGANIZATION_ID) return null;
  const username = process.env.BROADREACH_USERNAME;
  const password = process.env.BROADREACH_PASSWORD;
  const account = process.env.BROADREACH_ACCOUNT;
  if (!username || !password || !account || username.includes(":")) return null;
  return { username, password, account, liveEnabled: process.env.BROADREACH_LIVE_ENABLED === "true" };
}

export type BroadReachDiagnostic = {
  stage: "transport" | "http" | "response" | "label" | "rates";
  reason: "network_error" | "credentials_rejected" | "access_rejected" | "bad_request" | "upstream_error" | "empty_response" | "response_too_large" | "invalid_json" | "invalid_label" | "account_rejected" | "service_rejected" | "address_rejected" | "weight_rejected" | "no_rates";
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
};

export class BroadReachApiError extends Error {
  constructor(public diagnostic: BroadReachDiagnostic) {
    super(explanations[diagnostic.reason] + (diagnostic.httpStatus ? ` HTTP ${diagnostic.httpStatus}.` : ""));
    this.name = "BroadReachApiError";
  }
}

function providerReason(body: unknown): BroadReachDiagnostic["reason"] | null {
  if (!body || typeof body !== "object") return null;
  const response = body as Record<string, unknown>;
  const error = response.errorresponse ?? response.error ?? response.errors;
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
  const reader = response.body?.getReader();
  if (!reader) throw new BroadReachApiError({ stage: "response", reason: "empty_response", httpStatus });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new BroadReachApiError({ stage: "response", reason: "response_too_large", httpStatus }); }
      chunks.push(value);
    }
  } catch (issue) {
    if (issue instanceof BroadReachApiError) throw issue;
    throw new BroadReachApiError({ stage: "transport", reason: "network_error", httpStatus });
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "")); }
  catch { throw new BroadReachApiError({ stage: "response", reason: response.ok ? "invalid_json" : httpStatus === 400 ? "bad_request" : "upstream_error", httpStatus }); }
  const reason = providerReason(body);
  if (!response.ok || reason) throw new BroadReachApiError({ stage: response.ok ? "response" : "http", reason: reason ?? (httpStatus === 400 ? "bad_request" : "upstream_error"), httpStatus });
  return { body, httpStatus };
}

export async function requestBroadReachLabel(payload: ReturnType<typeof buildBroadReachShipment>, config: NonNullable<ReturnType<typeof getBroadReachConfig>>) {
  // No automatic retries: this API does not document a booking idempotency key.
  const { body, httpStatus } = await requestBroadReach(payload, config);
  try { return parseBroadReachResponse(body); }
  catch { throw new BroadReachApiError({ stage: "label", reason: "invalid_label", httpStatus }); }
}

export async function requestBroadReachRates(payload: { rateshipment: Record<string, string | number> }, config: NonNullable<ReturnType<typeof getBroadReachConfig>>) {
  // Rates only: no shipment/label creation and no booking reservation.
  const { body, httpStatus } = await requestBroadReach(payload, config);
  const rates = body && typeof body === "object" && "rateshipmentresponse" in body ? body.rateshipmentresponse : null;
  if (!Array.isArray(rates) || !rates.length || !rates.every((rate) => rate && typeof rate.service === "string" && rate.rate !== "" && rate.rate !== null && rate.rate !== undefined && Number.isFinite(Number(rate.rate)))) throw new BroadReachApiError({ stage: "rates", reason: "no_rates", httpStatus });
  return rates.length;
}

export function safeBroadReachError(issue: unknown) {
  const error = issue instanceof BroadReachApiError ? issue : new BroadReachApiError({ stage: "response", reason: "upstream_error" });
  return { message: error.message, diagnostic: error.diagnostic };
}
