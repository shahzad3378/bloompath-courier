"use client";

import dynamic from "next/dynamic";
import type { DispatchDeliveryMapProps, DispatchRouteMapProps } from "@/components/dispatch-route-map";

const DispatchRouteMap = dynamic(
  () =>
    import("@/components/dispatch-route-map").then(
      (module) => module.DispatchRouteMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[460px] place-items-center rounded-xl border border-[#dce6e1] bg-[#f6f9f7] text-sm font-semibold text-[#74827b]">
        Loading dispatcher route map…
      </div>
    ),
  },
);

export function DispatchRouteMapLoader(
  props: DispatchRouteMapProps,
) {
  return <DispatchRouteMap {...props} />;
}

const DispatchDeliveryMap = dynamic(
  () => import("@/components/dispatch-route-map").then((module) => module.DispatchDeliveryMap),
  {
    ssr: false,
    loading: () => <div className="mt-4 h-[220px] animate-pulse rounded-xl border border-[#dce6e1] bg-[#f6f9f7]" />,
  },
);

export function DispatchDeliveryMapLoader(props: DispatchDeliveryMapProps) {
  return <DispatchDeliveryMap {...props} />;
}
