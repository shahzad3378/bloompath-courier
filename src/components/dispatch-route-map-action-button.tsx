"use client";

import { LoaderCircle, MapPinned } from "lucide-react";
import { useFormStatus } from "react-dom";

export function DispatchRouteMapActionButton() {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-10 min-w-[190px] items-center justify-center gap-2 rounded-xl border border-[#bcd9ca] bg-[#edf7f2] px-4 text-sm font-bold text-[#13734b] transition hover:bg-[#e2f2e9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2b9466]/15 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <MapPinned className="size-4" />
      )}
      {pending ? "Mapping stops…" : "Map & optimize stops"}
    </button>
  );
}
