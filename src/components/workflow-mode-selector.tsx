"use client";

import { useRef } from "react";

type WorkflowModeOption = { value: string; label: string };

export function WorkflowModeSelector({
  action,
  name,
  selected,
  options,
  hiddenFields = {},
  label = "Choose workflow",
}: {
  action: string;
  name: string;
  selected: string;
  options: WorkflowModeOption[];
  hiddenFields?: Record<string, string>;
  label?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-[#dfe7e3] bg-white p-4">
      {Object.entries(hiddenFields).map(([field, value]) => (
        <input key={field} type="hidden" name={field} value={value} />
      ))}
      <label className="min-w-60 flex-1 text-xs font-bold text-[#526159]">
        {label}
        <select
          name={name}
          defaultValue={selected}
          onChange={() => formRef.current?.requestSubmit()}
          className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-semibold text-[#34453c] outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10"
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </form>
  );
}
