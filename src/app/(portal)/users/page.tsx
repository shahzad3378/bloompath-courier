import { UserRoundCog } from "lucide-react";
import { EmptyModule } from "@/components/empty-module";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Users & Roles" };

export default async function UsersPage() {
  await requireProfile(["super_admin", "operations_admin"]);
  return <EmptyModule icon={UserRoundCog} eyebrow="Access control" title="Users & roles" description="Create internal users, assign operational roles and control account status after the courier Supabase project is connected." action="Add user — available after connection" />;
}
