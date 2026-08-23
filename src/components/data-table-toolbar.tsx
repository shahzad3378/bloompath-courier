import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  tablePageSizes,
  type TableSearchParams,
} from "@/lib/table-pagination";

function pageHref(
  pathname: string,
  params: TableSearchParams,
  page: number,
) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== "page") search.set(key, value);
  });

  search.set("page", String(page));
  return `${pathname}?${search.toString()}`;
}

export function DataTableToolbar({
  pathname,
  params,
  page,
  pageSize,
  total,
  dateLabel = "Record date",
  showDates = true,
}: {
  pathname: string;
  params: TableSearchParams;
  page: number;
  pageSize: number;
  total: number;
  dateLabel?: string;
  showDates?: boolean;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrevious = page > 1;
  const hasNext = end < total;

  return (
    <div className="border-b border-[#e8eeeb] bg-[#fbfcfb] px-4 py-4">
      <form
        action={pathname}
        className="flex flex-wrap items-end gap-3"
      >
        {Object.entries(params).map(([key, value]) =>
          value &&
          !["page", "page_size"].includes(key) &&
          (!showDates || !["from", "to"].includes(key)) ? (
            <input
              key={key}
              type="hidden"
              name={key}
              value={value}
            />
          ) : null,
        )}

        {showDates ? (
          <>
            <label className="text-[10px] font-black uppercase tracking-wide text-[#68766f]">
              {dateLabel} from
              <input
                type="date"
                name="from"
                defaultValue={params.from || ""}
                className="mt-1 block h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs font-semibold"
              />
            </label>

            <label className="text-[10px] font-black uppercase tracking-wide text-[#68766f]">
              {dateLabel} to
              <input
                type="date"
                name="to"
                defaultValue={params.to || ""}
                className="mt-1 block h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs font-semibold"
              />
            </label>
          </>
        ) : null}

        <label className="text-[10px] font-black uppercase tracking-wide text-[#68766f]">
          Rows per page
          <select
            name="page_size"
            defaultValue={String(pageSize)}
            className="mt-1 block h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs font-semibold"
          >
            {tablePageSizes.map((size) => (
              <option key={size} value={size}>
                {size.toLocaleString()}
              </option>
            ))}
          </select>
        </label>

        <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#13734b] px-4 text-xs font-black text-white">
          <Filter className="size-3.5" />
          Apply
        </button>

        <Link
          href={pathname}
          className="inline-flex h-10 items-center rounded-lg border border-[#dbe5e0] bg-white px-4 text-xs font-bold text-[#526159]"
        >
          Reset
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-bold text-[#68766f]">
            {start.toLocaleString()}–{end.toLocaleString()} of{" "}
            {Math.min(total, 5000).toLocaleString()}
            {total > 5000 ? "+" : ""}
          </span>

          {hasPrevious ? (
            <Link
              href={pageHref(pathname, params, page - 1)}
              aria-label="Previous page"
              className="grid size-9 place-items-center rounded-lg border border-[#dbe5e0] bg-white text-[#13734b]"
            >
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className="grid size-9 place-items-center rounded-lg border border-[#e8eeeb] text-[#b5bfba]">
              <ChevronLeft className="size-4" />
            </span>
          )}

          {hasNext && end < 5000 ? (
            <Link
              href={pageHref(pathname, params, page + 1)}
              aria-label="Next page"
              className="grid size-9 place-items-center rounded-lg border border-[#dbe5e0] bg-white text-[#13734b]"
            >
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className="grid size-9 place-items-center rounded-lg border border-[#e8eeeb] text-[#b5bfba]">
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
