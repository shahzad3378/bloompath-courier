"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

export async function createSettlementAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["super_admin", "operations_admin", "finance_staff"]);

  const shipperId = String(formData.get("shipper_id") ?? "");
  const ledgerIds = formData
    .getAll("ledger_id")
    .map((value) => Number(String(value)))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (
    !profile.organization_id ||
    !/^[0-9a-f-]{36}$/i.test(shipperId) ||
    ledgerIds.length === 0
  ) {
    redirect("/finance?error=settlement");
  }

  const supabase = await createClient();

  const { data: shipper } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", shipperId)
    .eq("organization_id", profile.organization_id)
    .eq("role", "shipper")
    .maybeSingle();

  if (!shipper) {
    redirect("/finance?error=settlement");
  }

  const { data: ledgers, error: ledgerError } = await supabase
    .from("finance_ledger")
    .select(
      "id, shipment_id, shipper_id, tracking_number, cod_amount, delivery_charge, return_charge, total_charges, net_payable",
    )
    .in("id", ledgerIds)
    .eq("shipper_id", shipperId);

  if (ledgerError || !ledgers || ledgers.length !== ledgerIds.length) {
    redirect("/finance?error=settlement");
  }

  const { data: existingItems } = await supabase
    .from("settlement_items")
    .select("ledger_id")
    .in("ledger_id", ledgerIds);

  if ((existingItems ?? []).length > 0) {
    redirect("/finance?error=already_settled");
  }

  const now = new Date().toISOString();

  const transactionDates = await supabase
    .from("finance_ledger")
    .select("id, transaction_at")
    .in("id", ledgerIds);

  const dates = (transactionDates.data ?? [])
    .map((row) => new Date(row.transaction_at))
    .sort((a, b) => a.getTime() - b.getTime());

  const { data: settlement, error: settlementError } = await supabase
    .from("settlements")
    .insert({
      organization_id: profile.organization_id,
      shipper_id: shipperId,
      status: "draft",
      currency: "AED",
      period_from: dates[0]?.toISOString() ?? now,
      period_to: dates.at(-1)?.toISOString() ?? now,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (settlementError || !settlement) {
    redirect("/finance?error=settlement");
  }

  const items = ledgers.map((ledger) => ({
    settlement_id: settlement.id,
    ledger_id: ledger.id,
    shipment_id: ledger.shipment_id,
    tracking_number: ledger.tracking_number,
    cod_amount: ledger.cod_amount,
    delivery_charge: ledger.delivery_charge,
    return_charge: ledger.return_charge,
    total_charges: ledger.total_charges,
    net_payable: ledger.net_payable,
  }));

  const { error: itemError } = await supabase
    .from("settlement_items")
    .insert(items);

  if (itemError) {
    await supabase.from("settlements").delete().eq("id", settlement.id);
    redirect("/finance?error=settlement");
  }

  revalidatePath("/finance");
  redirect(`/finance?settlement=${settlement.id}&created=1`);
}

export async function updateSettlementStatusAction(
  formData: FormData,
): Promise<void> {
  await requireProfile(["super_admin", "operations_admin", "finance_staff"]);

  const settlementId = Number(String(formData.get("settlement_id") ?? ""));
  const status = String(formData.get("status") ?? "");

  if (
    !Number.isInteger(settlementId) ||
    settlementId <= 0 ||
    !["approved", "paid", "cancelled"].includes(status)
  ) {
    redirect("/finance?error=status");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("settlements")
    .update({ status })
    .eq("id", settlementId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(`/finance?settlement=${settlementId}&error=status`);
  }

  revalidatePath("/finance");
  redirect(`/finance?settlement=${settlementId}&status_saved=1`);
}
