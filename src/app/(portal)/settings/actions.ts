"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";

export type SettingsActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialState: SettingsActionState = {
  status: "idle",
  message: "",
};

export { initialState };

function text(
  formData: FormData,
  key: string,
  maxLength: number,
) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value.slice(0, maxLength) : null;
}

export async function saveOrganizationSettingsAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const profile = await requireProfile(["super_admin"]);

  if (!profile.organization_id) {
    return {
      status: "error",
      message: "Your account is not linked to an organization.",
    };
  }

  const awbPrefix = String(
    formData.get("awb_prefix") ?? "BP",
  )
    .trim()
    .toUpperCase();

  const defaultPrintFormat = String(
    formData.get("default_print_format") ?? "4x6",
  );

  const defaultServiceType = String(
    formData.get("default_service_type") ?? "next_day",
  );

  const defaultPrintCopies = Number(
    formData.get("default_print_copies"),
  );

  const standardDeliveryAttempts = Number(
    formData.get("standard_delivery_attempts"),
  );

  const defaultCodCycleDays = Number(
    formData.get("default_cod_cycle_days"),
  );

  const fourthAttemptAllowed =
    String(formData.get("fourth_attempt_allowed") ?? "") ===
    "true";

  if (!/^[A-Z0-9]{2,6}$/.test(awbPrefix)) {
    return {
      status: "error",
      message: "AWB prefix must be 2 to 6 letters or numbers.",
    };
  }

  if (
    !["4x6", "a4"].includes(defaultPrintFormat) ||
    !["same_day", "next_day", "standard"].includes(
      defaultServiceType,
    ) ||
    !Number.isInteger(defaultPrintCopies) ||
    defaultPrintCopies < 1 ||
    defaultPrintCopies > 10 ||
    !Number.isInteger(standardDeliveryAttempts) ||
    standardDeliveryAttempts < 1 ||
    standardDeliveryAttempts > 3 ||
    !Number.isInteger(defaultCodCycleDays) ||
    defaultCodCycleDays < 1 ||
    defaultCodCycleDays > 90
  ) {
    return {
      status: "error",
      message: "Please review the operational settings.",
    };
  }

  const supabase = await createClient();
  const currency = await resolveOrganizationCurrency(
    supabase,
    profile.organization_id,
  );

  const { error } = await supabase
    .from("organization_settings")
    .upsert(
      {
        organization_id: profile.organization_id,
        legal_name: text(formData, "legal_name", 150),
        display_name: text(formData, "display_name", 120),
        contact_email: text(formData, "contact_email", 160),
        contact_phone: text(formData, "contact_phone", 30),
        website: text(formData, "website", 200),
        address: text(formData, "address", 500),
        city: text(formData, "city", 100),
        trn: text(formData, "trn", 50),
        awb_brand_name: text(formData, "awb_brand_name", 120),
        awb_prefix: awbPrefix,
        default_print_format: defaultPrintFormat,
        default_print_copies: defaultPrintCopies,
        default_service_type: defaultServiceType,
        standard_delivery_attempts: standardDeliveryAttempts,
        fourth_attempt_allowed: fourthAttemptAllowed,
        currency,
        default_cod_cycle_days: defaultCodCycleDays,
      },
      {
        onConflict: "organization_id",
      },
    );

  if (error) {
    return {
      status: "error",
      message:
        error.message ||
        "Organization settings could not be saved.",
    };
  }

  revalidatePath("/settings");

  return {
    status: "success",
    message: "Organization settings saved successfully.",
  };
}
