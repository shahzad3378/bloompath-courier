import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserRoundPen } from "lucide-react";
import { updateTenantUserDetailsAction } from "@/app/saas/users/actions";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { roleLabel, type AppRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Edit SaaS user" };

export default async function SaasUserEditPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requirePlatformAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = createAdminClient();
  const { data: profile, error } = await admin.from("profiles")
    .select("id, organization_id, full_name, email, phone, employee_code, role, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !profile?.organization_id || profile.role === "shipper") notFound();

  const { data: organization } = await admin.from("organizations")
    .select("name")
    .eq("id", profile.organization_id)
    .maybeSingle();
  const messages: Record<string, string> = {
    invalid: "Name ya email valid nahin. Dono fields check karein.",
    email: "Email update nahin ho saka. Email pehle se use mein ho sakta hai.",
    save: "Details save nahin huin. Dobara koshish karein.",
  };

  return <div className="mx-auto max-w-3xl">
    <Link href="/saas/users" className="inline-flex items-center gap-2 text-sm font-bold text-[#527064] hover:text-[#13734b]"><ArrowLeft className="size-4" />Back to users & roles</Link>
    <header className="mt-6 flex items-start gap-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]"><UserRoundPen className="size-6" /></span>
      <div><p className="text-sm font-semibold text-[#188459]">{organization?.name ?? "Company account"}</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Edit user details</h1><p className="mt-2 text-sm text-[#74827b]">Account: {roleLabel(profile.role as AppRole)} · {profile.status}</p></div>
    </header>

    {query.saved ? <div role="status" className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">User details saved.</div> : null}
    {query.error ? <div role="alert" className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">{messages[query.error] ?? "The user update could not be completed."}</div> : null}

    <form action={updateTenantUserDetailsAction} className="mt-7 space-y-5 rounded-2xl border border-[#e0e8e4] bg-white p-6 shadow-[0_8px_30px_rgba(24,51,39,0.045)] sm:p-8">
      <input type="hidden" name="user_id" value={profile.id} />
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[#405048]">Full name<input name="full_name" required minLength={2} maxLength={120} defaultValue={profile.full_name ?? ""} autoComplete="name" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3.5 text-sm font-normal text-[#26372f] outline-none focus:border-[#38946b] focus:ring-2 focus:ring-[#38946b]/15" /></label>
        <label className="text-sm font-semibold text-[#405048]">Email<input name="email" type="email" required maxLength={180} defaultValue={profile.email ?? ""} autoComplete="email" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3.5 text-sm font-normal text-[#26372f] outline-none focus:border-[#38946b] focus:ring-2 focus:ring-[#38946b]/15" /></label>
        <label className="text-sm font-semibold text-[#405048]">Phone<input name="phone" type="tel" maxLength={30} defaultValue={profile.phone ?? ""} autoComplete="tel" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3.5 text-sm font-normal text-[#26372f] outline-none focus:border-[#38946b] focus:ring-2 focus:ring-[#38946b]/15" /></label>
        <label className="text-sm font-semibold text-[#405048]">Employee code<input name="employee_code" maxLength={50} defaultValue={profile.employee_code ?? ""} className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3.5 text-sm font-normal text-[#26372f] outline-none focus:border-[#38946b] focus:ring-2 focus:ring-[#38946b]/15" /></label>
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-[#edf1ef] pt-5">
        <Link href="/saas/users" className="inline-flex h-11 items-center rounded-xl border border-[#dbe5e0] px-4 text-sm font-bold text-[#405048] hover:bg-[#f5f8f6]">Cancel</Link>
        <button className="h-11 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#0f6540]">Save user details</button>
      </div>
    </form>
  </div>;
}
