import type { Metadata } from "next";
import { PublicTracking } from "@/components/public-tracking";

export const metadata: Metadata = {
  title: "Track a shipment",
  description: "Track a Fast Drop shipment with its AWB or customer reference number.",
};

export default function TrackingPage() {
  return <PublicTracking />;
}
