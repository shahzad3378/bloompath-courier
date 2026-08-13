import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal-shell";
import { requireProfile } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile();
  return <PortalShell profile={profile}>{children}</PortalShell>;
}
