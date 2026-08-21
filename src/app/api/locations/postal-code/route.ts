import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GeocodingResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    address_components?: AddressComponent[];
    formatted_address?: string;
    partial_match?: boolean;
  }>;
};

function cleanText(
  value: unknown,
  maxLength: number,
) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function componentValue(
  components: AddressComponent[],
  types: string[],
) {
  return components.find((component) =>
    types.some((type) =>
      component.types.includes(type),
    ),
  )?.long_name;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();

  if (!profile || profile.status !== "active") {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401 },
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        message:
          "Google postal lookup is not configured.",
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<
      string,
      unknown
    >;
  } catch {
    return NextResponse.json(
      { message: "Invalid request" },
      { status: 400 },
    );
  }

  const countryCode = cleanText(
    body.countryCode,
    2,
  ).toUpperCase();
  const postalCode = cleanText(
    body.postalCode,
    30,
  );

  if (
    !/^[A-Z]{2}$/.test(countryCode) ||
    postalCode.length < 2
  ) {
    return NextResponse.json(
      { message: "Enter a valid postal prefix." },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({
    address: postalCode,
    components: `country:${countryCode}`,
    language: "en",
    key: apiKey,
  });

  let geocodingResponse: Response;

  try {
    geocodingResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    return NextResponse.json(
      {
        message:
          "Google location lookup is temporarily unavailable.",
      },
      { status: 502 },
    );
  }

  if (!geocodingResponse.ok) {
    return NextResponse.json(
      {
        message:
          "Google location lookup could not be completed.",
      },
      { status: 502 },
    );
  }

  const geocoding =
    (await geocodingResponse.json()) as GeocodingResponse;

  if (
    geocoding.status === "ZERO_RESULTS" ||
    !geocoding.results?.[0]
  ) {
    return NextResponse.json({
      found: false,
      message:
        "No city was found for this postal prefix.",
    });
  }

  if (geocoding.status !== "OK") {
    console.error(
      "Google postal lookup failed:",
      geocoding.status,
      geocoding.error_message || "No details",
    );

    return NextResponse.json(
      {
        message:
          "Google rejected the postal lookup. Check the API key, billing and Geocoding API restriction.",
      },
      { status: 502 },
    );
  }

  const result = geocoding.results[0];
  const components =
    result.address_components ?? [];
  const city = componentValue(components, [
    "locality",
    "postal_town",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ]);
  const district = componentValue(components, [
    "sublocality_level_1",
    "sublocality",
    "administrative_area_level_3",
  ]);

  if (!city) {
    return NextResponse.json({
      found: false,
      message:
        "Google found the location but did not return a city.",
    });
  }

  return NextResponse.json({
    found: true,
    city,
    district: district || null,
    formattedAddress:
      result.formatted_address || null,
    partialMatch: Boolean(result.partial_match),
  });
}
