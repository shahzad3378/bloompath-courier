import { DashboardUI } from "@/components/dashboard-ui";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireProfile(internalRoles);
  return <DashboardUI name={profile.full_name} />;
}
