import Link from "next/link";

export function BillingFilters({ pathname, params, shippers, currencies, deliveryDates = false }: {
  pathname: string; params: Record<string, string | undefined>;
  shippers: { id: string; name: string }[]; currencies: string[]; deliveryDates?: boolean;
}) {
  return <form action={pathname} className="bp-panel mt-6 grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
    <label className="text-xs font-bold">Shipper<select name="shipper" defaultValue={params.shipper || ""} className="bp-input mt-2 w-full"><option value="">All shippers</option>{shippers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="text-xs font-bold">Currency<select name="currency" defaultValue={params.currency || ""} className="bp-input mt-2 w-full"><option value="">All currencies · separate totals</option>{currencies.map(c => <option key={c}>{c}</option>)}</select></label>
    <label className="text-xs font-bold">{deliveryDates ? "Delivery date from" : "From date"}<input type="date" name="from" defaultValue={params.from} className="bp-input mt-2 w-full" /></label>
    <label className="text-xs font-bold">{deliveryDates ? "Delivery date to" : "To date"}<input type="date" name="to" defaultValue={params.to} className="bp-input mt-2 w-full" /></label>
    <div className="flex items-end gap-3"><button className="bp-button-primary">Apply filters</button><Link href={pathname} className="text-xs font-bold underline">Reset</Link></div>
  </form>;
}
