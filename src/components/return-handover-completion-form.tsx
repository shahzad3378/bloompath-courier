"use client";

import { useActionState } from "react";
import {
  CheckCircle2,
  FileCheck2,
  Upload,
} from "lucide-react";
import {
  completeReturnHandoverAction,
  type ReturnActionState,
} from "@/app/(portal)/returns/actions";

const initialState: ReturnActionState = {
  status: "idle",
  message: "",
};

export function ReturnHandoverCompletionForm({
  runId,
  awbCount,
}: {
  runId: number;
  awbCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    completeReturnHandoverAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-[#d9e5df] bg-white p-5"
    >
      <input type="hidden" name="run_id" value={runId} />

      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
          <FileCheck2 className="size-5" />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#7d8d85]">
            Seller confirmation
          </p>

          <h2 className="mt-1 font-black text-[#26372f]">
            Complete Return Handover
          </h2>

          <p className="mt-2 text-xs leading-5 text-[#74827b]">
            Upload the signed or stamped manifest. This will
            complete all {awbCount} AWB
            {awbCount === 1 ? "" : "s"} in this handover.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label
            htmlFor="received_by_name"
            className="mb-1.5 block text-xs font-bold text-[#4d5d55]"
          >
            Received by
          </label>

          <input
            id="received_by_name"
            name="received_by_name"
            type="text"
            maxLength={150}
            placeholder="Seller representative name"
            className="bp-input w-full"
          />
        </div>

        <div>
          <label
            htmlFor="signed_manifest"
            className="mb-1.5 block text-xs font-bold text-[#4d5d55]"
          >
            Signed manifest
          </label>

          <label
            htmlFor="signed_manifest"
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#b9cec3] bg-[#f8fbf9] p-4"
          >
            <Upload className="size-5 shrink-0 text-[#13734b]" />

            <div>
              <p className="text-xs font-bold text-[#405048]">
                Upload signed manifest
              </p>

              <p className="mt-1 text-[10px] text-[#87938d]">
                PDF, JPG, PNG or WebP · maximum 10 MB
              </p>
            </div>
          </label>

          <input
            id="signed_manifest"
            name="signed_manifest"
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            required
            className="sr-only"
          />
        </div>

        <div>
          <label
            htmlFor="manifest_notes"
            className="mb-1.5 block text-xs font-bold text-[#4d5d55]"
          >
            Notes
          </label>

          <textarea
            id="manifest_notes"
            name="manifest_notes"
            maxLength={500}
            rows={3}
            placeholder="Optional handover notes"
            className="bp-input min-h-24 w-full resize-y py-3"
          />
        </div>

        {state.status !== "idle" ? (
          <div
            className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${
              state.status === "success"
                ? "bg-[#ebf8f1] text-[#176a47]"
                : "bg-[#fff1f1] text-[#a13f3f]"
            }`}
          >
            {state.message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending || awbCount === 0}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-black text-white disabled:opacity-50"
        >
          <CheckCircle2 className="size-4" />
          {pending ? "Completing..." : "Complete Return Handover"}
        </button>
      </div>
    </form>
  );
}
