import { Route } from "lucide-react";
import { EmptyModule } from "@/components/empty-module";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Driver Route" };

export default async function DriverPage() {
  await requireProfile(["driver"]);
  return <EmptyModule icon={Route} eyebrow="Driver application" title="My delivery route" description="Assigned shipments, navigation order, proof of delivery, undelivered reasons and reattempt controls will be available here." action="Start route — next module" />;
}
