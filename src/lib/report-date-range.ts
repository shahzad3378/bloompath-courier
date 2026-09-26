export type ReportRangeKey = "today" | "7d" | "30d" | "month" | "previous_month" | "custom";

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

function dubaiMonthStart(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1) - 4 * 60 * 60 * 1000);
}

function parseDubaiDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return new Date(utc.getTime() - 4 * 60 * 60 * 1000);
}

export function resolveReportDateRange(input: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}, now = new Date()) {
  const allowed: ReportRangeKey[] = ["today", "7d", "30d", "month", "previous_month", "custom"];
  const requested = allowed.includes(input.range as ReportRangeKey) ? input.range as ReportRangeKey : "7d";
  const range: ReportRangeKey = input.from || input.to ? "custom" : requested;
  const dubaiNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const today = dubaiMonthStart(dubaiNow.getUTCFullYear(), dubaiNow.getUTCMonth());
  const todayStart = addDays(today, dubaiNow.getUTCDate() - 1);
  let start = addDays(todayStart, -6);
  let endExclusive = addDays(todayStart, 1);

  if (range === "today") start = todayStart;
  if (range === "30d") start = addDays(todayStart, -29);
  if (range === "month") start = today;
  if (range === "previous_month") {
    start = dubaiMonthStart(dubaiNow.getUTCFullYear(), dubaiNow.getUTCMonth() - 1);
    endExclusive = today;
  }
  if (range === "custom") {
    const from = parseDubaiDate(input.from);
    const to = parseDubaiDate(input.to);
    if (!from || !to || from > to) {
      return { range, start, endExclusive, error: "Select valid From and To dates, with From on or before To." };
    }
    start = from;
    endExclusive = addDays(to, 1);
  }

  return { range, start, endExclusive, error: null };
}
