"use client";

import { useState } from "react";
import type { ReportRangeKey } from "@/lib/report-date-range";

export function ReportDateFields({ range: initialRange, from: initialFrom, to: initialTo }: {
  range: ReportRangeKey;
  from: string;
  to: string;
}) {
  const [range, setRange] = useState<ReportRangeKey>(initialRange);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  return <>
    <label className="text-xs font-semibold text-[#516159]">Report period
      <select name="range" value={range} onChange={(event) => {
        const next = event.target.value as ReportRangeKey;
        setRange(next);
        if (next !== "custom") { setFrom(""); setTo(""); }
      }} className="bp-input mt-1 w-full text-xs font-semibold">
        <option value="today">Today</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="month">This Month</option>
        <option value="previous_month">Last Month</option>
        <option value="custom">Custom dates</option>
      </select>
    </label>
    <label className="text-xs font-semibold text-[#516159]">From date
      <input name="from" type="date" value={from} required={range === "custom"}
        onChange={(event) => { setFrom(event.target.value); setRange("custom"); }}
        className="bp-input mt-1 w-full text-xs" />
    </label>
    <label className="text-xs font-semibold text-[#516159]">To date
      <input name="to" type="date" value={to} min={from || undefined} required={range === "custom"}
        onChange={(event) => { setTo(event.target.value); setRange("custom"); }}
        className="bp-input mt-1 w-full text-xs" />
    </label>
  </>;
}
