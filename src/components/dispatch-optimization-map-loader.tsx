"use client";

import dynamic from "next/dynamic";
import type { DispatchOptimizationMapProps } from "@/components/dispatch-optimization-map";

const DispatchOptimizationMap = dynamic(
  () => import("@/components/dispatch-optimization-map").then((module) => module.DispatchOptimizationMap),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[760px] place-items-center rounded-2xl border border-[#dfe7e3] bg-white text-sm font-semibold text-[#74827b]">
        Loading dispatch optimization map…
      </div>
    ),
  },
);

export function DispatchOptimizationMapLoader(props: DispatchOptimizationMapProps) {
  return <DispatchOptimizationMap {...props} />;
}
