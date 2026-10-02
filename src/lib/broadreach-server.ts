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

export async function requestBroadReachLabel(payload: ReturnType<typeof buildBroadReachShipment>, config: NonNullable<ReturnType<typeof getBroadReachConfig>>) {
  // No automatic retries: this API does not document a booking idempotency key.
  const response = await fetch("https://shipping-api.brdrch.com/api/v1", {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(25000),
    headers: {
      "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest",
      Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("BroadReach did not confirm the booking. Review its portal before retrying.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("BroadReach returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error("BroadReach response is too large. Review this booking in its portal."); }
    chunks.push(value);
  }
  return parseBroadReachResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
