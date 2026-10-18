"use server";

import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { type Shipment } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export type ScanPrintLookup =
  | { ok: true; shipment: Shipment }
  | { ok: false; message: string };

export async function lookupShipmentForLabel(rawAwb: string): Promise<ScanPrintLookup> {
  const profile = await requireProfile(internalRoles);
  const awb = String(rawAwb ?? "").trim().toUpperCase();

  if (!awb || awb.length > 80) {
    return { ok: false, message: "Scan or enter a valid AWB number." };
  }

  if (!profile.organization_id) {
    return { ok: false, message: "Your account is not linked to an organization." };
  }

  const supabase = await createClient();
  const { data: matches, error } = await supabase
    .from("shipments")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .eq("tracking_number", awb)
    .is("deleted_at", null)
    .limit(2);

  if (error) {
    return { ok: false, message: "Shipment lookup failed. Check the connection and scan again." };
  }

  if ((matches ?? []).length > 1) {
    return { ok: false, message: "This AWB appears more than once. Ask an administrator to check the shipment records." };
  }

  const shipment = matches?.[0] as Shipment | undefined;
  if (!shipment) {
    return { ok: false, message: `${awb} was not found in your organization. Check the AWB and scan again.` };
  }

  return { ok: true, shipment };
}
