import { ShieldCheck, ShieldOff, UserRoundCog } from "lucide-react";
import { setShipmentDeletePermissionAction } from "@/app/(portal)/users/actions";
import { requireProfile } from "@/lib/auth";
import { roleLabel, shipmentDeleteDelegateRoles, type Profile } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Users & Roles" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const currentProfile = await requireProfile(["super_admin"]);
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, email, phone, employee_code, role, status, can_delete_shipments")
    .eq("organization_id", currentProfile.organization_id)
    .order("full_name", { ascending: true });
  const profiles = (data ?? []) as Profile[];

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]"><UserRoundCog className="size-6" /></span><div><p className="text-sm font-semibold text-[#188459]">Access control</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Users & roles</h1><p className="mt-2 text-sm text-[#74827b]">Control who may archive booked AWBs. Super Admin always retains access.</p></div></div>
      {params.saved === "1" ? <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">AWB archive permission updated.</div> : null}
      {params.error ? <div className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">Permission could not be updated. Please retry.</div> : null}
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
        {error ? <p className="p-8 text-center text-sm font-semibold text-[#b74646]">Users could not be loaded.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]"><tr><th className="px-5 py-3.5">User</th><th className="px-5 py-3.5">Role</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">AWB archive access</th><th className="px-5 py-3.5 text-right">Control</th></tr></thead><tbody className="divide-y divide-[#edf1ef]">
          {profiles.map((profile) => {
            const isSuperAdmin = profile.role === "super_admin";
            const eligible = shipmentDeleteDelegateRoles.includes(profile.role);
            const enabled = isSuperAdmin || (eligible && profile.can_delete_shipments);
            return <tr key={profile.id} className="text-sm"><td className="px-5 py-4"><p className="font-bold text-[#26372f]">{profile.full_name || "Unnamed user"}</p><p className="mt-1 text-xs text-[#87938d]">{profile.email}</p></td><td className="px-5 py-4 font-semibold text-[#405048]">{roleLabel(profile.role)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${profile.status === "active" ? "bg-[#e5f3eb] text-[#16724b]" : "bg-[#f0f1f0] text-[#68766f]"}`}>{profile.status}</span></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? "bg-[#e5f3eb] text-[#16724b]" : "bg-[#f8eeee] text-[#a34b4b]"}`}>{enabled ? <ShieldCheck className="size-3.5" /> : <ShieldOff className="size-3.5" />}{enabled ? "Allowed" : "Not allowed"}</span></td><td className="px-5 py-4 text-right">{isSuperAdmin ? <span className="text-xs font-semibold text-[#87938d]">Permanent</span> : eligible ? <form action={setShipmentDeletePermissionAction}><input type="hidden" name="profile_id" value={profile.id} /><input type="hidden" name="enabled" value={String(!profile.can_delete_shipments)} /><button className={`h-9 rounded-lg px-3 text-xs font-bold ${profile.can_delete_shipments ? "border border-[#e2c8c8] bg-white text-[#a13f3f]" : "bg-[#13734b] text-white"}`}>{profile.can_delete_shipments ? "Remove access" : "Grant access"}</button></form> : <span className="text-xs text-[#9aa39f]">Not eligible</span>}</td></tr>;
          })}
        </tbody></table></div>}
      </section>
    </div>
  );
}
