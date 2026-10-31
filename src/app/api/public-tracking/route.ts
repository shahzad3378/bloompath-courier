import { getSupabaseEnv } from "@/lib/env";

type PublicTrackingPayload = {
  trackingNumber?: unknown;
  currentStatus?: unknown;
  updatedAt?: unknown;
  events?: unknown;
  podUrl?: unknown;
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

    const rawEvents = Array.isArray(payload.events)
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

    // A shipment has one booking milestone. Keep the original (earliest)
    // booking in its history and drop later duplicate booking events that can
    // otherwise make a delivered shipment look newly booked again.
    const bookingEvents = rawEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => /^(shipment\s+)?booked$/i.test(event.status.trim()));
    const originalBooking = bookingEvents.reduce<number | null>((earliest, current) => {
      if (earliest === null) return current.index;
      const currentTime = current.event.timestamp ? Date.parse(current.event.timestamp) : Number.POSITIVE_INFINITY;
      const earliestTime = rawEvents[earliest].timestamp ? Date.parse(rawEvents[earliest].timestamp!) : Number.POSITIVE_INFINITY;
      return currentTime < earliestTime ? current.index : earliest;
    }, null);
    const events = rawEvents.filter((event, index) =>
      !/^(shipment\s+)?booked$/i.test(event.status.trim()) || index === originalBooking,
    );
    // Delivery is terminal even when an older carrier scan arrives late.
    const delivered = events.find((event) => /^delivered$/i.test(event.status.trim()));
    const currentStatus = delivered?.status ?? events[0]?.status ?? payload.currentStatus;

    return json({
      trackingNumber: typeof payload.trackingNumber === "string" ? payload.trackingNumber : trackingNumber,
      currentStatus,
      updatedAt: delivered?.timestamp ?? events[0]?.timestamp ?? (typeof payload.updatedAt === "string" ? payload.updatedAt : null),
      events,
      podUrl: typeof payload.podUrl === "string" && payload.podUrl.startsWith("https://") ? payload.podUrl : null,
    });
  } catch {
    return json({ error: "Tracking is temporarily unavailable. Please try again." }, 503);
  }
}
