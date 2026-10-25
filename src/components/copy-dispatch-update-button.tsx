"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyDispatchUpdateButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copyUpdate() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2200);
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copyUpdate()}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#cdded5] bg-white px-3 text-xs font-bold text-[#13734b] transition hover:bg-[#f3faf6]"
      aria-live="polite"
    >
      {state === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
      {state === "copied" ? "Update copied" : state === "error" ? "Copy failed" : "Copy shipper update"}
    </button>
  );
}
