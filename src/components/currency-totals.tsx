import { formatMoney } from "@/lib/currency";

export function CurrencyTotals({ totals, emptyCurrency }: { totals: [string, number][]; emptyCurrency: string }) {
  return <span className="block space-y-1">{(totals.length ? totals : [[emptyCurrency, 0] as [string, number]]).map(([currency, amount]) => <span className="block" key={currency}>{formatMoney(amount, currency)}</span>)}</span>;
}
