export const trackingTimeZones = [
  { value: "Asia/Dubai", label: "Dubai, UAE" },
  { value: "America/Toronto", label: "Toronto / Eastern Canada" },
  { value: "America/Vancouver", label: "Vancouver / Pacific Canada" },
  { value: "America/Edmonton", label: "Calgary / Edmonton" },
  { value: "America/Winnipeg", label: "Winnipeg / Central Canada" },
  { value: "America/Regina", label: "Saskatchewan" },
  { value: "America/Halifax", label: "Atlantic Canada" },
  { value: "America/St_Johns", label: "Newfoundland" },
  { value: "America/Whitehorse", label: "Yukon" },
] as const;

export type TrackingTimeZone = (typeof trackingTimeZones)[number]["value"];

export function isTrackingTimeZone(value: string): value is TrackingTimeZone {
  return trackingTimeZones.some((zone) => zone.value === value);
}

function localParts(epochMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function formatDateTimeLocal(date: Date, timeZone: TrackingTimeZone) {
  const parts = localParts(date.getTime(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseDateTimeLocal(value: string, timeZone: TrackingTimeZone): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const [year, month, day, hour, minute] = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const localEpoch = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(localEpoch);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;

  const candidates = new Set<number>();
  let guess = localEpoch;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    candidates.add(guess);
    const parts = localParts(guess, timeZone);
    const displayedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess = localEpoch - (displayedAsUtc - guess);
    candidates.add(guess);
  }

  const matches = [...candidates].filter((candidate) => {
    const parts = localParts(candidate, timeZone);
    return Number(parts.year) === year
      && Number(parts.month) === month
      && Number(parts.day) === day
      && Number(parts.hour) === hour
      && Number(parts.minute) === minute;
  });
  if (!matches.length) return null;
  return new Date(Math.min(...matches)).toISOString();
}

const canadaCityZones: Array<[string, TrackingTimeZone]> = [
  ["toronto|mississauga|brampton|markham|vaughan|ottawa|hamilton|windsor|london|kingston|oshawa|montreal|montreal|quebec|québec", "America/Toronto"],
  ["vancouver|surrey|victoria|burnaby|richmond|kelowna|nanaimo|abbotsford|prince george", "America/Vancouver"],
  ["calgary|edmonton|red deer|lethbridge|fort mcmurray", "America/Edmonton"],
  ["winnipeg|brandon", "America/Winnipeg"],
  ["regina|saskatoon", "America/Regina"],
  ["halifax|moncton|fredericton|saint john|charlottetown", "America/Halifax"],
  ["st john|st. john|newfoundland", "America/St_Johns"],
  ["whitehorse|yukon", "America/Whitehorse"],
];

function canadaZone(city: string, postalCode: string): TrackingTimeZone {
  const normalizedCity = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [cities, zone] of canadaCityZones) {
    if (new RegExp(`\\b(${cities})\\b`, "i").test(normalizedCity)) return zone;
  }

  switch (postalCode.trim().toUpperCase().charAt(0)) {
    case "A": return "America/St_Johns";
    case "B": case "C": case "E": return "America/Halifax";
    case "R": return "America/Winnipeg";
    case "S": return "America/Regina";
    case "T": return "America/Edmonton";
    case "V": return "America/Vancouver";
    case "Y": return "America/Whitehorse";
    case "G": case "H": case "J": case "K": case "L": case "M": case "N": case "P":
      return "America/Toronto";
    default: return "America/Toronto";
  }
}

export type ShipmentTimeZoneInput = {
  sender_country_code: string | null;
  sender_city: string;
  sender_postal_code: string | null;
  consignee_country_code: string | null;
  consignee_city: string;
  consignee_postal_code: string | null;
};

export function inferTrackingTimeZone(shipment: ShipmentTimeZoneInput, status: string): TrackingTimeZone {
  const destinationMilestone = ["arrived_at_destination_airport_customs_started", "customs_clearance_completed_warehouse_scanned", "out_for_delivery", "delivered", "undelivered", "return_initiated", "returned_to_shipper"].includes(status);
  const endpoints = destinationMilestone
    ? [
        { country: shipment.consignee_country_code, city: shipment.consignee_city, postal: shipment.consignee_postal_code },
        { country: shipment.sender_country_code, city: shipment.sender_city, postal: shipment.sender_postal_code },
      ]
    : [
        { country: shipment.sender_country_code, city: shipment.sender_city, postal: shipment.sender_postal_code },
        { country: shipment.consignee_country_code, city: shipment.consignee_city, postal: shipment.consignee_postal_code },
      ];
  const canadianEndpoint = endpoints.find((endpoint) => endpoint.country?.toUpperCase() === "CA");
  return canadianEndpoint ? canadaZone(canadianEndpoint.city, canadianEndpoint.postal ?? "") : "Asia/Dubai";
}
