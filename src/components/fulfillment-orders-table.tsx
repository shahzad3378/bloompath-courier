"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { FulfillmentAwbForm, type FulfillmentAwbCountry } from "@/components/fulfillment-awb-form";
import { updateFulfillmentOrderAction } from "@/app/(portal)/fulfillment/actions";

export type FulfillmentOrderRow = {
  orderId: string;
  orderNumber: string;
  reference: string | null;
  shipperId: string | null;
  shipper: string;
  recipient: string;
  phone: string;
  address: string;
  items: { name: string; sku: string; quantity: number }[];
  fee: string | null;
  feeGroup: string | null;
  paymentType: "cod" | "prepaid";
  codAmount: number;
  status: string;
  createdAt: string;
  awb: { id: number; trackingNumber: string; status: string; customerStatus: string | null; createdAt: string } | null;
};

function dubaiDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function FulfillmentOrdersTable({ orders, countries }: { orders: FulfillmentOrderRow[]; countries: FulfillmentAwbCountry[] }) {
  const [period, setPeriod] = useState("all");
  const [createdOn, setCreatedOn] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const today = dubaiDate(new Date().toISOString());
  const now = Date.now();
  const queuedCount = orders.filter(order => order.status === "queued").length;
  const workingCount = orders.filter(order => order.status === "picking" || order.status === "packed").length;
  const dispatchedCount = orders.filter(order => order.status === "dispatched").length;
  const bookedAwbCount = orders.filter(order => order.awb && order.awb.status !== "delivered" && order.awb.customerStatus !== "delivered").length;
  const deliveredCount = orders.filter(order => order.awb && (order.awb.status === "delivered" || order.awb.customerStatus === "delivered")).length;
  const visible = useMemo(() => orders.filter(order => {
    if (createdOn && dubaiDate(order.createdAt) !== createdOn) return false;
    if (period === "today" && dubaiDate(order.createdAt) !== today) return false;
    if (period === "recent" && (!order.awb || now - new Date(order.awb.createdAt).getTime() > 7 * 86400000)) return false;
    if (statusFilter !== "all" && statusFilter !== "awb_booked" && statusFilter !== "delivered" && order.status !== statusFilter) return false;
    if (statusFilter === "awb_booked" && !order.awb) return false;
    if (statusFilter === "delivered" && !(order.awb && (order.awb.status === "delivered" || order.awb.customerStatus === "delivered"))) return false;
    return true;
  }), [orders, createdOn, period, statusFilter, today, now]);
  const visibleAwbs = visible.filter(order => order.awb).map(order => order.awb!);
  const allVisibleSelected = visibleAwbs.length > 0 && visibleAwbs.every(awb => selected.has(awb.id));
  const selectedCount = orders.reduce((count, order) => count + (order.awb && selected.has(order.awb.id) ? 1 : 0), 0);
  function toggleVisible() {
    setSelected(current => {
      const next = new Set(current);
      if (allVisibleSelected) visibleAwbs.forEach(awb => next.delete(awb.id));
      else visibleAwbs.forEach(awb => next.add(awb.id));
      return next;
    });
  }
  function toggleAwb(id: number) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function printSelected(format: "4x6" | "a4") {
    const ids = orders.filter(order => order.awb && selected.has(order.awb.id)).map(order => order.awb!.id).slice(0, 500);
    if (!ids.length) return;
    const query = new URLSearchParams({ ids: ids.join(","), format });
    window.open("/print/shipments/bulk?" + query.toString(), "_blank", "noopener,noreferrer");
  }
  function clearSelection() { setSelected(new Set()); }

  return <div className="space-y-4">
    <section aria-label="Fulfillment overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[["Queued", queuedCount], ["Picking / packed", workingCount], ["Fulfillment dispatched", dispatchedCount], ["AWBs in delivery", bookedAwbCount], ["Delivered", deliveredCount]].map(([label, value]) =>
        <article key={label} className="bp-panel p-4"><p className="text-xs font-semibold text-[#78858f]">{label}</p><p className="mt-1 text-2xl font-black text-[#17231e]">{value}</p></article>
      )}
    </section>
    <section className="bp-panel overflow-hidden">
      <div className="border-b border-[#e8edf3] bg-[#fbfcfe] px-4 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-bold text-[#526159]">Orders
            <select value={period} onChange={event => setPeriod(event.target.value)} className="bp-input mt-1 h-9 min-w-40 text-xs">
              <option value="all">All orders</option><option value="today">Created today</option><option value="recent">Recently booked AWBs · 7 days</option>
            </select>
          </label>
          <label className="text-[11px] font-bold text-[#526159]">Created on
            <input type="date" value={createdOn} onChange={event => setCreatedOn(event.target.value)} className="bp-input mt-1 h-9 text-xs"/>
          </label>
          <label className="text-[11px] font-bold text-[#526159]">Status
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="bp-input mt-1 h-9 min-w-36 text-xs">
              <option value="all">All statuses</option><option value="queued">Queued</option><option value="picking">Picking</option><option value="packed">Packed</option><option value="dispatched">Fulfillment dispatched</option><option value="awb_booked">AWB created</option><option value="delivered">Delivered</option>
            </select>
          </label>
          <button type="button" onClick={toggleVisible} disabled={!visibleAwbs.length} className="h-9 rounded-lg border border-[#cfd9e5] bg-white px-3 text-xs font-bold disabled:opacity-40">{allVisibleSelected ? "Unselect visible AWBs" : "Select visible AWBs"}</button>
          <button type="button" onClick={clearSelection} disabled={!selectedCount} className="h-9 rounded-lg border border-[#cfd9e5] bg-white px-3 text-xs font-bold disabled:opacity-40">Clear selection</button>
          <button type="button" onClick={() => printSelected("4x6")} disabled={!selectedCount} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#174ea6] px-3 text-xs font-bold text-white disabled:opacity-40"><Printer className="size-3.5"/>Print selected 4×6</button>
          <button type="button" onClick={() => printSelected("a4")} disabled={!selectedCount} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cfd9e5] bg-white px-3 text-xs font-bold text-[#334155] disabled:opacity-40"><Printer className="size-3.5"/>Print selected A4</button>
          <span className="ml-auto text-xs font-semibold text-[#65736c]">{selectedCount} AWB{selectedCount === 1 ? "" : "s"} selected · {visible.length} order{visible.length === 1 ? "" : "s"} shown</span>
        </div>
        <p className="mt-2 text-[11px] text-[#78858f]">Filter by creation date, select the AWBs and print them together. Tracking updates are available from Operations after the AWB is created.</p>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1500px] text-left text-sm">
        <thead className="bg-[#f8fafc] text-[10px] uppercase tracking-wide text-[#78858f]"><tr><th className="w-10 px-3 py-3"><input aria-label="Select all visible AWBs" type="checkbox" checked={allVisibleSelected} disabled={!visibleAwbs.length} onChange={toggleVisible} className="size-4 accent-[#174ea6]"/></th>{["Order / Reference","Shipper","Recipient","Delivery","Products","Payment / COD","Fulfillment fee","Fulfillment status","AWB / Tracking","Next step"].map(label=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-[#edf1ef]">
          {visible.map(order => {
            const awb = order.awb;
            const next = order.status === "queued" ? "picking" : order.status === "picking" ? "packed" : order.status === "packed" ? "dispatched" : null;
            const trackingLabel = awb?.customerStatus || awb?.status || "";
            const delivered = trackingLabel === "delivered";
            const badgeClass = delivered ? "bg-[#e8f6ee] text-[#176a47]" : "bg-[#edf4ff] text-[#174ea6]";
            return <tr key={order.orderNumber}>
              <td className="px-3 py-4">{awb ? <input aria-label={"Select AWB " + awb.trackingNumber} type="checkbox" checked={selected.has(awb.id)} onChange={() => toggleAwb(awb.id)} className="size-4 accent-[#174ea6]"/> : null}</td>
              <td className="px-4 py-4 font-mono text-xs font-bold">{order.orderNumber}<div className="mt-1 text-[10px] text-[#78858f]">{order.reference || "No reference"} · {new Date(order.createdAt).toLocaleDateString("en-CA")}</div></td>
              <td className="px-4 py-4">{order.shipper}</td>
              <td className="px-4 py-4 font-semibold">{order.recipient}<div className="text-xs text-[#78858f]">{order.phone}</div></td>
              <td className="max-w-64 px-4 py-4 text-xs">{order.address}</td>
              <td className="px-4 py-4 text-xs">{order.items.map((item,index)=><div key={item.sku + "-" + index}>{item.name} · {item.quantity}</div>)}</td>
              <td className="px-4 py-4 text-xs font-bold"><span className="uppercase">{order.paymentType}</span>{order.paymentType === "cod" ? <div>{order.codAmount.toFixed(2)}</div> : null}</td>
              <td className="px-4 py-4 text-xs font-bold">{order.fee || "—"}{order.feeGroup ? <div className="font-normal text-[#78858f]">{order.feeGroup}</div> : null}</td>
              <td className="px-4 py-4"><span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-xs font-bold capitalize text-[#174ea6]">{order.status}</span></td>
              <td className="px-4 py-4">{awb ? <div><Link className="font-mono text-xs font-bold text-[#174ea6] underline" href={"/shipments/" + awb.id}>{awb.trackingNumber}</Link><div className={"mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold capitalize " + badgeClass}>{trackingLabel.replaceAll("_"," ")}</div><Link className="mt-2 block text-[11px] font-bold text-[#174ea6] underline" href={"/warehouse/manual-tracking?awb=" + encodeURIComponent(awb.trackingNumber)}>Update tracking</Link></div> : <span className="text-xs text-[#78858f]">AWB not created</span>}</td>
              <td className="px-4 py-4">{next ? <form action={updateFulfillmentOrderAction}><input type="hidden" name="order_id" value={order.orderId}/><input type="hidden" name="next_status" value={next}/><button className="rounded-lg bg-[#174ea6] px-3 py-2 text-xs font-bold capitalize text-white">Mark {next}</button></form> : order.status === "dispatched" && !awb ? <FulfillmentAwbForm orderNumber={order.orderNumber} address={order.address} countries={countries} paymentType={order.paymentType} codAmount={order.codAmount}/> : <span className="text-xs text-[#78858f]">Complete</span>}</td>
            </tr>;
          })}
          {!visible.length ? <tr><td colSpan={11} className="px-5 py-12 text-center text-sm text-[#78858f]">No fulfillment orders match these filters.</td></tr> : null}
        </tbody>
      </table></div>
    </section>
  </div>;
}
