import { IdleSession } from "@/components/idle-session";
import type { ReactNode } from "react";
import { SaasShell } from "@/components/saas-shell";
import { requirePlatformAdmin } from "@/lib/saas-auth";

export default async function SaasLayout({
  children,
}: {
  children: ReactNode;
}) {
  const platformAdmin = await requirePlatformAdmin();

  return (
    <SaasShell email={platformAdmin.email}>
      <IdleSession />
      {children}
    </SaasShell>
  );
}
