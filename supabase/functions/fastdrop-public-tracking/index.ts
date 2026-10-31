import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FASTDROP_ORG_ID = "edb6f2a6-1e35-45b6-a60c-35b8ca4aa01e";

const statusLabels: Record<string, string> = {
  booked: "Shipment booked",
  ready_for_pickup: "Pickup scheduled",
  picked_up: "Picked up",
  at_warehouse: "Arrived at warehouse",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  undelivered: "Delivery attempt unsuccessful",
  return_initiated: "Return in progress",
  returned_to_shipper: "Returned to sender",
  cancelled: "Shipment cancelled",
  arrived_at_destination_airport_customs_started:
    "Arrived at destination airport — customs clearance started",
  customs_clearance_completed_warehouse_scanned:
    "Customs clearance completed — shipment scanned in warehouse",
};

function allowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (
    origin === "https://fastdropinc.com" ||
    origin === "https://www.fastdropinc.com" ||
    origin === "https://script.google.com" ||
    origin === "https://script.googleusercontent.com"
  ) return true;
  try {
    return new URL(origin).hostname.endsWith(".script.googleusercontent.com");
  } catch {
    return false;
  }
}

function response(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin && allowedOrigin(origin) ? origin : "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Vary": "Origin",
    },
  });
}

function labelFor(status: string): string {
  return statusLabels[status] ?? "Shipment update";
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!allowedOrigin(origin)) return response({ error: "Tracking service unavailable." }, 403, origin);
  if (request.method === "OPTIONS") return response({}, 200, origin);
  if (request.method !== "POST") return response({ error: "Use POST to track a shipment." }, 405, origin);
  if (!PROJECT_URL || !SERVICE_KEY) return response({ error: "Tracking is temporarily unavailable." }, 503, origin);

  let body: { trackingNumber?: unknown };
  try {
    body = await request.json();
  } catch {
    return response({ error: "Enter your tracking number." }, 400, origin);
  }

  const trackingNumber = typeof body.trackingNumber === "string"
    ? body.trackingNumber.trim().toUpperCase()
    : "";
  if (!/^[A-Z0-9-]{3,80}$/.test(trackingNumber)) {
    return response({ error: "Enter a valid AWB or reference number." }, 400, origin);
  }

  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  try {
    const baseShipmentQuery = {
      select: "id,tracking_number,customer_tracking_status,updated_at,deleted_at",
      organization_id: `eq.${FASTDROP_ORG_ID}`,
      deleted_at: "is.null",
      limit: "1",
    };
    const awbParams = new URLSearchParams({
      ...baseShipmentQuery,
      tracking_number: `eq.${trackingNumber}`,
    });
    const shipmentResponse = await fetch(`${PROJECT_URL}/rest/v1/shipments?${awbParams}`, { headers });
    if (!shipmentResponse.ok) return response({ error: "Tracking is temporarily unavailable." }, 503, origin);
    const awbShipments = await shipmentResponse.json();
    let shipment = Array.isArray(awbShipments) ? awbShipments[0] : null;

    // AWB matches take priority. If no AWB matches, accept the exact reference
    // number case-insensitively within the same Fast Drop organization.
    if (!shipment) {
      const referenceParams = new URLSearchParams({
        ...baseShipmentQuery,
        reference_number: `ilike.${trackingNumber}`,
      });
      const referenceResponse = await fetch(`${PROJECT_URL}/rest/v1/shipments?${referenceParams}`, { headers });
      if (!referenceResponse.ok) return response({ error: "Tracking is temporarily unavailable." }, 503, origin);
      const referenceShipments = await referenceResponse.json();
      shipment = Array.isArray(referenceShipments) ? referenceShipments[0] : null;
    }
    if (!shipment) return response({ error: "Shipment not found. Check the tracking number and try again." }, 404, origin);

    const eventParams = new URLSearchParams({
      select: "status,created_at",
      organization_id: `eq.${FASTDROP_ORG_ID}`,
      shipment_id: `eq.${shipment.id}`,
      order: "created_at.desc,id.desc",
      limit: "50",
    });
    const eventResponse = await fetch(`${PROJECT_URL}/rest/v1/customer_tracking_events?${eventParams}`, { headers });
    if (!eventResponse.ok) return response({ error: "Tracking is temporarily unavailable." }, 503, origin);
    const rawEvents = await eventResponse.json();
    // A customs-cleared warehouse scan already records receipt into this
    // warehouse. Hide subsequent generic receipt scans for that same stay.
    // Dispatch/transit/return movement starts a new stay so reattempt receipts
    // remain visible. Keep all original audit rows and scan timestamps.
    let warehouseAlreadyScanned = false;
    const warehouseEvents = (Array.isArray(rawEvents) ? rawEvents : [])
      .slice().reverse().filter((event) => {
        if (event.status === "customs_clearance_completed_warehouse_scanned") {
          warehouseAlreadyScanned = true;
        } else if (["in_transit", "out_for_delivery", "undelivered",
          "return_initiated", "returned_to_shipper"].includes(event.status)) {
          warehouseAlreadyScanned = false;
        } else if (event.status === "at_warehouse" && warehouseAlreadyScanned) {
          return false;
        }
        return true;
      }).reverse();
    const events = warehouseEvents
      .filter((event) => typeof event.status === "string")
      .map((event) => ({ status: labelFor(event.status), timestamp: event.created_at }))
      .filter((event, index, list) => event.status === "Shipment booked" || index === 0 || event.status !== list[index - 1].status);

    // Late pre-delivery updates remain in the audit table but must not reopen
    // a delivered parcel or appear as a new delivery movement to the customer.
    const delivered = events.find((event) => event.status === "Delivered");
    if (delivered) {
      const deliveredAt = Date.parse(delivered.timestamp);
      const visible = events.filter((event) => event === delivered ||
        (event.status !== "Delivered" && Date.parse(event.timestamp) < deliveredAt));
      events.splice(0, events.length, ...visible);
    }
    const bookings = events.filter((event) => event.status === "Shipment booked");
    const originalBooking = bookings.at(-1);
    const visibleEvents = events.filter((event) => event.status !== "Shipment booked" || event === originalBooking);
    events.splice(0, events.length, ...visibleEvents);

    if (events.length === 0 && typeof shipment.customer_tracking_status === "string") {
      events.push({ status: labelFor(shipment.customer_tracking_status), timestamp: shipment.updated_at });
    }

    const currentStatus = events[0]?.status ?? "Shipment booked";
    let podUrl: string | null = null;
    try {
      const proofParams = new URLSearchParams({
        select: "proof_path",
        organization_id: `eq.${FASTDROP_ORG_ID}`,
        shipment_id: `eq.${shipment.id}`,
        outcome: "eq.delivered",
        proof_path: "not.is.null",
        order: "created_at.desc",
        limit: "1",
      });
      const proofResponse = await fetch(`${PROJECT_URL}/rest/v1/delivery_attempts?${proofParams}`, { headers });
      if (!proofResponse.ok) console.error("POD proof lookup failed", { shipmentId: shipment.id, status: proofResponse.status });
      if (proofResponse.ok) {
        const proofs = await proofResponse.json();
        let proofPath = Array.isArray(proofs) ? proofs[0]?.proof_path : null;
        if (!proofPath) {
          const manualParams = new URLSearchParams({
            select: "proof_path", organization_id: `eq.${FASTDROP_ORG_ID}`,
            shipment_id: `eq.${shipment.id}`, status: "eq.delivered",
            proof_path: "not.is.null", order: "created_at.desc,id.desc", limit: "1",
          });
          const manualResponse = await fetch(`${PROJECT_URL}/rest/v1/customer_tracking_events?${manualParams}`, { headers });
          if (manualResponse.ok) {
            const manualProofs = await manualResponse.json();
            proofPath = Array.isArray(manualProofs) ? manualProofs[0]?.proof_path : null;
          }
        }
        if (!proofPath) console.warn("POD proof path not found", { shipmentId: shipment.id });
        if (typeof proofPath === "string" && proofPath.length > 0) {
          const encodedPath = proofPath.split("/").map((part: string) => encodeURIComponent(part)).join("/");
          const signedResponse = await fetch(
            `${PROJECT_URL}/storage/v1/object/sign/delivery-proofs/${encodedPath}`,
            {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ expiresIn: 3600 }),
            },
          );
          if (!signedResponse.ok) console.error("POD signing failed", { shipmentId: shipment.id, status: signedResponse.status });
          if (signedResponse.ok) {
            const signed = await signedResponse.json();
            if (typeof signed.signedURL !== "string") console.error("POD signing response missing signedURL", { shipmentId: shipment.id });
            if (typeof signed.signedURL === "string") {
              const storageBase = PROJECT_URL.endsWith("/") ? PROJECT_URL.slice(0, -1) : PROJECT_URL;
              podUrl = signed.signedURL.startsWith("http")
                ? signed.signedURL
                : `${storageBase}/storage/v1${signed.signedURL.startsWith("/") ? signed.signedURL : `/${signed.signedURL}`}`;
            }
          }
        }
      }
    } catch (podError) {
      console.error("POD processing failed", { shipmentId: shipment.id, error: String(podError) });
      // POD availability must not block the shipment status lookup.
    }

    return response({
      trackingNumber: shipment.tracking_number,
      currentStatus,
      updatedAt: events[0]?.timestamp ?? shipment.updated_at,
      events,
      podUrl,
      timeZone: "America/Toronto",
    }, 200, origin);
  } catch {
    return response({ error: "Tracking is temporarily unavailable." }, 503, origin);
  }
});
