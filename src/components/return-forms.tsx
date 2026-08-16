"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  LoaderCircle,
  RotateCcw,
  ScanLine,
  Send,
  Truck,
} from "lucide-react";
import {
  addReturnAwbAction,
  completeSellerReturnAction,
  createReturnRunAction,
  type ReturnActionState,
} from "@/app/(portal)/returns/actions";

const initial: ReturnActionState = {
  status: "idle",
  message: "",
};

function Message({ state }: { state: ReturnActionState }) {
  return state.message ? (
    <p
      className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
        state.status === "success"
          ? "bg-[#e8f6ee] text-[#176a47]"
          : "bg-[#fff0f0] text-[#a13f3f]"
      }`}
    >
      {state.message}
    </p>
  ) : null;
}

export function CreateReturnRunForm({
  drivers,
  shippers,
}: {
  drivers: Array<{
    id: string;
    full_name: string;
    employee_code: string | null;
  }>;
  shippers: Array<{
    id: string;
    full_name: string;
    email: string | null;
  }>;
}) {
  const [state, action, pending] = useActionState(
    createReturnRunAction,
    initial,
  );

  return (
    <form
      action={action}
      className="rounded-2xl border border-[#dfe8e3] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#fff0e5] text-[#b76223]">
          <RotateCcw className="size-5" />
        </span>

        <div>
          <h2 className="font-bold text-[#26372f]">
            New Return Handover
          </h2>

          <p className="mt-0.5 text-xs text-[#7c8982]">
            Select the shipper and driver, then scan only that seller&apos;s return AWBs.
          </p>
        </div>
      </div>

      <label className="mt-4 block text-xs font-bold text-[#526159]">
        Shipper / Seller
        <select
          name="shipper_id"
          required
          defaultValue=""
          className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal outline-none focus:border-[#2b9466]"
        >
          <option value="" disabled>
            Select shipper
          </option>

          {shippers.map((shipper) => (
            <option key={shipper.id} value={shipper.id}>
              {shipper.full_name}
              {shipper.email ? ` · ${shipper.email}` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block text-xs font-bold text-[#526159]">
        Driver
        <select
          name="driver_id"
          required
          defaultValue=""
          className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal outline-none focus:border-[#2b9466]"
        >
          <option value="" disabled>
            Select active driver
          </option>

          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.full_name}
              {driver.employee_code
                ? ` · ${driver.employee_code}`
                : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 rounded-xl border border-[#eadac9] bg-[#fffaf5] p-3">
        <p className="text-xs font-semibold leading-5 text-[#7b674f]">
          Only warehouse-ready Return to Seller AWBs belonging to the selected shipper can be scanned into this handover.
        </p>
      </div>

      <Message state={state} />

      <button
        disabled={
          pending ||
          drivers.length === 0 ||
          shippers.length === 0
        }
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Truck className="size-4" />
        )}

        Create Return Handover
      </button>
    </form>
  );
}

export function ReturnAwbScanForm({
  runId,
}: {
  runId: number;
}) {
  const [state, action, pending] = useActionState(
    addReturnAwbAction,
    initial,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
    inputRef.current?.focus();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-2xl border border-[#eadac9] bg-[#fffaf5] p-5"
    >
      <input type="hidden" name="run_id" value={runId} />

      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#fff0e5] text-[#b76223]">
          <ScanLine className="size-5" />
        </span>
        <div>
          <h2 className="font-bold text-[#26372f]">
            Scan Return AWBs
          </h2>
          <p className="mt-0.5 text-xs text-[#74827b]">
            Only warehouse-ready AWBs for this selected shipper will be accepted.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          ref={inputRef}
          autoFocus
          autoComplete="off"
          name="tracking_number"
          required
          placeholder="Scan AWB number"
          className="h-12 min-w-0 flex-1 rounded-xl border border-[#dfd0c1] bg-white px-4 font-mono text-sm font-bold uppercase outline-none focus:border-[#b76223]"
        />

        <button
          disabled={pending}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#b76223] px-5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ScanLine className="size-4" />
          )}
          Add
        </button>
      </div>

      <Message state={state} />
    </form>
  );
}

export function SellerReturnPodForm({
  itemId,
}: {
  itemId: number;
}) {
  const [state, action, pending] = useActionState(
    completeSellerReturnAction,
    initial,
  );

  return (
    <form
      action={action}
      className="rounded-2xl border border-[#dfe8e3] bg-white p-5"
    >
      <input
        type="hidden"
        name="return_item_id"
        value={itemId}
      />

      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
          <Send className="size-5" />
        </span>
        <div>
          <h2 className="font-bold text-[#26372f]">
            Complete seller return
          </h2>
          <p className="mt-0.5 text-xs text-[#7a8881]">
            Seller POD photo is mandatory.
          </p>
        </div>
      </div>

      <label className="mt-4 block text-xs font-bold text-[#526159]">
        Seller POD
        <input
          name="proof"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="mt-2 block w-full rounded-xl border border-[#dbe5e0] bg-[#f8faf9] p-2 text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-[#13734b] file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
        />
      </label>

      <label className="mt-3 block text-xs font-bold text-[#526159]">
        Notes
        <textarea
          name="notes"
          maxLength={500}
          rows={3}
          className="mt-2 w-full rounded-xl border border-[#dbe5e0] px-3 py-2.5 text-sm font-normal"
          placeholder="Optional seller handover notes"
        />
      </label>

      <Message state={state} />

      <button
        disabled={pending}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        {pending
          ? "Uploading & saving…"
          : "Confirm returned to seller"}
      </button>
    </form>
  );
}
