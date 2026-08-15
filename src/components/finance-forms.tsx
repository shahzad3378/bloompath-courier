"use client";

import { useActionState } from "react";
import { Banknote, LoaderCircle } from "lucide-react";
import {
  receiveDriverCodAction,
  type FinanceActionState,
} from "@/app/(portal)/finance/actions";

const initialState: FinanceActionState = {
  status: "idle",
  message: "",
};

export function ReceiveDriverCodForm({
  entryId,
  outstanding,
}: {
  entryId: number;
  outstanding: number;
}) {
  const [state, action, pending] = useActionState(
    receiveDriverCodAction,
    initialState,
  );

  return (
    <form action={action} className="rounded-xl border border-[#dfe8e3] bg-[#fbfcfb] p-4">
      <input type="hidden" name="entry_id" value={entryId} />

      <div className="flex items-center gap-2">
        <Banknote className="size-4 text-[#13734b]" />
        <p className="text-xs font-bold text-[#526159]">
          Receive COD
        </p>
      </div>

      <label className="mt-3 block text-xs font-bold text-[#526159]">
        Amount
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          max={outstanding}
          defaultValue={outstanding.toFixed(2)}
          required
          className="mt-2 h-10 w-full rounded-lg border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
        />
      </label>

      <label className="mt-3 block text-xs font-bold text-[#526159]">
        Notes
        <input
          name="notes"
          maxLength={500}
          placeholder="Optional"
          className="mt-2 h-10 w-full rounded-lg border border-[#dbe5e0] bg-white px-3 text-sm font-normal"
        />
      </label>

      {state.message ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
            state.status === "success"
              ? "bg-[#e8f6ee] text-[#176a47]"
              : "bg-[#fff0f0] text-[#a13f3f]"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <button
        disabled={pending}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#13734b] px-4 text-xs font-bold text-white disabled:opacity-60"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Banknote className="size-4" />
        )}
        {pending ? "Saving..." : "Receive COD"}
      </button>
    </form>
  );
}
