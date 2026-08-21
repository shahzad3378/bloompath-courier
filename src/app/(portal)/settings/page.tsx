import {
  Building2,
  FileText,
  PackageCheck,
  WalletCards,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings-form";
import { LogoUploadForm } from "@/components/logo-upload-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await requireProfile([
    "super_admin",
    "operations_admin",
    "warehouse_staff",
    "dispatcher",
    "finance_staff",
    "customer_service",
  ]);

  const supabase = await createClient();
  const [{ data: organization }, { data: settings }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug").eq("id", profile.organization_id).maybeSingle(),
    supabase.from("organization_settings").select("*").eq("organization_id", profile.organization_id).maybeSingle(),
  ]);

  const canEdit = profile.role === "super_admin";

  return (
    <div className="mx-auto max-w-[1300px]">
      <div>
        <p className="text-sm font-semibold text-[#188459]">Organization control</p>
        <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#74827b]">Manage company identity, AWB defaults, printing and operational preferences.</p>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Company", organization?.name ?? "Organization", Building2],
          ["AWB Prefix", settings?.awb_prefix ?? "BP", PackageCheck],
          ["Print Default", settings?.default_print_format?.toUpperCase() ?? "4X6", FileText],
          ["COD Cycle", `${settings?.default_cod_cycle_days ?? 7} days`, WalletCards],
        ].map(([label, value, Icon]) => {
          const CardIcon = Icon as typeof Building2;
          return (
            <div key={String(label)} className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
              <CardIcon className="size-5 text-[#13734b]" />
              <p className="mt-4 text-xl font-black text-[#26372f]">{String(value)}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">{String(label)}</p>
            </div>
          );
        })}
      </div>

      {!canEdit ? (
        <div className="mt-6 rounded-xl border border-[#d8e6df] bg-[#f8fbf9] px-4 py-3 text-sm font-semibold text-[#587068]">
          Settings are read-only for your role. Super Admin access is required to make changes.
        </div>
      ) : null}

      <div className="mt-6">
        <LogoUploadForm logoUrl={settings?.logo_url ?? null} canEdit={canEdit} />
      </div>

      <div className="mt-6">
        <SettingsForm
          canEdit={canEdit}
          organizationName={organization?.name ?? ""}
          organizationSlug={organization?.slug ?? ""}
          settings={settings}
        />
      </div>
    </div>
  );
}
