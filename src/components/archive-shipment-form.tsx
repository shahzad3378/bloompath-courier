"use client";

import { useActionState } from "react";
import { Archive, LoaderCircle } from "lucide-react";
import {
  archiveShipmentAction,
  type ArchiveShipmentState,
} from "@/app/(portal)/shipments/actions";

const initialState: ArchiveShipmentState = { message: "" };

export function ArchiveShipmentForm({ shipmentId, trackingNumber }: { shipmentId: number; trackingNumber: string }) {
  const [state, action, pending] = useActionState(archiveShipmentAction, initialState);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Archive AWB ${trackingNumber}? It will leave the active shipment list but remain in audit history.`)) {
          event.preventDefault();
        }
      }}
      className="rounded-2xl border border-[#f0c7c7] bg-[#fff8f8] p-5"
    >
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fde7e7] text-[#b74646]"><Archive className="size-5" /></span>
        <div>
          <h2 className="font-bold text-[#722f2f]">Archive this AWB</h2>
          <p className="mt-1 text-xs leading-5 text-[#8d5d5d]">Only booked AWBs can be archived. The record and timeline are retained for audit.</p>
        </div>
      </div>
      <label className="mt-4 block text-xs font-bold text-[#6f4545]">
        Reason
        <textarea name="delete_reason" required minLength={3} maxLength={500} rows={3} className="mt-2 w-full resize-y rounded-xl border border-[#ebcccc] bg-white px-3 py-2.5 text-sm font-normal text-[#3d2c2c] outline-none focus:border-[#b74646] focus:ring-4 focus:ring-[#b74646]/10" placeholder="e.g. Duplicate order uploaded" />
      </label>
      {state.message ? <p className="mt-3 text-xs font-semibold text-[#b74646]">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#a93e3e] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />}
        {pending ? "Archiving…" : "Archive AWB"}
      </button>
    </form>
  );
}
