"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FinanceActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const financeRoles = ["super_admin", "operations_admin", "finance_staff"] as const;

function numericId(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  return /^\d+$/.test(value) ? value : null;
}

function money(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function receiveDriverCodAction(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const profile = await requireProfile(financeRoles);

  const entryId = numericId(formData, "entry_id");
  const amount = money(formData, "amount");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);

  if (!profile.organization_id || !entryId || amount === null) {
    return {
      status: "error",
      message: "Enter a valid COD amount.",
    };
  }

  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("driver_cod_entries")
    .select("id, outstanding_amount")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry) {
    return {
      status: "error",
      message: "COD entry was not found.",
    };
  }

  if (amount > Number(entry.outstanding_amount)) {
    return {
      status: "error",
      message: `Amount cannot exceed AED ${Number(entry.outstanding_amount).toFixed(2)}.`,
    };
  }

  const { error } = await supabase.from("driver_cod_receipts").insert({
    organization_id: profile.organization_id,
    driver_cod_entry_id: Number(entryId),
    amount_received: amount,
    received_by: profile.id,
    notes: notes || null,
  });

  if (error) {
    return {
      status: "error",
      message: "COD receipt could not be saved.",
    };
  }

  revalidatePath("/finance");

  return {
    status: "success",
    message: "Driver COD received successfully.",
  };
}
