"use client";

import {
  type ChangeEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";

export function SelectableTable({
  children,
  visibleCount,
}: {
  children: ReactNode;
  visibleCount: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);

  function checkboxes() {
    return Array.from(
      rootRef.current?.querySelectorAll<HTMLInputElement>(
        "input[data-table-row-select]",
      ) || [],
    );
  }

  function updateCount() {
    setSelectedCount(
      checkboxes().filter((checkbox) => checkbox.checked).length,
    );
  }

  function toggleAll(event: ChangeEvent<HTMLInputElement>) {
    checkboxes().forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
    updateCount();
  }

  return (
    <div
      ref={rootRef}
      onChange={(event) => {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.matches("[data-table-row-select]")
        ) {
          updateCount();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-4 border-b border-[#e8eeeb] bg-white px-4 py-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-black text-[#405048]">
          <input
            type="checkbox"
            checked={visibleCount > 0 && selectedCount === visibleCount}
            onChange={toggleAll}
            disabled={visibleCount === 0}
            className="size-4 accent-[#13734b]"
          />
          Select all visible ({visibleCount.toLocaleString()})
        </label>

        <span className="text-xs font-semibold text-[#87938d]">
          {selectedCount.toLocaleString()} selected
        </span>

        <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
          Scroll table vertically and horizontally
        </span>
      </div>

      <div className="max-h-[620px] overflow-auto">
        {children}
      </div>
    </div>
  );
}
