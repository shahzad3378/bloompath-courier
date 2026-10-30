"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { resolveServiceZone, type ServiceZone } from "@/lib/service-zones";

export type EditShipmentState = { message: string };

export async function editShipmentAction(_state: EditShipmentState, form: FormData): Promise<EditShipmentState> {
  const profile = await requireProfile(internalRoles);
  const id = String(form.get("shipment_id") || "");
  if (!profile.organization_id || !/^\d+$/.test(id)) return { message: "Shipment is unavailable." };
  const supabase = await createClient();
  const { data: shipment } = await supabase.from("shipments").select("*")
    .eq("id", id).eq("organization_id", profile.organization_id).is("deleted_at", null).maybeSingle();
  if (!shipment) return { message: "Shipment is unavailable." };
  if (shipment.updated_at !== form.get("updated_at")) return { message: "This shipment changed. Reload the page before editing again." };
  const values: Record<string, string | number | null> = {};
  const fields: [string, number, number][] = [
    ["reference_number", 0, 80], ["sender_name", 2, 120], ["sender_phone", 7, 20],
    ["sender_address", 5, 500], ["sender_address_2", 0, 500], ["sender_city", 2, 80],
    ["sender_state_province", 0, 120], ["sender_postal_code", 0, 30],
    ["consignee_name", 2, 120], ["consignee_phone", 7, 20], ["consignee_alt_phone", 0, 20],
    ["consignee_address", 5, 500], ["consignee_address_2", 0, 500], ["consignee_city", 2, 80],
    ["consignee_state_province", 0, 120], ["consignee_postal_code", 0, 30],
    ["consignee_area", 0, 120], ["consignee_landmark", 0, 200],
    ["parcel_description", 2, 500], ["delivery_instructions", 0, 500],
  ];
  for (const [key, min, max] of fields) {
    const value = String(form.get(key) || "").trim();
    if (value.length < min || value.length > max) return { message: `Check ${key.replaceAll("_", " ")}: ${min}–${max} characters required.` };
    values[key] = value || null;
  }
  for (const side of ["sender", "consignee"]) {
    if (["CA", "US"].includes(shipment[`${side}_country_code`]) &&
      (!values[`${side}_state_province`] || !values[`${side}_postal_code`])) {
      return { message: `Add ${side} State / Province and postal / ZIP code for Canada or USA.` };
    }
  }
  const { data: zones, error: zoneError } = await supabase.from("service_zones")
    .select("id,name,zone_type,postal_prefix,postal_from,postal_to,city,district,area")
    .eq("organization_id", profile.organization_id).eq("country_code", shipment.consignee_country_code).eq("is_active", true);
  if (zoneError) return { message: "Delivery zones could not be checked. Try saving again." };
  const zone = resolveServiceZone((zones || []) as ServiceZone[], values.consignee_postal_code as string | null,
    values.consignee_city as string, values.consignee_area as string | null);
  if (zones?.length && !zone) return { message: "This delivery location is outside your configured service zones." };
  values.service_zone_id = zone?.id ?? null;
  values.service_zone_name = zone?.name ?? null;
  // Save corrections only: never reserve, cancel, rebook, or change carrier/driver/status.
  const { data, error } = await supabase.from("shipments").update(values)
    .eq("id", id).eq("organization_id", profile.organization_id).eq("updated_at", shipment.updated_at)
    .is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) return { message: error?.code === "23505" ? "This reference number is already used." : "Changes were not saved. Reload the shipment and try again." };
  for (const path of ["/shipments", `/shipments/${id}`, "/dispatch/3pl", "/courier-integrations/broadreach"]) revalidatePath(path);
  redirect(`/shipments/${id}?saved=1`);
}
