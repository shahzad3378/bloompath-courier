import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Clock3, PackageCheck, RotateCcw, Truck, WalletCards } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatAed, formatDubaiDate, type Shipment } from "@/lib/shipments";

const toneClass = {
  green: "bg-[#e6f5ed] text-[#188459]",
  blue: "bg-[#e8f0fb] text-[#376eb1]",
  teal: "bg-[#e4f5f3] text-[#27847c]",
  orange: "bg-[#fff2df] text-[#c47717]",
  red: "bg-[#fdeaea] text-[#c45151]",
  purple: "bg-[#f0eafb] text-[#7251ae]",
};

type DashboardStats = {
  booked: number;
  outForDelivery: number;
  delivered: number;
  undelivered: number;
  returns: number;
  codCollected: number;
};

type RecentShipment = Pick<Shipment, "id" | "tracking_number" | "consignee_name" | "consignee_city" | "cod_amount" | "status" | "booked_at">;

export function DashboardUI({ name, stats, recent }: { name: string; stats: DashboardStats; recent: RecentShipment[] }) {
  const statCards = [
    { label: "Shipments booked", value: String(stats.booked), note: "Today", icon: PackageCheck, tone: "green" },
    { label: "Out for delivery", value: String(stats.outForDelivery), note: "Active routes", icon: Truck, tone: "blue" },
    { label: "Delivered", value: String(stats.delivered), note: "Today", icon: ArrowUpRight, tone: "teal" },
    { label: "Undelivered", value: String(stats.undelivered), note: "Needs action", icon: ArrowDownRight, tone: "orange" },
    { label: "Returns pending", value: String(stats.returns), note: "RTO queue", icon: RotateCcw, tone: "red" },
    { label: "COD collected", value: formatAed(stats.codCollected), note: "Today", icon: WalletCards, tone: "purple" },
  ] as const;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="fade-up flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="text-sm font-semibold text-[#188459]">Operations overview</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Good day, {name.split(" ")[0] || "Team"}</h1><p className="mt-2 text-sm text-[#74827b]">Your live courier activity will appear here as modules are activated.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-[#dfe7e3] bg-white px-4 py-2.5 text-sm text-[#56655e] shadow-sm"><Clock3 className="size-4 text-[#188459]" /> Today · UAE operations</div>
      </div>

      <section className="fade-up-delay mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {statCards.map(({ label, value, note, icon: Icon, tone }) => (
          <article key={label} className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]"><div className={`grid size-10 place-items-center rounded-xl ${toneClass[tone]}`}><Icon className="size-5" /></div><p className="mt-5 text-2xl font-bold tracking-tight text-[#17231e]">{value}</p><p className="mt-1 text-sm font-semibold text-[#405048]">{label}</p><p className="mt-1 text-xs text-[#8a9690]">{note}</p></article>
        ))}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.45fr_0.8fr]">
        <article className="rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:p-6">
          <div className="flex items-center justify-between"><div><h2 className="font-bold text-[#1d2d25]">Shipment movement</h2><p className="mt-1 text-xs text-[#84918a]">Last 7 days</p></div><span className="rounded-lg bg-[#edf5f1] px-3 py-1.5 text-xs font-semibold text-[#37604e]">No data yet</span></div>
          <div className="mt-8 flex h-56 items-end gap-3 border-b border-l border-[#e3eae6] px-4 sm:gap-6">{[14, 25, 18, 34, 30, 44, 38].map((height, index) => <div key={index} className="flex h-full flex-1 items-end justify-center"><div className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-[#d7e8df] to-[#eef5f1]" style={{ height: `${height}%` }} /></div>)}</div>
          <div className="mt-3 grid grid-cols-7 text-center text-[10px] font-medium text-[#8a9690]"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
        </article>

        <article className="rounded-2xl border border-[#e0e8e4] bg-[#10291f] p-6 text-white shadow-[0_8px_30px_rgba(24,51,39,0.08)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#60c892]">System rollout</p><h2 className="mt-3 text-xl font-bold">V1 operations foundation</h2><p className="mt-2 text-sm leading-6 text-white/55">Core booking is live; warehouse and delivery flows are next.</p>
          <div className="mt-6 space-y-4">{[["Secure authentication", "Ready"], ["Role permissions", "Ready"], ["AWB & order booking", "Ready"], ["Warehouse receiving", "Next"]].map(([label, status], index) => <div key={label} className="flex items-center gap-3"><span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${index < 3 ? "bg-[#2ca66e]" : "bg-white/10 text-white/50"}`}>{index + 1}</span><span className="flex-1 text-sm text-white/75">{label}</span><span className="text-[10px] uppercase tracking-wider text-white/35">{status}</span></div>)}</div>
        </article>
      </section>

      <section className="mt-6 rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        <div className="flex items-center justify-between border-b border-[#e6ece9] px-5 py-4 sm:px-6"><div><h2 className="font-bold text-[#1d2d25]">Recent shipments</h2><p className="mt-1 text-xs text-[#84918a]">Latest operational events</p></div><Link href="/shipments" className="text-xs font-bold text-[#188459]">View all</Link></div>
        {recent.length === 0 ? <div className="grid min-h-48 place-items-center px-6 py-10 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf5f1] text-[#188459]"><PackageCheck className="size-6" /></div><p className="mt-4 font-semibold text-[#33433b]">No shipments yet</p><p className="mt-1 max-w-sm text-sm text-[#829089]">Create the first shipment to populate this live feed.</p><Link href="/shipments/new" className="mt-4 inline-flex rounded-lg bg-[#13734b] px-4 py-2 text-xs font-bold text-white">New shipment</Link></div></div> : <div className="divide-y divide-[#edf1ef]">{recent.map((shipment) => <Link key={shipment.id} href={`/shipments/${shipment.id}`} className="grid gap-2 px-5 py-4 transition hover:bg-[#fbfcfb] sm:grid-cols-[1fr_1fr_150px_120px] sm:items-center sm:px-6"><div><p className="text-sm font-bold text-[#24362d]">{shipment.tracking_number}</p><p className="mt-1 text-xs text-[#87938d]">{formatDubaiDate(shipment.booked_at)}</p></div><div><p className="text-sm font-semibold text-[#405048]">{shipment.consignee_name}</p><p className="mt-1 text-xs text-[#87938d]">{shipment.consignee_city}</p></div><p className="text-sm font-bold text-[#405048]">{formatAed(shipment.cod_amount)}</p><StatusBadge status={shipment.status} /></Link>)}</div>}
      </section>
    </div>
  );
}
