"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { refreshGtaReportStatuses, type RefreshStatusState } from "./refresh-action";

const initialState: RefreshStatusState = { status: "idle", message: "" };

export function RefreshStatusButton({ range, from, to, page, pageSize }: { range: string; from: string; to: string; page: number; pageSize: number }) {
  const [state, action, pending] = useActionState(refreshGtaReportStatuses, initialState);
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="range" value={range} /><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} />
    <input type="hidden" name="page" value={page} /><input type="hidden" name="page_size" value={pageSize} />
    <button type="submit" disabled={pending} className="bp-button-secondary" title="Pull the latest verified tracking status from GTA/AirSkip for shipments on this report page">
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />{pending ? "Checking GTA…" : "Refresh live statuses"}
    </button>
    {state.message ? <span role={state.status === "error" ? "alert" : "status"} className="basis-full text-xs text-[#68766f]">{state.message}</span> : null}
  </form>;
}
