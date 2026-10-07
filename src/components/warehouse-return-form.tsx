"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, RotateCcw, ScanLine } from "lucide-react";
import {
  receiveUndeliveredReturnAction,
  type WarehouseReturnActionState,
} from "@/app/(portal)/warehouse/actions";

const initialState: WarehouseReturnActionState = { status: "idle", message: "" };

export function WarehouseReturnForm({ autoFocus = true }: { autoFocus?: boolean }) {
  const [state, action, pending] = useActionState(receiveUndeliveredReturnAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
    if (autoFocus || state.status !== "idle") inputRef.current?.focus();
  }, [state, autoFocus]);

  return (
    <form ref={formRef} action={action} noValidate className="rounded-2xl border border-[#e4d5b8] bg-[#fffaf1] p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-[#f8ead0] text-[#a56b19]"><RotateCcw className="size-5" /></span>
        <div><h2 className="font-bold text-[#26372f]">Driver return scan</h2><p className="mt-0.5 text-xs text-[#7b7468]">Physical undelivered AWB receive karke scan karein.</p></div>
      </div>
      <div className="mt-4 flex gap-2">
        <input ref={inputRef} autoFocus={autoFocus} autoComplete="off" name="tracking_number" required placeholder="Scan undelivered AWB" className="h-12 min-w-0 flex-1 rounded-xl border border-[#e2d5be] bg-white px-4 font-mono text-sm font-bold uppercase outline-none focus:border-[#b97a21] focus:ring-4 focus:ring-[#b97a21]/10" />
        <button disabled={pending} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#a56b19] px-5 text-sm font-bold text-white disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <ScanLine className="size-4" />}Receive</button>
      </div>
      {state.message ? <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${state.status === "success" ? "bg-[#e8f6ee] text-[#176a47]" : "bg-[#fff0f0] text-[#a13f3f]"}`}>{state.message}</p> : null}
    </form>
  );
}
