export const serviceZoneTypes = [
  "postal_prefix",
  "postal_range",
  "city",
  "district",
  "area",
] as const;

export type ServiceZoneType =
  (typeof serviceZoneTypes)[number];

export type ServiceZone = {
  id: number;
  name: string;
  zone_type: string;
  postal_prefix: string | null;
  postal_from: string | null;
  postal_to: string | null;
  city: string | null;
  district: string | null;
  area: string | null;
};

export function normalizePostal(
  value: string | null,
) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeLocation(
  value: string | null,
) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function postalInRange(
  postal: string,
  from: string,
  to: string,
) {
  const normalizedPostal =
    normalizePostal(postal);
  const normalizedFrom = normalizePostal(from);
  const normalizedTo = normalizePostal(to);

  if (
    !normalizedPostal ||
    !normalizedFrom ||
    !normalizedTo
  ) {
    return false;
  }

  if (
    /^\d+$/.test(normalizedPostal) &&
    /^\d+$/.test(normalizedFrom) &&
    /^\d+$/.test(normalizedTo)
  ) {
    const postalNumber = Number(
      normalizedPostal,
    );

    return (
      postalNumber >= Number(normalizedFrom) &&
      postalNumber <= Number(normalizedTo)
    );
  }

  return (
    normalizedPostal >= normalizedFrom &&
    normalizedPostal <= normalizedTo
  );
}

export function resolveServiceZone(
  zones: ServiceZone[],
  postalCode: string | null,
  city: string,
  area: string | null,
) {
  const postal = normalizePostal(postalCode);
  const normalizedCity =
    normalizeLocation(city);
  const normalizedArea =
    normalizeLocation(area);

  const matches: Array<{
    zone: ServiceZone;
    score: number;
  }> = [];

  for (const zone of zones) {
    if (
      zone.zone_type === "postal_prefix" &&
      zone.postal_prefix &&
      postal &&
      postal.startsWith(
        normalizePostal(zone.postal_prefix),
      )
    ) {
      matches.push({
        zone,
        score:
          500 +
          normalizePostal(
            zone.postal_prefix,
          ).length,
      });
      continue;
    }

    if (
      zone.zone_type === "postal_range" &&
      zone.postal_from &&
      zone.postal_to &&
      postal &&
      postalInRange(
        postal,
        zone.postal_from,
        zone.postal_to,
      )
    ) {
      matches.push({ zone, score: 450 });
      continue;
    }

    if (
      zone.zone_type === "area" &&
      zone.area &&
      normalizedArea &&
      normalizeLocation(zone.area) ===
        normalizedArea
    ) {
      matches.push({ zone, score: 350 });
      continue;
    }

    if (
      zone.zone_type === "district" &&
      zone.district &&
      normalizedArea &&
      normalizeLocation(zone.district) ===
        normalizedArea
    ) {
      matches.push({ zone, score: 300 });
      continue;
    }

    if (
      zone.zone_type === "city" &&
      zone.city &&
      normalizeLocation(zone.city) ===
        normalizedCity
    ) {
      matches.push({ zone, score: 200 });
    }
  }

  matches.sort(
    (first, second) =>
      second.score - first.score,
  );

  return matches[0]?.zone ?? null;
}
