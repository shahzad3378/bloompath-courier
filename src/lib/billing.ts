export type BillingEntry = {
  id: number; shipper_id: string; shipment_id: number; tracking_number: string;
  currency: string; transaction_type: string; transaction_at: string;
  cod_amount: number | string; delivery_charge: number | string;
  return_charge: number | string; fulfillment_charge: number | string;
  total_charges: number | string; net_payable: number | string;
};

export function currencyTotals<T extends { currency: string }>(rows: T[], value: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + value(row));
  return [...totals].sort(([a], [b]) => a.localeCompare(b));
}

export function netBalance(cod: number, charges: number, tax = 0) {
  const net = Math.round((cod - charges - tax) * 100) / 100;
  return { payable: Math.max(net, 0), receivable: Math.max(-net, 0) };
}

export function validInvoiceIds(values: FormDataEntryValue[]) {
  const ids = values.map(Number);
  return ids.length > 0 && ids.length <= 5000 && new Set(ids).size === ids.length &&
    ids.every(id => Number.isSafeInteger(id) && id > 0) ? ids : null;
}
