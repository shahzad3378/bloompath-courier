import { formatMoney } from "@/lib/currency";

export function CurrencyTotals({ totals, emptyCurrency }: { totals: [string, number][]; emptyCurrency: string }) {
  return <div className="space-y-1">{(totals.length ? totals : [[emptyCurrency, 0] as [string, number]]).map(([currency, amount]) => <p key={currency}>{formatMoney(amount, currency)}</p>)}</div>;
}
