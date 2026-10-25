import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const roles = ["super_admin", "operations_admin", "finance_staff"] as const;

function mappingRule(zone: { zone_type: string; postal_prefix: string | null; postal_from: string | null; postal_to: string | null; city: string | null; district: string | null; area: string | null }) {
  if (zone.zone_type === "postal_prefix") return `Prefix ${zone.postal_prefix || "—"} → ${zone.city || "—"}`;
  if (zone.zone_type === "postal_range") return `${zone.postal_from || "—"}–${zone.postal_to || "—"} → ${zone.city || "—"}`;
  if (zone.zone_type === "district") return `${zone.city || "—"} · ${zone.district || "—"}`;
  if (zone.zone_type === "area") return `${zone.city || "—"} · ${zone.area || "—"}`;
  return zone.city || "—";
}

export async function GET(_request: Request, { params }: { params: Promise<{ shipperId: string; cardId: string }> }) {
  const profile = await requireProfile(roles);
  const { shipperId, cardId } = await params;
  if (!profile.organization_id || !/^[0-9a-f-]{36}$/i.test(shipperId) || !/^[0-9a-f-]{36}$/i.test(cardId)) {
    return new Response("Not found", { status: 404 });
  }
  const db = await createClient();
  const { data: card, error: cardError } = await db.from("carrier_rate_cards")
    .select("id,card_name,country_code,shipper_id,import_status")
    .eq("id", cardId).eq("shipper_id", shipperId).eq("organization_id", profile.organization_id)
    .eq("import_status", "active").maybeSingle();
  if (cardError || !card) return new Response("Rate card not found", { status: 404 });

  const [{ data: zones, error: zoneError }, { data: mappings, error: mappingError }] = await Promise.all([
    db.from("service_zones").select("id,country_code,name,zone_type,postal_prefix,postal_from,postal_to,city,district,area")
      .eq("organization_id", profile.organization_id).eq("country_code", card.country_code).eq("is_active", true).order("name"),
    db.from("carrier_service_zone_map").select("service_zone_id,zone_code").eq("organization_id", profile.organization_id).eq("rate_card_id", cardId),
  ]);
  if (zoneError || mappingError) return new Response("Mapping template could not be created", { status: 500 });
  const current = new Map((mappings ?? []).map(row => [Number(row.service_zone_id), row.zone_code]));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BloomPath Courier";
  const guide = workbook.addWorksheet("Instructions");
  guide.columns = [{ width: 28 }, { width: 100 }];
  guide.addRows([
    ["3PL service-zone mapping", `Rate card: ${card.card_name} · ${card.country_code}`],
    ["MAP", "Enter MAP in Action and an exact 3PL Zone Code from this rate card to create or update a mapping."],
    ["UNMAP", "Enter UNMAP in Action to remove a mapping for that Service Zone ID."],
    ["Leave unchanged", "Leave Action blank to ignore that row. Existing zone codes are included for reference."],
    ["Validation", "Service Zone IDs must belong to this destination market. 3PL Zone Codes must exist in this rate card."],
    ["Important", "Mappings affect carrier cost comparison only. They do not change customer delivery charges."],
  ]);
  guide.getRow(1).font = { bold: true, color: { argb: "FF13734B" } };
  guide.eachRow(row => { row.height = 28; row.alignment = { vertical: "middle", wrapText: true }; });
  const sheet = workbook.addWorksheet("Zone Mappings");
  sheet.columns = [
    { header: "Action", key: "action", width: 16 },
    { header: "Service Zone ID", key: "service_zone_id", width: 20 },
    { header: "Country Code", key: "country_code", width: 16 },
    { header: "Service Zone", key: "service_zone", width: 44 },
    { header: "Mapping Rule", key: "mapping_rule", width: 52 },
    { header: "3PL Zone Code", key: "3pl_zone_code", width: 20 },
  ];
  for (const zone of zones ?? []) sheet.addRow({ action: "", service_zone_id: zone.id, country_code: zone.country_code, service_zone: zone.name, mapping_rule: mappingRule(zone), "3pl_zone_code": current.get(Number(zone.id)) || "" });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "F1" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174EA6" } };
  const bytes = await workbook.xlsx.writeBuffer();
  const safeName = String(card.card_name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "rate-card";
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${safeName}-zone-mapping.xlsx"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
