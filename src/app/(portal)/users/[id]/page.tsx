import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Save, Truck, UserRoundCog } from "lucide-react";
import { updateDriverDetailsAction, updateStaffDetailsAction } from "@/app/(portal)/users/actions";
import { requireProfile } from "@/lib/auth";
import { roleLabel, type AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit Staff" };

export default async function EditStaffPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await requireProfile(["super_admin"]);
  const { id } = await params;
  const query = await searchParams;
  if (!actor.organization_id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: staff } = await supabase.from("profiles")
    .select("id, full_name, email, phone, employee_code, role, status")
    .eq("id", id)
    .eq("organization_id", actor.organization_id)
    .maybeSingle();
  if (!staff || staff.role === "shipper" || staff.role === "super_admin") notFound();

  const { data: driver } = staff.role === "driver"
    ? await supabase.from("driver_profiles")
        .select("vehicle_number, plate_number, driving_licence_number, licence_expiry")
        .eq("driver_id", id)
        .eq("organization_id", actor.organization_id)
        .maybeSingle()
    : { data: null };

  const errors: Record<string, string> = {
    invalid: "Review the name, email and date fields.",
    email: "Sign-in email could not be updated. It may already be in use.",
    save: "Staff details could not be saved. Please retry.",
    driver: "Driver details could not be saved. Please retry.",
  };

  return <div className="bp-page max-w-4xl">
    <Link href="/users" className="inline-flex items-center gap-2 text-sm font-bold text-[#13734b] hover:underline"><ArrowLeft className="size-4" /> Users & roles</Link>
    <div className="mt-5 flex items-start gap-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]"><UserRoundCog className="size-6" /></span>
      <div><p className="bp-section-label">Staff account</p><h1 className="bp-heading mt-1 text-3xl font-black">Edit {staff.full_name}</h1>
        <p className="mt-2 text-sm text-[#74827b]">{roleLabel(staff.role as AppRole)} · {staff.status}. Login access is controlled from Users & roles.</p></div>
    </div>

    {query.saved ? <div role="status" className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">{query.saved === "driver" ? "Driver details" : "Staff details"} saved.</div> : null}
    {query.error ? <div role="alert" className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">{errors[query.error] ?? "Could not save the changes."}</div> : null}

    <form action={updateStaffDetailsAction} className="bp-panel mt-6 space-y-5 p-6">
      <input type="hidden" name="profile_id" value={id} />
      <div><h2 className="text-lg font-bold text-[#26372f]">Account details</h2><p className="mt-1 text-xs text-[#87938d]">Changing email also changes the address used to sign in.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold text-[#516159]">Full name *<input name="full_name" required minLength={2} maxLength={120} defaultValue={staff.full_name} className="bp-input mt-1.5 w-full" /></label>
        <label className="text-xs font-bold text-[#516159]">Sign-in email *<input name="email" type="email" required maxLength={180} defaultValue={staff.email} className="bp-input mt-1.5 w-full" /></label>
        <label className="text-xs font-bold text-[#516159]">Phone<input name="phone" type="tel" maxLength={30} defaultValue={staff.phone ?? ""} className="bp-input mt-1.5 w-full" /></label>
        <label className="text-xs font-bold text-[#516159]">Employee code<input name="employee_code" maxLength={50} defaultValue={staff.employee_code ?? ""} className="bp-input mt-1.5 w-full" /></label>
      </div>
      <button className="bp-button-primary inline-flex items-center gap-2"><Save className="size-4" /> Save staff details</button>
    </form>

    {staff.role === "driver" ? <form action={updateDriverDetailsAction} className="bp-panel mt-5 space-y-5 p-6">
      <input type="hidden" name="profile_id" value={id} />
      <div className="flex items-center gap-2"><Truck className="size-5 text-[#13734b]" /><h2 className="text-lg font-bold text-[#26372f]">Driver details</h2></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold text-[#516159]">Vehicle number<input name="vehicle_number" maxLength={80} defaultValue={driver?.vehicle_number ?? ""} className="bp-input mt-1.5 w-full" /></label>
        <label className="text-xs font-bold text-[#516159]">Plate number<input name="plate_number" maxLength={80} defaultValue={driver?.plate_number ?? ""} className="bp-input mt-1.5 w-full" /></label>
        <label className="text-xs font-bold text-[#516159]">Driving licence<input name="driving_licence_number" maxLength={100} defaultValue={driver?.driving_licence_number ?? ""} className="bp-input mt-1.5 w-full" /></label>
        <label className="text-xs font-bold text-[#516159]">Licence expiry<input name="licence_expiry" type="date" defaultValue={driver?.licence_expiry ?? ""} className="bp-input mt-1.5 w-full" /></label>
      </div>
      <button className="bp-button-primary inline-flex items-center gap-2"><Save className="size-4" /> Save driver details</button>
    </form> : null}
  </div>;
}
