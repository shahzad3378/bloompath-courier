"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckSquare2, Route, X } from "lucide-react";
import {
  cancelDraftRoutesAction,
  type CancelDraftRoutesState,
} from "@/app/(portal)/dispatch/actions";

export type DraftRouteSummary = {
  id: number;
  runNumber: string;
  routeName: string;
  driverName: string;
  totalStops: number;
};

const initialState: CancelDraftRoutesState = {
  status: "idle",
  message: "",
};

function CancelSubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-11 min-w-40 items-center justify-center rounded-xl bg-[#a13f3f] px-5 text-sm font-bold text-white transition hover:bg-[#8f3333] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#a13f3f]/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Cancelling routes…" : `Cancel ${count} route${count === 1 ? "" : "s"}`}
    </button>
  );
}

export function DraftRouteManager({ routes }: { routes: DraftRouteSummary[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [state, formAction] = useActionState(cancelDraftRoutesAction, initialState);

  const routeIdSet = useMemo(() => new Set(routes.map((route) => route.id)), [routes]);
  const allSelected = routes.length > 0 && selectedIds.length === routes.length;
  const selectedStops = routes
    .filter((route) => selectedIds.includes(route.id))
    .reduce((total, route) => total + route.totalStops, 0);

  useEffect(() => {
    setSelectedIds((current) => current.filter((routeId) => routeIdSet.has(routeId)));
  }, [routeIdSet]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.length > 0 && !allSelected;
    }
  }, [allSelected, selectedIds.length]);

  useEffect(() => {
    if (state.status !== "success") return;
    dialogRef.current?.close();
    setSelectedIds([]);
    router.refresh();
  }, [router, state]);

  function toggleRoute(routeId: number) {
    setSelectedIds((current) =>
      current.includes(routeId)
        ? current.filter((id) => id !== routeId)
        : [...current, routeId],
    );
  }

  function openConfirmation() {
    if (selectedIds.length === 0 || dialogRef.current?.open) return;
    dialogRef.current?.showModal();
    requestAnimationFrame(() => cancelButtonRef.current?.focus());
  }

  return (
    <section className="mt-7 overflow-hidden rounded-2xl border border-[#dce6e1] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
      <div className="flex flex-col justify-between gap-4 border-b border-[#e8eeeb] px-5 py-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef4f1] text-[#526159]">
            <Route className="size-5" />
          </span>
          <div>
            <h2 className="font-bold text-[#26372f]">Draft route management</h2>
            <p className="mt-1 text-xs leading-5 text-[#7a8881]">
              Remove individual AWBs inside a draft route, or cancel selected draft routes here.
            </p>
          </div>
        </div>
        <div className="flex min-h-11 flex-wrap items-center gap-3">
          <span aria-live="polite" className="text-sm font-semibold text-[#526159]">
            {selectedIds.length} selected · {selectedStops.toLocaleString("en-US")} shipments
          </span>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={openConfirmation}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#e4bcbc] bg-[#fff7f7] px-4 text-sm font-bold text-[#a13f3f] transition hover:bg-[#fff0f0] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#a13f3f]/15 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Cancel selected routes
          </button>
        </div>
      </div>

      {state.message ? (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={`mx-5 mt-5 rounded-xl border px-4 py-3 text-sm font-semibold ${
            state.status === "error"
              ? "border-[#efc7c7] bg-[#fff1f1] text-[#a13f3f]"
              : "border-[#bfe3cf] bg-[#ebf8f1] text-[#176a47]"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      {routes.length === 0 ? (
        <div className="grid min-h-36 place-items-center p-8 text-center">
          <div>
            <CheckSquare2 className="mx-auto size-6 text-[#188459]" />
            <p className="mt-3 font-semibold text-[#596861]">No draft routes to manage.</p>
            <p className="mt-1 text-xs text-[#87938d]">With-driver routes remain locked for delivery audit.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 border-b border-[#edf1ef] bg-[#f8faf9] px-5 py-3">
            <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-bold text-[#44554c]">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={(event) =>
                  setSelectedIds(event.target.checked ? routes.map((route) => route.id) : [])
                }
                aria-label="Select all draft routes shown"
                className="size-4 accent-[#13734b]"
              />
              Select all {routes.length} draft routes shown
            </label>
            {selectedIds.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-xs font-bold text-[#526159] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2b9466]/15"
              >
                Clear selection
              </button>
            ) : null}
          </div>
          <div className="max-h-80 divide-y divide-[#edf1ef] overflow-y-auto">
            {routes.map((route) => {
              const checked = selectedIds.includes(route.id);
              return (
                <label
                  key={route.id}
                  className={`grid cursor-pointer gap-3 px-5 py-4 transition sm:grid-cols-[auto_1fr_auto] sm:items-center ${
                    checked ? "bg-[#f0f8f4]" : "hover:bg-[#fafcfb]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRoute(route.id)}
                    aria-label={`Select route ${route.runNumber}`}
                    className="size-4 accent-[#13734b]"
                  />
                  <span>
                    <span className="block font-mono text-sm font-black text-[#26372f]">{route.runNumber}</span>
                    <span className="mt-1 block text-xs text-[#7a8881]">
                      {route.driverName} · {route.routeName}
                    </span>
                  </span>
                  <span className="pl-7 text-sm font-bold text-[#526159] sm:pl-0">
                    {route.totalStops.toLocaleString("en-US")} shipment{route.totalStops === 1 ? "" : "s"}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="cancel-routes-title"
        aria-describedby="cancel-routes-description"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-[#e6d4d4] bg-white p-0 text-[#26372f] shadow-[0_28px_90px_rgba(35,25,25,0.28)] backdrop:bg-[#17231e]/45"
      >
        <form action={formAction} noValidate className="p-5 sm:p-6">
          {selectedIds.map((routeId) => (
            <input key={routeId} type="hidden" name="route_ids" value={routeId} />
          ))}
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#fff0f0] text-[#a13f3f]">
              <AlertTriangle className="size-5" />
            </span>
            <button
              type="button"
              aria-label="Close cancellation dialog"
              onClick={() => dialogRef.current?.close()}
              className="grid size-9 place-items-center rounded-lg text-[#65736c] hover:bg-[#f2f5f3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2b9466]/15"
            >
              <X className="size-4" />
            </button>
          </div>
          <h2 id="cancel-routes-title" className="mt-5 text-xl font-black tracking-[-0.02em]">
            Cancel {selectedIds.length} draft route{selectedIds.length === 1 ? "" : "s"}?
          </h2>
          <p id="cancel-routes-description" className="mt-3 text-sm leading-6 text-[#66756d]">
            This releases {selectedStops.toLocaleString("en-US")} shipment{selectedStops === 1 ? "" : "s"} back to route planning.
            Route records remain in history for audit. Routes already handed to a driver are not included and cannot be cancelled here.
          </p>
          {state.status === "error" ? (
            <div role="alert" className="mt-4 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
              {state.message}
            </div>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8e2dd] px-5 text-sm font-bold text-[#4f6057] hover:bg-[#f5f8f6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2b9466]/15"
            >
              Keep routes
            </button>
            <CancelSubmitButton count={selectedIds.length} />
          </div>
        </form>
      </dialog>
    </section>
  );
}
