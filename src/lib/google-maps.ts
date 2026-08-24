type GeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
};

export type RouteStop = {
  id: number;
  latitude: number;
  longitude: number;
};

export function parseCoordinatePair(
  latitudeValue: unknown,
  longitudeValue: unknown,
) {
  if (
    latitudeValue === null ||
    latitudeValue === undefined ||
    latitudeValue === "" ||
    longitudeValue === null ||
    longitudeValue === undefined ||
    longitudeValue === ""
  ) {
    return null;
  }

  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  return { latitude, longitude };
}

export function buildShipmentAddress(input: {
  address1: string;
  address2?: string | null;
  city: string;
  stateProvince?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
}) {
  return [input.address1, input.address2, input.city, input.stateProvince, input.postalCode, input.countryCode]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !address.trim()) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    console.error("GOOGLE_GEOCODE_ERROR", { httpStatus: response.status });
    return null;
  }
  const payload = (await response.json()) as { status?: string; error_message?: string; results?: Array<{ formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }> };
  if (payload.status !== "OK") {
    console.error("GOOGLE_GEOCODE_ERROR", {
      apiStatus: payload.status ?? "UNKNOWN",
      message: payload.error_message ?? null,
    });
    return null;
  }
  const first = payload.results?.[0];
  const latitude = Number(first?.geometry?.location?.lat);
  const longitude = Number(first?.geometry?.location?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, formattedAddress: first?.formatted_address ?? null };
}

export async function geocodeInBatches<T>(items: T[], worker: (item: T) => Promise<void>, concurrency = 5) {
  for (let index = 0; index < items.length; index += concurrency) await Promise.all(items.slice(index, index + concurrency).map(worker));
}

function waypoint(stop: RouteStop) {
  return { location: { latLng: { latitude: stop.latitude, longitude: stop.longitude } } };
}

export async function optimizeRouteStops(stops: RouteStop[]): Promise<number[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const valid = stops.flatMap((stop) => {
    const point = parseCoordinatePair(stop.latitude, stop.longitude);
    return point ? [{ ...stop, ...point }] : [];
  });
  if (!apiKey || valid.length < 2) return valid.map((stop) => stop.id);

  // Compute Routes supports 25 intermediate waypoints. For a courier run larger than
  // that, optimize in road-based chunks and preserve chunk order. This keeps every
  // stop sequenced while avoiding a failed oversized request.
  const chunks: RouteStop[][] = [];
  for (let index = 0; index < valid.length; index += 27) chunks.push(valid.slice(index, index + 27));
  const ordered: number[] = [];

  for (const chunk of chunks) {
    if (chunk.length < 3) {
      ordered.push(...chunk.map((stop) => stop.id));
      continue;
    }
    const origin = chunk[0];
    const destination = chunk[chunk.length - 1];
    const intermediates = chunk.slice(1, -1);
    try {
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex",
        },
        body: JSON.stringify({
          origin: waypoint(origin),
          destination: waypoint(destination),
          intermediates: intermediates.map(waypoint),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          optimizeWaypointOrder: true,
        }),
      });
      if (!response.ok) throw new Error(`Routes API ${response.status}`);
      const payload = (await response.json()) as { routes?: Array<{ optimizedIntermediateWaypointIndex?: number[] }> };
      const indexes = payload.routes?.[0]?.optimizedIntermediateWaypointIndex;
      if (!indexes || indexes.length !== intermediates.length) throw new Error("Routes API did not return a complete waypoint order");
      ordered.push(origin.id, ...indexes.map((index) => intermediates[index]?.id).filter((id): id is number => Number.isInteger(id)), destination.id);
    } catch (error) {
      console.error("ROUTE_OPTIMIZATION_ERROR", error);
      ordered.push(...chunk.map((stop) => stop.id));
    }
  }
  return ordered;
}
