import Link from "next/link";
import {
  ArrowLeft,
  ArrowLeftRight,
  PackageSearch,
  RotateCcw,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createReverseOrderAction } from "../actions";

export const metadata = {
  title: "Create Reverse / Exchange",
};

function errorMessage(code?: string) {
  switch (code) {
    case "missing":
      return "Select an operation type and enter the original AWB.";
    case "replacement":
      return "Exchange orders require a replacement AWB.";
    case "original_not_found":
      return "Original delivered AWB could not be found.";
    case "not_delivered":
      return "Reverse or exchange can only be created from a delivered AWB.";
    case "replacement_not_found":
      return "Replacement AWB could not be found.";
    case "replacement_shipper":
      return "Replacement AWB must belong to the same shipper.";
    case "shipper":
      return "The original AWB does not have a valid shipper.";
    case "organization":
      return "Your account is not linked to an organization.";
    case "create":
      return "Reverse / Exchange request could not be created. Check whether an active request already exists.";
    default:
      return null;
  }
}

export default async function NewReverseExchangePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireProfile([
    ...internalRoles,
    "shipper",
  ]);

  const params = await searchParams;
  const message = errorMessage(params.error);

  return (
    <div className="mx-auto max-w-[950px]">
      <Link
        href="/reverse-exchange"
        className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"
      >
        <ArrowLeft className="size-4" />
        Back to Reverse & Exchange
      </Link>

      <div>
        <p className="text-sm font-semibold text-[#188459]">
          Parcel Operations
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
          Create Reverse / Exchange
        </h1>

        <p className="mt-2 text-sm text-[#74827b]">
          Start from the original delivered AWB.
          Customer pickup details will be copied
          automatically from that shipment.
        </p>
      </div>

      {message ? (
        <div className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          {message}
        </div>
      ) : null}

      <form
        action={createReverseOrderAction}
        className="mt-7 space-y-5"
      >
        <section className="rounded-2xl border border-[#e0e8e4] bg-white p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]">
              <PackageSearch className="size-5" />
            </span>

            <div>
              <h2 className="font-bold text-[#26372f]">
                Operation
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Reverse pickup or replacement exchange.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="text-xs font-bold text-[#53645c]">
              Operation Type *
              <select
                name="order_type"
                required
                defaultValue="reverse_pickup"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-semibold"
              >
                <option value="reverse_pickup">
                  Reverse Pickup
                </option>
                <option value="exchange">
                  Exchange Order
                </option>
              </select>
            </label>

            <label className="text-xs font-bold text-[#53645c]">
              Original Delivered AWB *
              <input
                name="original_awb"
                required
                placeholder="Scan or enter AWB"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 font-mono text-sm uppercase"
              />
            </label>

            <label className="text-xs font-bold text-[#53645c] md:col-span-2">
              Replacement AWB
              <input
                name="replacement_awb"
                placeholder="Required only for Exchange"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 font-mono text-sm uppercase"
              />
              <span className="mt-1.5 block text-[11px] font-normal text-[#87938d]">
                Leave blank for Reverse Pickup.
                Exchange requires a new replacement AWB
                belonging to the same shipper.
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e0e8e4] bg-white p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-xs font-bold text-[#53645c]">
              Expected Pieces
              <input
                name="expected_pieces"
                type="number"
                min="1"
                defaultValue="1"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
              />
            </label>

            <label className="text-xs font-bold text-[#53645c]">
              Reason
              <input
                name="reason"
                placeholder="Wrong size, damaged, exchange..."
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
              />
            </label>

            <label className="text-xs font-bold text-[#53645c] md:col-span-2">
              Item to Collect
              <input
                name="expected_item_description"
                placeholder="Leave blank to use original shipment contents"
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
              />
            </label>

            <label className="text-xs font-bold text-[#53645c] md:col-span-2">
              Customer / Driver Notes
              <textarea
                name="customer_notes"
                rows={4}
                placeholder="Collection instructions..."
                className="mt-2 w-full rounded-xl border border-[#dbe5e0] px-3 py-3 text-sm"
              />
            </label>
          </div>
        </section>

        <div className="flex flex-col gap-3 rounded-2xl border border-[#cfe3d8] bg-[#edf8f2] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex gap-1">
              <RotateCcw className="size-5 text-[#13734b]" />
              <ArrowLeftRight className="size-5 text-[#13734b]" />
            </div>

            <div>
              <p className="text-sm font-bold text-[#30443a]">
                Create operation
              </p>
              <p className="mt-1 text-xs text-[#678076]">
                Original customer address and service-zone
                information will be copied automatically.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#13734b] px-6 text-sm font-bold text-white"
          >
            Create Request
          </button>
        </div>
      </form>
    </div>
  );
}
