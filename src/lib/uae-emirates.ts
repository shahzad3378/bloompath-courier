const emirates = [
  ["Abu Dhabi", "AZ", "AUH", "Abu Zaby", "Al Ain", "Al Dhafra"],
  ["Ajman", "AJ", "AJM", "Ajman City", "Masfout", "Manama"],
  ["Dubai", "DU", "DXB", "Dubayy", "Hatta"],
  ["Fujairah", "FU", "FUJ", "Al Fujayrah", "Dibba Al Fujairah"],
  ["Ras Al Khaimah", "RK", "RAK", "Ra's Al Khaymah"],
  ["Sharjah", "SH", "SHJ", "Ash Shariqah", "Sarjah", "Kalba", "Khor Fakkan", "Khorfakkan", "Dibba Al Hisn"],
  ["Umm Al Quwain", "UQ", "UAQ", "Umm Al Qaywayn"],
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/^ae[- ]/, "").replace(/[^a-z]/g, "");
}

export function uaeEmirate(value: string | null | undefined) {
  const key = normalize(value ?? "");
  return emirates.find((names) => names.some((name) => normalize(name) === key))?.[0];
}

export function isUaeDomestic(sender: string | null | undefined, consignee: string | null | undefined) {
  return sender?.trim().toUpperCase() === "AE" && consignee?.trim().toUpperCase() === "AE";
}
