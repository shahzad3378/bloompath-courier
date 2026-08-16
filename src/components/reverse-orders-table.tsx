"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  RotateCcw,
} from "lucide-react";
import { ReverseOrderActions } from "@/components/reverse-order-actions";

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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

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

  function toggleAll() {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((row) => row.id));
    }
  }

  function toggleOne(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  return (
    <div className="mt-7 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
      {selectedIds.length > 0 ? (
        <div className="flex items-center justify-between border-b border-[#e8eeeb] bg-[#f8faf9] px-4 py-3">
          <p className="text-xs font-bold text-[#405048]">
            {selectedIds.length} selected
          </p>

          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="text-xs font-bold text-[#13734b]"
          >
            Clear selection
          </button>
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
                      element.indeterminate = someSelected;
                    }
                  }}
                  onChange={toggleAll}
                  className="size-4 rounded border-[#cfdad4]"
                />
              </th>

              <th className="px-4 py-3.5">Request</th>
              <th className="px-4 py-3.5">Customer</th>
              <th className="px-4 py-3.5">AWBs</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#edf1ef]">
            {rows.map((row) => {
              const selected = selectedSet.has(row.id);

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
                      onChange={() => toggleOne(row.id)}
                      aria-label={`Select ${row.reverse_number}`}
                      className="mt-1 size-4 rounded border-[#cfdad4]"
                    />
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="flex items-center gap-2">
                      {row.order_type === "exchange" ? (
                        <ArrowLeftRight className="size-4 text-[#376eb1]" />
                      ) : (
                        <RotateCcw className="size-4 text-[#b76223]" />
                      )}

                      <p className="font-mono text-sm font-black text-[#26372f]">
                        {row.reverse_number}
                      </p>
                    </div>

                    <p className="mt-2 text-[10px] font-bold uppercase text-[#87938d]">
                      {row.order_type === "exchange"
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
                      {row.original?.tracking_number || "—"}
                    </p>

                    {row.replacement?.tracking_number ? (
                      <>
                        <p className="mt-2 text-[10px] font-bold uppercase text-[#87938d]">
                          Replacement AWB
                        </p>

                        <p className="mt-1 font-mono text-xs font-bold text-[#376eb1]">
                          {row.replacement.tracking_number}
                        </p>
                      </>
                    ) : null}

                    <p className="mt-2 text-[10px] font-bold uppercase text-[#87938d]">
                      Reverse AWB
                    </p>

                    <p
                      className={`mt-1 font-mono text-xs font-black ${
                        row.reverse_shipment?.tracking_number
                          ? "text-[#b76223]"
                          : "text-[#a2ada7]"
                      }`}
                    >
                      {row.reverse_shipment?.tracking_number ||
                        "Not generated"}
                    </p>
                  </td>

                  <td className="px-4 py-4 align-top">
                    <span className="inline-flex rounded-full bg-[#edf8f2] px-2.5 py-1 text-[10px] font-black uppercase text-[#13734b]">
                      {String(row.status).replaceAll("_", " ")}
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
                        row.reverse_shipment?.id ?? null
                      }
                      reverseTrackingNumber={
                        row.reverse_shipment?.tracking_number ??
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
