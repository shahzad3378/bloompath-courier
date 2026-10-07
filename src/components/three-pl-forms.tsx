"use client";

import { useActionState, useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, UploadCloud } from "lucide-react";
import {
  bulkUpdateThreePLStatusesAction,
  createCarrierAction,
  handoverToCarrierAction,
  updateThreePLStatusAction,
  type BulkThreePLState,
  type ThreePLState,
} from "@/app/(portal)/dispatch/3pl/actions";

const initialState: ThreePLState = {
  status: "idle",
  message: "",
};

const initialBulkState: BulkThreePLState = {
  status: "idle",
  message: "",
  errors: [],
  successCount: 0,
  failedCount: 0,
};

const statusOptions = [
  ["in_transit", "In transit"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
  ["undelivered", "Undelivered"],
  ["return_initiated", "Return initiated"],
  ["return_in_transit", "Return in transit"],
  ["returned_to_warehouse", "Returned to warehouse"],
  ["returned_to_shipper", "Returned to shipper"],
] as const;

const undeliveredReasons = [
  "customer_unavailable",
  "customer_refused",
  "customer_cancelled",
  "wrong_address",
  "phone_unreachable",
  "reschedule_requested",
  "cash_not_ready",
  "restricted_access",
  "out_of_coverage",
  "address_closed",
  "no_response",
  "other",
] as const;

const returnReasons = [
  "attempts_exhausted",
  "customer_cancelled",
  "customer_refused",
  "no_response",
  "wrong_address",
  "out_of_coverage",
  "damaged",
  "carrier_issue",
  "other",
] as const;

function label(code: string) {
  return code.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

function downloadStatusTemplate() {
  const headers = [
    "tracking_number",
    "status",
    "attempt_number",
    "undelivered_reason",
    "return_reason",
    "internal_notes",
  ];
  const url = URL.createObjectURL(new Blob([[headers.join(","), ""].join("\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "3pl-status-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function Message({ state }: { state: ThreePLState }) {
  if (!state.message) return null;

  return (
    <p
      className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
        state.status === "success"
          ? "bg-[#e8f6ee] text-[#176a47]"
          : "bg-[#fff0f0] text-[#a13f3f]"
      }`}
    >
      {state.message}
    </p>
  );
}

export function CreateCarrierForm() {
  const [state, action, pending] = useActionState(
    createCarrierAction,
    initialState,
  );

  return (
    <form noValidate action={action} className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
      <h2 className="font-bold text-[#26372f]">Add 3PL partner</h2>
      <p className="mt-1 text-xs text-[#87938d]">
        Internal carrier information. Shippers cannot see these details.
      </p>

      <div className="mt-5 space-y-3">
        <input
          name="name"
          required
          placeholder="Carrier name"
          className="h-11 w-full rounded-xl border border-[#dce5e0] px-3 text-sm outline-none focus:border-[#188459]"
        />

        <input
          name="code"
          required
          placeholder="Carrier code e.g. ARX"
          className="h-11 w-full rounded-xl border border-[#dce5e0] px-3 text-sm uppercase outline-none focus:border-[#188459]"
        />

        <input
          name="contact_name"
          placeholder="Contact person (optional)"
          className="h-11 w-full rounded-xl border border-[#dce5e0] px-3 text-sm outline-none focus:border-[#188459]"
        />

        <input
          name="contact_phone"
          placeholder="Phone (optional)"
          className="h-11 w-full rounded-xl border border-[#dce5e0] px-3 text-sm outline-none focus:border-[#188459]"
        />

        <input
          name="contact_email"
          type="email"
          placeholder="Email (optional)"
          className="h-11 w-full rounded-xl border border-[#dce5e0] px-3 text-sm outline-none focus:border-[#188459]"
        />
      </div>

      <button
        disabled={pending}
        className="mt-4 h-11 w-full rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add 3PL Partner"}
      </button>

      <Message state={state} />
    </form>
  );
}

export function ThreePLHandoverForm({
  carriers,
  awbBrandName,
}: {
  carriers: Array<{ id: string; name: string; code: string }>;
  awbBrandName: string;
}) {
  const [state, action, pending] = useActionState(
    handoverToCarrierAction,
    initialState,
  );

  return (
    <form noValidate action={action} className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
      <h2 className="font-bold text-[#26372f]">Transfer shipment to 3PL</h2>
      <p className="mt-1 text-xs text-[#87938d]">
        {awbBrandName} AWB remains the customer-facing reference.
      </p>

      <div className="mt-5 space-y-3">
        <input
          name="tracking_number"
          required
          placeholder={`Scan / enter ${awbBrandName} AWB`}
          aria-label={`${awbBrandName} AWB for transfer`}
          className="h-11 w-full rounded-xl border border-[#dce5e0] px-3 font-mono text-sm uppercase outline-none focus:border-[#188459]"
        />

        <select
          name="carrier_id"
          required
          className="h-11 w-full rounded-xl border border-[#dce5e0] bg-white px-3 text-sm outline-none focus:border-[#188459]"
        >
          <option value="">Select 3PL partner</option>
          {carriers.map((carrier) => (
            <option key={carrier.id} value={carrier.id}>
              {carrier.name} ({carrier.code})
            </option>
          ))}
        </select>

        <input
          name="partner_tracking_number"
          placeholder="3PL tracking number / AWB"
          className="h-11 w-full rounded-xl border border-[#dce5e0] px-3 font-mono text-sm uppercase outline-none focus:border-[#188459]"
        />
      </div>

      <p className="mt-3 text-[11px] leading-5 text-[#87938d]">
        Partner AWB is internal only and will not be displayed to the shipper.
      </p>

      <button
        disabled={pending || carriers.length === 0}
        className="mt-4 h-11 w-full rounded-xl bg-[#172f25] px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? "Transferring..." : "Transfer to Delivery Partner"}
      </button>

      <Message state={state} />
    </form>
  );
}

export function ThreePLStatusForm({ awbBrandName }: { awbBrandName: string }) {
  const [state, action, pending] = useActionState(updateThreePLStatusAction, initialState);
  const [status, setStatus] = useState("");
  const needsAttempt = status === "undelivered" || status === "delivered";
  const needsUndeliveredReason = status === "undelivered";
  const needsReturnReason = ["return_initiated", "return_in_transit", "returned_to_warehouse"].includes(status);
  const canAddReturnReason = needsReturnReason || status === "returned_to_shipper";

  return (
    <form noValidate action={action} className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
      <h2 className="font-bold text-[#26372f]">Update one 3PL shipment</h2>
      <p className="mt-1 text-xs text-[#87938d]">
        Saved partner status updates the {awbBrandName} shipment lifecycle.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <input
          name="tracking_number"
          required
          placeholder={`${awbBrandName} AWB`}
          aria-label={`${awbBrandName} AWB for status update`}
          className="h-11 rounded-xl border border-[#dce5e0] px-3 font-mono text-sm uppercase outline-none focus:border-[#188459] sm:col-span-2"
        />

        <select
          name="status"
          required
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-11 rounded-xl border border-[#dce5e0] bg-white px-3 text-sm outline-none focus:border-[#188459] sm:col-span-2"
        >
          <option value="">Select partner status</option>
          {statusOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>

        {needsAttempt ? (
          <select
            name="attempt_number"
            required={needsUndeliveredReason}
            defaultValue=""
            className="h-11 rounded-xl border border-[#dce5e0] bg-white px-3 text-sm outline-none focus:border-[#188459]"
          >
            <option value="">Attempt {needsUndeliveredReason ? "*" : "(optional)"}</option>
            <option value="1">Attempt 1</option>
            <option value="2">Attempt 2</option>
            <option value="3">Attempt 3</option>
          </select>
        ) : null}

        {needsUndeliveredReason ? (
          <select
            name="undelivered_reason"
            required
            defaultValue=""
            className="h-11 rounded-xl border border-[#dce5e0] bg-white px-3 text-sm outline-none focus:border-[#188459]"
          >
            <option value="">Undelivered reason *</option>
            {undeliveredReasons.map((reason) => <option key={reason} value={reason}>{label(reason)}</option>)}
          </select>
        ) : null}

        {canAddReturnReason ? (
          <select
            name="return_reason"
            required={needsReturnReason}
            defaultValue=""
            className="h-11 rounded-xl border border-[#dce5e0] bg-white px-3 text-sm outline-none focus:border-[#188459] sm:col-span-2"
          >
            <option value="">Return reason {needsReturnReason ? "*" : "(optional)"}</option>
            {returnReasons.map((reason) => <option key={reason} value={reason}>{label(reason)}</option>)}
          </select>
        ) : null}

        <textarea
          name="internal_notes"
          maxLength={1000}
          rows={3}
          placeholder="Internal notes (optional)"
          className="resize-none rounded-xl border border-[#dce5e0] px-3 py-3 text-sm outline-none focus:border-[#188459] sm:col-span-2"
        />
      </div>

      <button
        disabled={pending || !status}
        className="mt-4 h-11 w-full rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? "Updating..." : "Save 3PL Status"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function BulkThreePLStatusForm() {
  const [state, action, pending] = useActionState(bulkUpdateThreePLStatusesAction, initialBulkState);
  const [fileName, setFileName] = useState("");

  return (
    <form noValidate action={action} className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-[#26372f]">Bulk 3PL status update</h2>
          <p className="mt-1 text-xs text-[#87938d]">Upload up to 500 linked AWBs in CSV or Excel.</p>
        </div>
        <button
          type="button"
          onClick={downloadStatusTemplate}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#cddbd4] px-3 text-xs font-bold text-[#13734b]"
        >
          <Download className="size-3.5" /> Template
        </button>
      </div>

      <label className="mt-5 grid min-h-36 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-[#bed5c9] bg-[#f8fbf9] p-5 text-center hover:border-[#2b9466]">
        <input
          name="file"
          type="file"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
        />
        <span>
          <FileSpreadsheet className="mx-auto size-7 text-[#13734b]" />
          <span className="mt-2 block text-sm font-bold text-[#26372f]">{fileName || "Choose status file"}</span>
          <span className="mt-1 block text-xs text-[#7d8b84]">.xlsx or .csv · maximum 5 MB</span>
        </span>
      </label>

      <button
        disabled={pending || !fileName}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#172f25] px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
        {pending ? "Processing..." : "Upload Status Updates"}
      </button>

      {state.message ? (
        <div aria-live="polite" className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
          state.status === "success"
            ? "bg-[#e8f6ee] text-[#176a47]"
            : state.status === "partial"
              ? "bg-[#fff5df] text-[#8a5a12]"
              : "bg-[#fff0f0] text-[#a13f3f]"
        }`}>
          <p>{state.message}</p>
          {state.errors.length > 0 ? (
            <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-auto pl-4 font-medium">
              {state.errors.map((error, index) => (
                <li key={`${error.row}-${error.field}-${index}`}>Row {error.row}: {error.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}


