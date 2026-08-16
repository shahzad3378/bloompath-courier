"use client";

import {
  useMemo,
  useState,
} from "react";
import {
  ArrowLeftRight,
  ChevronDown,
  FilePlus2,
  Printer,
  RotateCcw,
  X,
} from "lucide-react";
import { ReverseOrderActions } from "@/components/reverse-order-actions";
import { generateBulkReverseAwbsAction } from "@/app/(portal)/reverse-exchange/actions";

type ReverseRow = {
  id: number;
  reverse_number: string;
  order_type: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  pickup_city: string;
  service_zone_name: string | null;
  reason: string | null;

  original?: {
    tracking_number: string;
  } | null;

  replacement?: {
    tracking_number: string;
  } | null;

  reverse_shipment?: {
    id: number;
    tracking_number: string;
  } | null;
};

export function ReverseOrdersTable({
  rows,
}: {
  rows: ReverseRow[];
}) {
  const [
    selectedIds,
    setSelectedIds,
  ] = useState<number[]>([]);

  const [
    bulkOpen,
    setBulkOpen,
  ] = useState(false);

  const allSelected =
    rows.length > 0 &&
    selectedIds.length === rows.length;

  const someSelected =
    selectedIds.length > 0 &&
    selectedIds.length < rows.length;

  const selectedSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds],
  );

  const selectedRows = useMemo(
    () =>
      rows.filter((row) =>
        selectedSet.has(row.id),
      ),
    [rows, selectedSet],
  );

  const printableShipmentIds =
    selectedRows
      .map(
        (row) =>
          row.reverse_shipment?.id,
      )
      .filter(
        (id): id is number =>
          typeof id === "number",
      );

  const missingAwbCount =
    selectedRows.filter(
      (row) =>
        !row.reverse_shipment?.id,
    ).length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(
        rows.map((row) => row.id),
      );
    }
  }

  function toggleOne(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter(
            (value) => value !== id,
          )
        : [...current, id],
    );
  }

  function printSelected(
    format: "4x6" | "a4",
  ) {
    if (
      printableShipmentIds.length === 0
    ) {
      return;
    }

    const ids =
      printableShipmentIds.join(",");

    window.open(
      `/print/shipments/bulk?ids=${encodeURIComponent(
        ids,
      )}&format=${format}`,
      "_blank",
      "noopener,noreferrer",
    );

    setBulkOpen(false);
  }

  return (
    <div className="mt-7 overflow-visible rounded-2xl border border-[#e0e8e4] bg-white">
      {selectedIds.length > 0 ? (
        <div className="relative z-20 flex flex-col gap-3 border-b border-[#dbe5e0] bg-[#f3f8f5] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-[#30443a]">
              {selectedIds.length} selected
            </p>

            <p className="mt-0.5 text-[10px] text-[#718078]">
              {printableShipmentIds.length} printable
              {missingAwbCount > 0
                ? ` · ${missingAwbCount} missing AWB`
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setBulkOpen(
                    (value) => !value,
                  )
                }
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#13734b] px-4 text-xs font-bold text-white"
              >
                Bulk Actions
                <ChevronDown className="size-3.5" />
              </button>

              {bulkOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close bulk actions"
                    onClick={() =>
                      setBulkOpen(false)
                    }
                    className="fixed inset-0 z-30 cursor-default"
                  />

                  <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-[#dfe7e3] bg-white py-1 text-left shadow-xl">
                    {missingAwbCount > 0 ? (
                      <form
                        action={
                          generateBulkReverseAwbsAction
                        }
                      >
                        <input
                          type="hidden"
                          name="reverse_order_ids"
                          value={selectedIds.join(
                            ",",
                          )}
                        />

                        <button
                          type="submit"
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-bold text-[#13734b] hover:bg-[#edf8f2]"
                        >
                          <FilePlus2 className="size-4" />
                          Generate Missing AWBs
                          <span className="ml-auto rounded-full bg-[#e7f4ed] px-2 py-0.5 text-[9px]">
                            {missingAwbCount}
                          </span>
                        </button>
                      </form>
                    ) : null}

                    <button
                      type="button"
                      disabled={
                        printableShipmentIds.length ===
                        0
                      }
                      onClick={() =>
                        printSelected("4x6")
                      }
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-[#405048] hover:bg-[#f5f8f6] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Printer className="size-4" />
                      Print Selected 4×6
                      <span className="ml-auto text-[9px] text-[#87938d]">
                        {
                          printableShipmentIds.length
                        }
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={
                        printableShipmentIds.length ===
                        0
                      }
                      onClick={() =>
                        printSelected("a4")
                      }
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-[#405048] hover:bg-[#f5f8f6] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Printer className="size-4" />
                      Print Selected A4
                      <span className="ml-auto text-[9px] text-[#87938d]">
                        {
                          printableShipmentIds.length
                        }
                      </span>
                    </button>

                    <div className="my-1 border-t border-[#edf1ef]" />

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIds([]);
                        setBulkOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-[#68766f] hover:bg-[#f5f8f6]"
                    >
                      <X className="size-4" />
                      Clear Selection
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() =>
                setSelectedIds([])
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d7e3dd] bg-white px-3 text-xs font-bold text-[#53645c]"
            >
              <X className="size-3.5" />
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[10px] uppercase tracking-[0.08em] text-[#77847e]">
            <tr>
              <th className="w-12 px-4 py-3.5">
                <input
                  type="checkbox"
                  aria-label="Select all reverse orders"
                  checked={allSelected}
                  ref={(element) => {
                    if (element) {
                      element.indeterminate =
                        someSelected;
                    }
                  }}
                  onChange={toggleAll}
                  className="size-4 rounded border-[#cfdad4]"
                />
              </th>

              <th className="px-4 py-3.5">
                Request
              </th>

              <th className="px-4 py-3.5">
                Customer
              </th>

              <th className="px-4 py-3.5">
                AWBs
              </th>

              <th className="px-4 py-3.5">
                Status
              </th>

              <th className="px-4 py-3.5 text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#edf1ef]">
            {rows.map((row) => {
              const selected =
                selectedSet.has(row.id);

              return (
                <tr
                  key={row.id}
                  className={
                    selected
                      ? "bg-[#f4faf7]"
                      : "hover:bg-[#fbfcfb]"
                  }
                >
                  <td className="px-4 py-4 align-top">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        toggleOne(row.id)
                      }
                      aria-label={`Select ${row.reverse_number}`}
                      className="mt-1 size-4 rounded border-[#cfdad4]"
                    />
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="flex items-center gap-2">
                      {row.order_type ===
                      "exchange" ? (
                        <ArrowLeftRight className="size-4 text-[#376eb1]" />
                      ) : (
                        <RotateCcw className="size-4 text-[#b76223]" />
                      )}

                      <p className="font-mono text-sm font-black text-[#26372f]">
                        {row.reverse_number}
                      </p>
                    </div>

                    <p className="mt-2 text-[10px] font-bold uppercase text-[#87938d]">
                      {row.order_type ===
                      "exchange"
                        ? "Exchange"
                        : "Reverse Pickup"}
                    </p>
                  </td>

                  <td className="px-4 py-4 align-top">
                    <p className="font-bold text-[#34453c]">
                      {row.customer_name}
                    </p>

                    <p className="mt-1 text-xs text-[#87938d]">
                      {row.customer_phone}
                    </p>

                    <p className="mt-1 text-xs text-[#87938d]">
                      {row.pickup_city}
                      {row.service_zone_name
                        ? ` · ${row.service_zone_name}`
                        : ""}
                    </p>
                  </td>

                  <td className="px-4 py-4 align-top">
                    <p className="text-[10px] font-bold uppercase text-[#87938d]">
                      Original AWB
                    </p>

                    <p className="mt-1 font-mono text-xs font-bold text-[#13734b]">
                      {row.original
                        ?.tracking_number ||
                        "—"}
                    </p>

                    {row.replacement
                      ?.tracking_number ? (
                      <>
                        <p className="mt-2 text-[10px] font-bold uppercase text-[#87938d]">
                          Replacement AWB
                        </p>

                        <p className="mt-1 font-mono text-xs font-bold text-[#376eb1]">
                          {
                            row.replacement
                              .tracking_number
                          }
                        </p>
                      </>
                    ) : null}

                    <p className="mt-2 text-[10px] font-bold uppercase text-[#87938d]">
                      Reverse AWB
                    </p>

                    <p
                      className={`mt-1 font-mono text-xs font-black ${
                        row.reverse_shipment
                          ?.tracking_number
                          ? "text-[#b76223]"
                          : "text-[#a2ada7]"
                      }`}
                    >
                      {row.reverse_shipment
                        ?.tracking_number ||
                        "Not generated"}
                    </p>
                  </td>

                  <td className="px-4 py-4 align-top">
                    <span className="inline-flex rounded-full bg-[#edf8f2] px-2.5 py-1 text-[10px] font-black uppercase text-[#13734b]">
                      {String(
                        row.status,
                      ).replaceAll("_", " ")}
                    </span>

                    {row.reason ? (
                      <p className="mt-2 max-w-[180px] text-xs text-[#87938d]">
                        {row.reason}
                      </p>
                    ) : null}
                  </td>

                  <td className="px-4 py-4 text-right align-top">
                    <ReverseOrderActions
                      reverseOrderId={row.id}
                      reverseShipmentId={
                        row.reverse_shipment
                          ?.id ?? null
                      }
                      reverseTrackingNumber={
                        row.reverse_shipment
                          ?.tracking_number ??
                        null
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
