"use client";

import dynamic from "next/dynamic";
import type { LiveOperationsMapProps } from "@/components/live-operations-map";

const LiveOperationsMap = dynamic(
  () =>
    import("@/components/live-operations-map").then(
      (module) => module.LiveOperationsMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[650px] place-items-center rounded-2xl border border-[#dfe7e3] bg-white text-sm font-semibold text-[#74827b]">
        Loading live operations map…
      </div>
    ),
  },
);

export function LiveOperationsMapLoader(
  props: LiveOperationsMapProps,
) {
  return <LiveOperationsMap {...props} />;
}
