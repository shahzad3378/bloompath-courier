import Link from "next/link";
import {
  Plus,
  ShieldCheck,
  ShieldOff,
  Truck,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import {
  createInternalUserAction,
  setShipmentDeletePermissionAction,
  setUserStatusAction,
} from "@/app/(portal)/users/actions";
import { requireProfile } from "@/lib/auth";
import {
  roleLabel,
  shipmentDeleteDelegateRoles,
  type Profile,
} from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Users & Roles",
};

type DriverProfile = {
  driver_id: string;
  vehicle_number: string | null;
  plate_number: string | null;
  driving_licence_number: string | null;
  licence_expiry: string | null;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    created?: string;
    status_saved?: string;
    error?: string;
  }>;
}) {
  const currentProfile =
    await requireProfile(["super_admin"]);

  const params = await searchParams;
  const supabase = await createClient();

  const [
    { data, error },
    { data: driverData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, organization_id, full_name, email, phone, employee_code, role, status, can_delete_shipments",
      )
      .eq(
        "organization_id",
        currentProfile.organization_id,
      )
      .order("full_name", { ascending: true }),

    supabase
      .from("driver_profiles")
      .select(
        "driver_id, vehicle_number, plate_number, driving_licence_number, licence_expiry",
      )
      .eq(
        "organization_id",
        currentProfile.organization_id,
      ),
  ]);

  const profiles = (data ?? []) as Profile[];
  const driverProfiles =
    (driverData ?? []) as DriverProfile[];

  const driverMap = new Map(
    driverProfiles.map((row) => [
      row.driver_id,
      row,
    ]),
  );

  const internalCount = profiles.filter(
    (row) => row.role !== "shipper",
  ).length;

  const driverCount = profiles.filter(
    (row) => row.role === "driver",
  ).length;

  const activeCount = profiles.filter(
    (row) => row.status === "active",
  ).length;

  const errorMessages: Record<string, string> = {
    organization: "Your admin account is not linked to a company.",
    invalid: "Review the required fields, role and account status.",
    account: "The login account could not be created. The email may already be in use.",
    create: "The account was not completed. Check the driver details and retry.",
    status: "The account status could not be updated.",
    update: "The requested permission could not be updated.",
  };

  return (
    <div className="mx-auto max-w-[1450px]">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f4ed] text-[#13734b]">
            <UserRoundCog className="size-6" />
          </span>

          <div>
            <p className="text-sm font-semibold text-[#188459]">
              Access control
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
              Users & roles
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-[#74827b]">
              Create staff and drivers, control account status and
              manage operational permissions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            ["Users", internalCount],
            ["Drivers", driverCount],
            ["Active", activeCount],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-[#dce6e1] bg-white px-5 py-3"
            >
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#7b8982]">
                {label}
              </p>
              <p className="mt-1 text-xl font-black text-[#13734b]">
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {params.created === "1" ? (
        <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          User account created successfully.
        </div>
      ) : null}

      {params.saved === "1" ? (
        <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          AWB archive permission updated.
        </div>
      ) : null}

      {params.status_saved === "1" ? (
        <div className="mt-6 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          User status updated.
        </div>
      ) : null}

      {params.error ? (
        <div className="mt-6 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          {errorMessages[params.error] ??
            "User operation could not be completed. Please review the details and retry."}
        </div>
      ) : null}

      <div className="mt-7 grid gap-5 xl:grid-cols-[390px_1fr]">
        <form
          id="add-driver"
          action={createInternalUserAction}
          className="self-start rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-[0_8px_30px_rgba(24,51,39,0.045)]"
        >
          <div className="flex items-center gap-3 border-b border-[#edf1ef] pb-4">
            <span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
              <Plus className="size-5" />
            </span>
            <div>
              <h2 className="font-bold text-[#26372f]">
                Add staff or driver
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Driver is selected by default for quick setup
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-xs font-bold text-[#516159]">
              Full name *
              <input
                name="full_name"
                required
                minLength={2}
                maxLength={120}
                className="mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] px-3.5 text-sm outline-none focus:border-[#2b9466]"
                placeholder="Employee full name"
              />
            </label>

            <label className="block text-xs font-bold text-[#516159]">
              Email *
              <input
                name="email"
                type="email"
                required
                className="mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] px-3.5 text-sm outline-none focus:border-[#2b9466]"
                placeholder="name@company.com"
              />
            </label>

            <label className="block text-xs font-bold text-[#516159]">
              Temporary password *
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] px-3.5 text-sm outline-none focus:border-[#2b9466]"
                placeholder="Minimum 8 characters"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold text-[#516159]">
                Phone
                <input
                  name="phone"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                  placeholder="+971..."
                />
              </label>

              <label className="block text-xs font-bold text-[#516159]">
                Employee code
                <input
                  name="employee_code"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] px-3 text-sm"
                  placeholder="EMP-001"
                />
              </label>
            </div>

            <label className="block text-xs font-bold text-[#516159]">
              Role *
              <select
                name="role"
                required
                defaultValue="driver"
                className="mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm"
              >
                <option value="operations_admin">
                  Operations Admin
                </option>
                <option value="warehouse_staff">
                  Warehouse Staff
                </option>
                <option value="dispatcher">
                  Dispatcher
                </option>
                <option value="driver">
                  Driver
                </option>
                <option value="finance_staff">
                  Finance Staff
                </option>
                <option value="customer_service">
                  Customer Service
                </option>
              </select>
            </label>

            <label className="block text-xs font-bold text-[#516159]">
              Account status
              <select
                name="status"
                defaultValue="active"
                className="mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>

            <div className="rounded-xl border border-[#dce8e2] bg-[#f7fbf9] p-4">
              <div className="flex items-center gap-2">
                <Truck className="size-4 text-[#13734b]" />
                <p className="text-xs font-black text-[#405048]">
                  Driver details
                </p>
              </div>

              <p className="mt-1 text-[11px] text-[#87938d]">
                Complete these fields when Role = Driver.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  name="vehicle_number"
                  className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs"
                  placeholder="Vehicle number"
                />
                <input
                  name="plate_number"
                  className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs"
                  placeholder="Plate number"
                />
                <input
                  name="driving_licence_number"
                  className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs"
                  placeholder="Driving licence"
                />
                <input
                  name="licence_expiry"
                  type="date"
                  className="h-10 rounded-lg border border-[#dbe5e0] bg-white px-3 text-xs"
                />
              </div>
            </div>

            <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] text-sm font-bold text-white">
              <Plus className="size-4" />
              Create Driver / User
            </button>
          </div>
        </form>

        <section className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_8px_30px_rgba(24,51,39,0.045)]">
          <div className="flex items-center justify-between border-b border-[#e8eeeb] px-5 py-4">
            <div>
              <h2 className="font-bold text-[#26372f]">
                Organization users
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Shippers remain managed from the Shippers module.
              </p>
            </div>

            <UsersRound className="size-5 text-[#13734b]" />
          </div>

          {error ? (
            <p className="p-8 text-center text-sm font-semibold text-[#b74646]">
              Users could not be loaded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left">
                <thead className="border-b border-[#e8eeeb] bg-[#f8faf9] text-[11px] uppercase tracking-[0.08em] text-[#77847e]">
                  <tr>
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-5 py-3.5">Role</th>
                    <th className="px-5 py-3.5">Driver / Employee</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">AWB Archive</th>
                    <th className="px-5 py-3.5">Account</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#edf1ef]">
                  {profiles.map((profile) => {
                    const isSuperAdmin =
                      profile.role === "super_admin";

                    const eligible =
                      shipmentDeleteDelegateRoles.includes(
                        profile.role,
                      );

                    const enabled =
                      isSuperAdmin ||
                      (eligible &&
                        profile.can_delete_shipments);

                    const driver =
                      driverMap.get(profile.id);

                    return (
                      <tr key={profile.id} className="text-sm">
                        <td className="px-5 py-4">
                          <p className="font-bold text-[#26372f]">
                            {profile.full_name ||
                              "Unnamed user"}
                          </p>

                          <p className="mt-1 text-xs text-[#87938d]">
                            {profile.email}
                          </p>

                          {profile.phone ? (
                            <p className="mt-1 text-[11px] text-[#9aa39f]">
                              {profile.phone}
                            </p>
                          ) : null}
                          {!isSuperAdmin && profile.role !== "shipper" ? (
                            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                              <Link href={`/users/${profile.id}`} className="text-xs font-bold text-[#13734b] underline-offset-2 hover:underline">Edit details</Link>
                              <form action={setUserStatusAction}>
                                <input type="hidden" name="profile_id" value={profile.id} />
                                <input type="hidden" name="status" value={profile.status === "active" ? "suspended" : "active"} />
                                <button className={`text-xs font-bold underline-offset-2 hover:underline ${profile.status === "active" ? "text-[#a34b4b]" : "text-[#13734b]"}`}>
                                  {profile.status === "active" ? "Block login" : "Allow login"}
                                </button>
                              </form>
                            </div>
                          ) : null}
                        </td>

                        <td className="px-5 py-4 font-semibold text-[#405048]">
                          {roleLabel(profile.role)}
                        </td>

                        <td className="px-5 py-4">
                          {profile.role === "driver" ? (
                            <>
                              <p className="font-semibold text-[#405048]">
                                {driver?.plate_number ||
                                  driver?.vehicle_number ||
                                  "Driver"}
                              </p>

                              <p className="mt-1 text-xs text-[#87938d]">
                                Licence:{" "}
                                {driver?.driving_licence_number ||
                                  "—"}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs text-[#87938d]">
                              {profile.employee_code ||
                                "No employee code"}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                              profile.status === "active"
                                ? "bg-[#e5f3eb] text-[#16724b]"
                                : profile.status ===
                                    "suspended"
                                  ? "bg-[#fff0d8] text-[#976019]"
                                  : "bg-[#f0f1f0] text-[#68766f]"
                            }`}
                          >
                            {profile.status}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="space-y-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                                enabled
                                  ? "bg-[#e5f3eb] text-[#16724b]"
                                  : "bg-[#f8eeee] text-[#a34b4b]"
                              }`}
                            >
                              {enabled ? (
                                <ShieldCheck className="size-3.5" />
                              ) : (
                                <ShieldOff className="size-3.5" />
                              )}

                              {enabled
                                ? "Allowed"
                                : "Not allowed"}
                            </span>

                            {!isSuperAdmin && eligible ? (
                              <form
                                action={
                                  setShipmentDeletePermissionAction
                                }
                              >
                                <input
                                  type="hidden"
                                  name="profile_id"
                                  value={profile.id}
                                />

                                <input
                                  type="hidden"
                                  name="enabled"
                                  value={String(
                                    !profile.can_delete_shipments,
                                  )}
                                />

                                <button className="text-[11px] font-bold text-[#13734b]">
                                  {profile.can_delete_shipments
                                    ? "Remove access"
                                    : "Grant access"}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          {isSuperAdmin ? (
                            <span className="text-xs font-semibold text-[#87938d]">
                              Permanent
                            </span>
                          ) : (
                            <form
                              action={setUserStatusAction}
                              className="flex gap-2"
                            >
                              <input
                                type="hidden"
                                name="profile_id"
                                value={profile.id}
                              />

                              <select
                                name="status"
                                defaultValue={profile.status}
                                className="h-9 rounded-lg border border-[#dbe5e0] bg-white px-2 text-xs font-semibold"
                              >
                                <option value="active">
                                  Active
                                </option>
                                <option value="suspended">
                                  Suspended
                                </option>
                                <option value="inactive">
                                  Inactive
                                </option>
                              </select>

                              <button className="h-9 rounded-lg bg-[#13734b] px-3 text-xs font-bold text-white">
                                Save
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
