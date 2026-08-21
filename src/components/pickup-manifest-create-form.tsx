"use client";

import { useActionState } from "react";
import { LoaderCircle, PackagePlus } from "lucide-react";
import { type ManifestActionState } from "@/app/(portal)/pickup-manifests/actions";
import { createSellerPickupManifestAction } from "@/app/(portal)/pickup-manifests/create-action";

const initialState: ManifestActionState = { status: "idle", message: "" };

type ShipperOption = {
  id: string;
  name: string;
  email: string;
};

export function PickupManifestCreateForm({
  shipperOptions,
  currentShipper,
}: {
  shipperOptions: ShipperOption[];
  currentShipper?: ShipperOption | null;
}) {
  const [state, action, pending] = useActionState(createSellerPickupManifestAction, initialState);

  return (
    <form action={action} className="rounded-2xl border border-[#dfe8e3] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
          <PackagePlus className="size-5" />
        </span>
        <div>
          <h2 className="font-bold text-[#26372f]">New pickup manifest</h2>
          <p className="mt-0.5 text-xs text-[#7c8982]">Select the shipper, then scan or bulk add only that seller&apos;s AWBs.</p>
        </div>
      </div>

      {currentShipper ? (
        <div className="mt-4 rounded-xl border border-[#dbe5e0] bg-[#f8fbf9] px-3 py-3">
          <input type="hidden" name="shipper_id" value={currentShipper.id} />
          <p className="text-[10px] font-black uppercase tracking-wide text-[#87938d]">Shipper / pickup account</p>
          <p className="mt-1 text-sm font-bold text-[#26372f]">{currentShipper.name}</p>
          <p className="mt-0.5 text-xs text-[#74827b]">{currentShipper.email}</p>
        </div>
      ) : (
        <label className="mt-4 block text-xs font-bold text-[#526159]">
          Shipper / pickup account
          <select
            name="shipper_id"
            required
            defaultValue=""
            className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-normal outline-none focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10"
          >
            <option value="" disabled>Select shipper</option>
            {shipperOptions.map((shipper) => (
              <option key={shipper.id} value={shipper.id}>
                {shipper.name} · {shipper.email}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-normal text-[#87938d]">Scroll the list to select the seller. No manual typing is required.</span>
        </label>
      )}

      {state.message ? (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${state.status === "success" ? "bg-[#e8f6ee] text-[#176a47]" : "bg-[#fff0f0] text-[#a13f3f]"}`}>
          {state.message}
        </p>
      ) : null}

      <button
        disabled={pending || (!currentShipper && shipperOptions.length === 0)}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#13734b] px-4 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
        {pending ? "Creating…" : "Create manifest"}
      </button>
    </form>
  );
}
