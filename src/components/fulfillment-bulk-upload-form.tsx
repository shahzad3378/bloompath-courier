"use client";

import Link from "next/link";
import { useActionState } from "react";
import { bulkCreateFulfillmentProductsAction, bulkReceiveFulfillmentStockAction } from "@/app/(portal)/fulfillment/actions";

type Kind = "products" | "stock";
const field = "bp-input w-full";
const idle = { status: "idle" as const, message: "" };

export function FulfillmentBulkUploadForm({ kind }: { kind: Kind }) {
  const actionFunction = kind === "products" ? bulkCreateFulfillmentProductsAction : bulkReceiveFulfillmentStockAction;
  const [state, action, pending] = useActionState(actionFunction, idle);
  const isProducts = kind === "products";
  const required = isProducts ? "sku, name" : "sku, quantity";
  const templateHref = `/fulfillment/template?kind=${kind}`;
  return <form action={action} className="bp-panel max-w-3xl space-y-5 p-5">
    <div className="rounded-xl bg-[#f7f9fc] p-4 text-sm leading-6 text-[#65736c]">Upload an <b>.xlsx</b> or <b>.csv</b> file with the template headers. Keep the first row unchanged. Required columns: <b>{required}</b>. Up to 5,000 rows and 5 MB per upload.</div>
    <Link href={templateHref} className="inline-flex rounded-lg bg-[#174ea6] px-4 py-2.5 text-xs font-bold text-white">Download Excel template</Link>
    <label className="block text-xs font-bold text-[#526159]">Choose Excel or CSV<input className={`${field} mt-2`} type="file" name="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required /></label>
    {state.message ? <p role="status" className={`rounded-lg px-3 py-2 text-sm font-semibold ${state.status === "success" ? "bg-blue-50 text-blue-800" : "bg-red-50 text-red-700"}`}>{state.message}</p> : null}
    <button disabled={pending} className="bp-button-primary disabled:opacity-50">{pending ? "Uploading…" : `Upload ${isProducts ? "products" : "stock"}`}</button>
  </form>;
}
