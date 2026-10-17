import { getSupabaseEnv } from "@/lib/env";

type PublicTrackingPayload = {
  trackingNumber?: unknown;
  currentStatus?: unknown;
  updatedAt?: unknown;
  events?: unknown;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let trackingNumber = "";

  try {
    const body = await request.json() as { trackingNumber?: unknown };
    trackingNumber = typeof body.trackingNumber === "string"
      ? body.trackingNumber.trim().toUpperCase()
      : "";
  } catch {
    return json({ error: "Enter an AWB or reference number." }, 400);
  }

  if (!/^[A-Z0-9-]{3,80}$/.test(trackingNumber)) {
    return json({ error: "Enter a valid AWB or reference number." }, 400);
  }

  try {
    const { url, publishableKey } = getSupabaseEnv();
    const upstream = await fetch(
      `${url.replace(/\/$/, "")}/functions/v1/fastdrop-public-tracking`,
      {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trackingNumber }),
      },
    );

    const payload = await upstream.json().catch(() => null) as PublicTrackingPayload | null;
    if (upstream.status === 404) {
      return json({ error: "Shipment not found. Check the number and try again." }, 404);
    }
    if (!upstream.ok || !payload || typeof payload.currentStatus !== "string") {
      return json({ error: "Tracking is temporarily unavailable. Please try again." }, 503);
    }

    const events = Array.isArray(payload.events)
      ? payload.events.slice(0, 50).flatMap((event) => {
          if (!event || typeof event !== "object") return [];
          const item = event as { status?: unknown; timestamp?: unknown };
          if (typeof item.status !== "string") return [];
          return [{
            status: item.status,
            timestamp: typeof item.timestamp === "string" ? item.timestamp : null,
          }];
        })
      : [];

    return json({
      trackingNumber: typeof payload.trackingNumber === "string" ? payload.trackingNumber : trackingNumber,
      currentStatus: payload.currentStatus,
      updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
      events,
    });
  } catch {
    return json({ error: "Tracking is temporarily unavailable. Please try again." }, 503);
  }
}
