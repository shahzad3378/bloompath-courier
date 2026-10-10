export const FALLBACK_CURRENCY = "AED";

export function normalizeCurrency(
  value: string | null | undefined,
) {
  const currency = String(value || "")
    .trim()
    .toUpperCase();

  return /^[A-Z]{3}$/.test(currency)
    ? currency
    : FALLBACK_CURRENCY;
}

export function formatMoney(
  value: unknown,
  currency: string,
) {
  return `${normalizeCurrency(currency)} ${Number(value || 0).toFixed(2)}`;
}

export type CurrencyAmount = {
  currency: string;
  amount: number;
};

export function rowCurrency(
  value: string | null | undefined,
  organizationCurrency: string,
) {
  const currency = String(value || "")
    .trim()
    .toUpperCase();

  if (/^[A-Z]{3}$/.test(currency)) {
    return currency;
  }

  return normalizeCurrency(organizationCurrency);
}

export function sumByCurrency<T>(
  rows: readonly T[],
  amount: (row: T) => unknown,
  currency: (row: T) => string | null | undefined,
  organizationCurrency: string,
) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const code = rowCurrency(
      currency(row),
      organizationCurrency,
    );
    const value = Number(amount(row) || 0);

    if (!Number.isFinite(value)) continue;

    totals.set(
      code,
      (totals.get(code) ?? 0) + value,
    );
  }

  return [...totals.entries()]
    .sort(([left], [right]) =>
      left.localeCompare(right),
    )
    .map(([code, total]) => ({
      currency: code,
      amount: total,
    }));
}

export function formatMoneyTotals(
  totals: readonly CurrencyAmount[],
  organizationCurrency: string,
  separator = " · ",
) {
  if (totals.length === 0) {
    return formatMoney(0, organizationCurrency);
  }

  return totals
    .map((total) =>
      formatMoney(total.amount, total.currency),
    )
    .join(separator);
}
