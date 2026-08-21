type GeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
};

export function buildShipmentAddress(input: {
  address1: string;
  address2?: string | null;
  city: string;
  stateProvince?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
}) {
  return [
    input.address1,
    input.address2,
    input.city,
    input.stateProvince,
    input.postalCode,
    input.countryCode,
  ]
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
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  if (payload.status !== "OK") return null;
  const first = payload.results?.[0];
  const latitude = Number(first?.geometry?.location?.lat);
  const longitude = Number(first?.geometry?.location?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    formattedAddress: first?.formatted_address ?? null,
  };
}

export async function geocodeInBatches<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency = 5,
) {
  for (let index = 0; index < items.length; index += concurrency) {
    await Promise.all(items.slice(index, index + concurrency).map(worker));
  }
}
