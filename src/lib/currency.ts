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
