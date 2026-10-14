import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ShieldCheck, UsersRound } from "lucide-react";
import { updateTenantUserRoleAction } from "@/app/saas/users/actions";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { appRoles, roleLabel, type AppRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "SaaS Users & Roles" };

const roleOptions = appRoles.filter((role) => role !== "shipper");

export default async function SaasUsersPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string; q?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const query = (params.q ?? "").replace(/[^\p{L}\p{N}\s@._+-]/gu, "").trim().slice(0, 100);
  const requestedPage = Math.max(1, Math.floor(Number(params.page)) || 1);
  const pageSize = 50;
  const admin = createAdminClient();
  const { data: organizations } = await admin.from("organizations").select("id, name, slug").order("name");
  let profilesRequest = admin.from("profiles")
    .select("id, organization_id, full_name, email, employee_code, role, status", { count: "exact" })
    .not("organization_id", "is", null)
    .neq("role", "shipper");
  if (query) {
    const matchingOrganizationIds = (organizations ?? []).filter((item) =>
      `${item.name} ${item.slug}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ).map((item) => item.id);
    const matches = [`full_name.ilike.%${query}%`, `email.ilike.%${query}%`];
    if (matchingOrganizationIds.length) matches.push(`organization_id.in.(${matchingOrganizationIds.join(",")})`);
    profilesRequest = profilesRequest.or(matches.join(","));
  }
  const { data: profiles, error, count } = await profilesRequest
    .order("full_name", { ascending: true })
    .range((requestedPage - 1) * pageSize, requestedPage * pageSize - 1);

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (requestedPage > pageCount) {
    const destination = new URLSearchParams();
    if (query) destination.set("q", query);
    if (pageCount > 1) destination.set("page", String(pageCount));
    redirect(`/saas/users${destination.size ? `?${destination.toString()}` : ""}`);
  }

  const organizationNames = new Map((organizations ?? []).map((row) => [row.id, row.name]));
  const adminsByOrganization = new Map<string, number>();
  for (const profile of profiles ?? []) {
    if (profile.role === "super_admin" && profile.status === "active" && profile.organization_id) {
      adminsByOrganization.set(profile.organization_id, (adminsByOrganization.get(profile.organization_id) ?? 0) + 1);
    }
  }

  const messages: Record<string, string> = {
    invalid: "Choose a valid user and role.",
    target: "That user is unavailable for role changes.",
    inactive: "Activate the account before assigning Super Admin.",
    last_admin: "Every company must keep at least one active Super Admin.",
    save: "The role change could not be saved. Try again.",
  };

  return <div className="mx-auto max-w-[1450px]">
    <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]"><ShieldCheck className="size-6" /></span>
        <div><p className="text-sm font-semibold text-[#188459]">Platform-only access</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Users & roles</h1><p className="mt-2 max-w-2xl text-sm text-[#74827b]">Set company roles here. Company staff cannot promote themselves or change another account’s role.</p></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#dce6e1] bg-white px-5 py-3"><p className="text-[9px] font-bold uppercase tracking-wide text-[#7b8982]">Companies</p><p className="mt-1 text-xl font-black text-[#13734b]">{organizations?.length ?? 0}</p></div>
        <div className="rounded-xl border border-[#dce6e1] bg-white px-5 py-3"><p className="text-[9px] font-bold uppercase tracking-wide text-[#7b8982]">Staff accounts</p><p className="mt-1 text-xl font-black text-[#13734b]">{total}</p></div>
      </div>
    </div>

    {params.saved ? <div role="status" className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">User role updated.</div> : null}
    {params.error ? <div role="alert" className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">{messages[params.error] ?? "The user request could not be completed."}</div> : null}

    <section className="mt-7 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
      <div className="flex items-center gap-3 border-b border-[#e8eeeb] px-5 py-4"><Building2 className="size-5 text-[#13734b]" /><div><h2 className="font-bold text-[#26372f]">Company accounts</h2><p className="mt-1 text-xs text-[#87938d]">Role changes are restricted to the SaaS Control Center. Active Super Admins are protected.</p></div><UsersRound className="ml-auto size-5 text-[#13734b]" /></div>
      {(organizations ?? []).some((organization) => !adminsByOrganization.get(organization.id)) ? <div className="border-b border-[#f0d7ab] bg-[#fff8e9] px-5 py-3 text-sm font-semibold text-[#8b651e]">At least one company has no active Super Admin. Assign one below to restore company access.</div> : null}
      <form method="get" className="flex flex-wrap items-end gap-3 border-b border-[#e8eeeb] p-5"><label className="min-w-0 flex-1 text-xs font-semibold text-[#516159]">Find a company or user<input name="q" defaultValue={query} maxLength={100} placeholder="Company, name or email" className="mt-2 h-11 w-full rounded-xl border border-[#dbe5e0] px-3.5 text-sm" /></label><button className="h-11 rounded-xl border border-[#dbe5e0] bg-white px-4 text-sm font-bold text-[#405048] hover:bg-[#f5f8f6]">Search</button>{query ? <Link href="/saas/users" className="inline-flex h-11 items-center rounded-xl border border-[#dbe5e0] px-4 text-sm font-bold text-[#405048] hover:bg-[#f5f8f6]">Clear</Link> : null}</form>
      {error ? <p className="p-8 text-center text-sm font-semibold text-[#b74646]">Users could not be loaded.</p> : profiles?.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="px-5 py-3.5">Company</th><th className="px-5 py-3.5">User</th><th className="px-5 py-3.5">Current role</th><th className="px-5 py-3.5">Change role</th><th className="px-5 py-3.5">Status</th></tr></thead><tbody className="divide-y divide-[#edf1ef]">{profiles.map((profile) => {
        const currentRole = profile.role as AppRole;
        const organizationId = profile.organization_id ?? "";
        const activeAdmins = adminsByOrganization.get(organizationId) ?? 0;
        return <tr key={profile.id} className="align-middle"><td className="px-5 py-4"><p className="font-bold text-[#26372f]">{organizationNames.get(organizationId) ?? "Unknown company"}</p><p className="mt-1 text-xs text-[#87938d]">{activeAdmins} active Super Admin{activeAdmins === 1 ? "" : "s"}</p></td><td className="px-5 py-4"><p className="font-bold text-[#26372f]">{profile.full_name || "Unnamed user"}</p><p className="mt-1 break-all text-xs text-[#87938d]">{profile.email}</p>{profile.employee_code ? <p className="mt-1 text-[11px] text-[#9aa39f]">{profile.employee_code}</p> : null}<Link href={`/saas/users/${profile.id}`} className="mt-2 inline-flex text-xs font-bold text-[#13734b] hover:underline">Edit details</Link></td><td className="px-5 py-4 font-semibold text-[#405048]">{roleLabel(currentRole)}</td><td className="px-5 py-4"><form action={updateTenantUserRoleAction} className="flex items-center gap-2"><input type="hidden" name="user_id" value={profile.id} /><label className="sr-only" htmlFor={`role-${profile.id}`}>Role for {profile.full_name || profile.email}</label><select id={`role-${profile.id}`} name="role" defaultValue={currentRole} className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-sm">{roleOptions.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select><button className="h-10 rounded-lg bg-[#13734b] px-3 text-xs font-bold text-white">Save role</button></form></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${profile.status === "active" ? "bg-[#e5f3eb] text-[#16724b]" : "bg-[#f0f1f0] text-[#68766f]"}`}>{profile.status}</span></td></tr>;
      })}</tbody></table></div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eeeb] p-5 text-sm"><p className="text-[#74827b]">{total ? `${(requestedPage - 1) * pageSize + 1}–${Math.min(requestedPage * pageSize, total)} of ${total}` : "0 of 0"} · Page {requestedPage}</p><div className="flex gap-2">{requestedPage > 1 ? <Link href={userPageUrl(requestedPage - 1, query)} className="inline-flex h-10 items-center rounded-xl border border-[#dbe5e0] px-3 font-semibold hover:bg-[#f5f8f6]">Previous</Link> : null}{requestedPage < pageCount ? <Link href={userPageUrl(requestedPage + 1, query)} className="inline-flex h-10 items-center rounded-xl border border-[#dbe5e0] px-3 font-semibold hover:bg-[#f5f8f6]">Next</Link> : null}</div></footer></> : <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center"><UsersRound className="size-8 text-[#87938d]" /><h3 className="font-bold text-[#26372f]">{query ? "No matching users" : "No staff accounts yet"}</h3><p className="text-sm text-[#74827b]">{query ? "Try a different company name, user name or email." : "Company administrators will appear here after their accounts are created."}</p></div>}
    </section>
  </div>;
}

function userPageUrl(page: number, query: string) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (query) params.set("q", query);
  return `/saas/users?${params.toString()}`;
}
