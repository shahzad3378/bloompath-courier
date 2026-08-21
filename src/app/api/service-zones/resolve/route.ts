import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  resolveServiceZone,
  type ServiceZone,
} from "@/lib/service-zones";
import { createClient } from "@/lib/supabase/server";

function cleanText(
  value: unknown,
  maxLength: number,
) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();

  if (
    !profile ||
    profile.status !== "active" ||
    !profile.organization_id
  ) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401 },
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
  const city = cleanText(body.city, 80);
  const area = cleanText(body.area, 120);

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return NextResponse.json(
      { message: "Invalid country" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_zones")
    .select(`
      id,
      name,
      zone_type,
      postal_prefix,
      postal_from,
      postal_to,
      city,
      district,
      area
    `)
    .eq(
      "organization_id",
      profile.organization_id,
    )
    .eq("country_code", countryCode)
    .eq("is_active", true);

  if (error) {
    return NextResponse.json(
      { message: "Zone lookup failed" },
      { status: 500 },
    );
  }

  const zones = (data ?? []) as ServiceZone[];
  const matchedZone = resolveServiceZone(
    zones,
    postalCode,
    city,
    area,
  );

  return NextResponse.json({
    configured: zones.length > 0,
    zone: matchedZone
      ? {
          id: matchedZone.id,
          name: matchedZone.name,
          city: matchedZone.city,
          district: matchedZone.district,
          area: matchedZone.area,
          type: matchedZone.zone_type,
        }
      : null,
  });
}
