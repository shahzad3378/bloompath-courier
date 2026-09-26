"use client";

import { useState } from "react";

export function ShipmentDateFields({ initialFrom, initialTo, requireBoth = false }: { initialFrom: string; initialTo: string; requireBoth?: boolean }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const initialMonth = /^\d{4}-\d{2}-01$/.test(initialFrom) &&
    initialTo === new Date(Date.UTC(Number(initialFrom.slice(0, 4)), Number(initialFrom.slice(5, 7)), 0)).toISOString().slice(0, 10)
    ? initialFrom.slice(0, 7) : "";
  const [month, setMonth] = useState(initialMonth);

  return <>
    <label className="text-xs font-semibold text-[#516159]">Choose any month
      <input type="month" value={month} onChange={(event) => {
        const selected = event.target.value;
        setMonth(selected);
        if (!selected) { setFrom(""); setTo(""); return; }
        const [year, monthNumber] = selected.split("-").map(Number);
        setFrom(`${selected}-01`);
        setTo(new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10));
      }} className="mt-1 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm text-[#405048]" />
    </label>
    <label className="text-xs font-semibold text-[#516159]">From date
      <input name="from" type="date" value={from} required={requireBoth} onChange={(event) => { setFrom(event.target.value); setMonth(""); }} className="mt-1 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm text-[#405048]" />
    </label>
    <label className="text-xs font-semibold text-[#516159]">To date
      <input name="to" type="date" value={to} min={from || undefined} required={requireBoth} onChange={(event) => { setTo(event.target.value); setMonth(""); }} className="mt-1 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm text-[#405048]" />
    </label>
  </>;
}
