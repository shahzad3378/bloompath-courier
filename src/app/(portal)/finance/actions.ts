"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
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

  const currency = await resolveOrganizationCurrency(
    supabase,
    profile.organization_id,
  );

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
      message: `Amount cannot exceed ${formatMoney(entry.outstanding_amount, currency)}.`,
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
      "id, shipment_id, shipper_id, tracking_number, cod_amount, delivery_charge, return_charge, fulfillment_charge, total_charges, net_payable, currency",
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

  const currency = await resolveOrganizationCurrency(
    supabase,
    profile.organization_id,
  );

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
      currency,
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
    fulfillment_charge: ledger.fulfillment_charge,
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

export async function createInvoiceFromAwbsAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(financeRoles);
  const shipperId = String(formData.get("shipper_id") ?? "");
  const ids = formData.getAll("ledger_id").map((value) => Number(value));
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const recipientEmail = String(formData.get("recipient_email") ?? "").trim().slice(0, 160);
  const taxRate = Number(String(formData.get("tax_rate") ?? "0"));
  const todayDubai = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  if (!profile.organization_id || !/^[0-9a-f-]{36}$/i.test(shipperId) ||
    ids.length === 0 || ids.length > 100 || new Set(ids).size !== ids.length ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 ||
    (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < todayDubai)) ||
    (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))) {
    redirect("/finance/invoices/new?error=invalid");
  }

  const supabase = await createClient();
  const { data: shipper } = await supabase.from("profiles").select("id")
    .eq("id", shipperId).eq("organization_id", profile.organization_id).eq("role", "shipper").maybeSingle();
  if (!shipper) redirect("/finance/invoices/new?error=invalid");

  const { data: ledgers, error: ledgerError } = await supabase.from("finance_ledger")
    .select("id, shipment_id, shipper_id, tracking_number, cod_amount, delivery_charge, return_charge, fulfillment_charge, total_charges, net_payable, currency, transaction_at")
    .eq("organization_id", profile.organization_id).eq("shipper_id", shipperId).in("id", ids);
  if (ledgerError || !ledgers || ledgers.length !== ids.length ||
    ledgers.some((row) => row.currency !== ledgers[0].currency)) {
    redirect("/finance/invoices/new?error=invalid");
  }

  const { data: billed, error: billedError } = await supabase.from("settlement_items")
    .select("ledger_id").in("ledger_id", ids);
  if (billedError || (billed ?? []).length) redirect("/finance/invoices/new?error=already_settled");

  const dates = ledgers.map((row) => row.transaction_at).sort();
  const { data: settlement, error: settlementError } = await supabase.from("settlements").insert({
    organization_id: profile.organization_id,
    shipper_id: shipperId,
    currency: ledgers[0].currency,
    status: "draft",
    period_from: dates[0],
    period_to: dates.at(-1),
    created_by: profile.id,
  }).select("id").single();
  if (settlementError || !settlement) redirect("/finance/invoices/new?error=save");

  const { error: itemsError } = await supabase.from("settlement_items").insert(ledgers.map((row) => ({
    settlement_id: settlement.id,
    ledger_id: row.id,
    shipment_id: row.shipment_id,
    tracking_number: row.tracking_number,
    cod_amount: row.cod_amount,
    delivery_charge: row.delivery_charge,
    return_charge: row.return_charge,
    fulfillment_charge: row.fulfillment_charge,
    total_charges: row.total_charges,
    net_payable: row.net_payable,
  })));
  if (itemsError) {
    await supabase.from("settlements").delete().eq("id", settlement.id).eq("organization_id", profile.organization_id);
    redirect("/finance/invoices/new?error=already_settled");
  }

  const { data: approved, error: approvalError } = await supabase.from("settlements")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", settlement.id).eq("organization_id", profile.organization_id).select("id").maybeSingle();
  if (approvalError || !approved) redirect(`/finance/settlements?error=invoice&settlement=${settlement.id}`);

  const { data: invoiceId, error: invoiceError } = await supabase.rpc("create_invoice_from_settlement", {
    target_settlement_id: settlement.id,
    target_due_date: dueDate || null,
    target_tax_rate: taxRate,
    target_recipient_email: recipientEmail || null,
  });
  if (invoiceError || !invoiceId) {
    console.error("CREATE_INVOICE_FROM_AWBS_ERROR", invoiceError);
    redirect(`/finance/settlements?error=invoice&settlement=${settlement.id}`);
  }
  revalidatePath("/finance");
  revalidatePath("/finance/settlements");
  revalidatePath("/finance/invoices");
  redirect(`/finance/invoices/${invoiceId}?created=1`);
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

export async function createInvoiceFromSettlementAction(
  formData: FormData,
): Promise<void> {
  await requireProfile([
    "super_admin",
    "operations_admin",
    "finance_staff",
  ]);

  const settlementId = Number(
    String(formData.get("settlement_id") ?? ""),
  );

  const dueDateRaw = String(
    formData.get("due_date") ?? "",
  ).trim();

  const taxRate = Number(
    String(formData.get("tax_rate") ?? "0"),
  );

  const recipientEmail = String(
    formData.get("recipient_email") ?? "",
  )
    .trim()
    .slice(0, 160);

  if (
    !Number.isInteger(settlementId) ||
    settlementId <= 0 ||
    !Number.isFinite(taxRate) ||
    taxRate < 0 ||
    taxRate > 100
  ) {
    redirect("/finance/settlements?error=invoice");
  }

  const supabase = await createClient();

  const { data: invoiceId, error } =
    await supabase.rpc(
      "create_invoice_from_settlement",
      {
        target_settlement_id: settlementId,
        target_due_date:
          dueDateRaw || null,
        target_tax_rate: taxRate,
        target_recipient_email:
          recipientEmail || null,
      },
    );

  if (error || !invoiceId) {
    redirect(
      `/finance/settlements?error=invoice&settlement=${settlementId}`,
    );
  }

  revalidatePath("/finance");
  revalidatePath("/finance/settlements");
  revalidatePath("/finance/invoices");

  redirect(
    `/finance/invoices/${invoiceId}?created=1`,
  );
}

export async function updateInvoiceStatusAction(
  formData: FormData,
): Promise<void> {
  const profile = await requireProfile([
    "super_admin",
    "operations_admin",
    "finance_staff",
  ]);

  const invoiceId = Number(
    String(formData.get("invoice_id") ?? ""),
  );

  const action = String(
    formData.get("invoice_action") ?? "",
  );

  const paymentReference = String(
    formData.get("payment_reference") ?? "",
  )
    .trim()
    .slice(0, 120);

  if (
    !profile.organization_id ||
    !Number.isInteger(invoiceId) ||
    invoiceId <= 0 ||
    !["issue", "mark_paid"].includes(action)
  ) {
    redirect("/finance/invoices?error=invoice_status");
  }

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, settlement_id, status")
    .eq("id", invoiceId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!invoice) {
    redirect("/finance/invoices?error=invoice_status");
  }

  if (action === "issue") {
    if (invoice.status !== "draft") {
      redirect(`/finance/invoices/${invoiceId}?error=invalid_status`);
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "issued",
        issued_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (error) {
      redirect(`/finance/invoices/${invoiceId}?error=issue`);
    }
  }

  if (action === "mark_paid") {
    if (!["issued", "sent", "overdue"].includes(invoice.status)) {
      redirect(`/finance/invoices/${invoiceId}?error=invalid_status`);
    }

    const now = new Date().toISOString();

    const { error: invoiceError } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: now,
        paid_by: profile.id,
        payment_reference: paymentReference || null,
      })
      .eq("id", invoiceId);

    if (invoiceError) {
      redirect(`/finance/invoices/${invoiceId}?error=paid`);
    }

    const { error: settlementError } = await supabase
      .from("settlements")
      .update({
        status: "paid",
      })
      .eq("id", invoice.settlement_id)
      .eq("status", "approved");

    if (settlementError) {
      redirect(`/finance/invoices/${invoiceId}?error=settlement_paid`);
    }
  }

  revalidatePath("/finance");
  revalidatePath("/finance/settlements");
  revalidatePath("/finance/invoices");
  revalidatePath(`/finance/invoices/${invoiceId}`);
  revalidatePath("/reports");

  redirect(`/finance/invoices/${invoiceId}?status_saved=1`);
}
