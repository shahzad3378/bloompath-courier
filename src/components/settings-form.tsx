"use client";

import { useActionState } from "react";
import {
  Building2,
  FileText,
  LoaderCircle,
  PackageCheck,
  Save,
  Settings2,
  WalletCards,
} from "lucide-react";
import {
  initialState,
  saveOrganizationSettingsAction,
} from "@/app/(portal)/settings/actions";

type SettingsData = {
  legal_name?: string | null;
  display_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  trn?: string | null;
  awb_brand_name?: string | null;
  awb_prefix?: string | null;
  default_print_format?: string | null;
  default_print_copies?: number | null;
  default_service_type?: string | null;
  standard_delivery_attempts?: number | null;
  fourth_attempt_allowed?: boolean | null;
  currency?: string | null;
  default_cod_cycle_days?: number | null;
} | null;

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3.5 text-sm text-[#25352d] outline-none transition disabled:bg-[#f5f7f6] disabled:text-[#87938d] focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10";

const textAreaClass =
  "mt-1.5 min-h-24 w-full resize-y rounded-xl border border-[#dbe5e0] bg-white px-3.5 py-3 text-sm text-[#25352d] outline-none transition disabled:bg-[#f5f7f6] disabled:text-[#87938d] focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10";

const labelClass = "text-xs font-bold text-[#516159]";

export function SettingsForm({
  canEdit,
  organizationName,
  organizationSlug,
  settings,
}: {
  canEdit: boolean;
  organizationName: string;
  organizationSlug: string;
  settings: SettingsData;
}) {
  const [state, formAction, pending] = useActionState(
    saveOrganizationSettingsAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            state.status === "success"
              ? "border-[#bfe3cf] bg-[#ebf8f1] text-[#176a47]"
              : "border-[#f1cece] bg-[#fff3f3] text-[#a63e3e]"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3 border-b border-[#edf1ef] pb-4">
          <span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
            <Building2 className="size-5" />
          </span>

          <div>
            <h2 className="font-bold text-[#26372f]">
              Company profile
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Legal and customer-facing company information.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Organization name
            <input
              value={organizationName}
              readOnly
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            System slug
            <input
              value={organizationSlug}
              readOnly
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Legal company name
            <input
              name="legal_name"
              defaultValue={settings?.legal_name ?? ""}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Display name
            <input
              name="display_name"
              defaultValue={
                settings?.display_name ?? organizationName
              }
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Contact email
            <input
              name="contact_email"
              type="email"
              defaultValue={settings?.contact_email ?? ""}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Contact phone
            <input
              name="contact_phone"
              defaultValue={settings?.contact_phone ?? ""}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Website
            <input
              name="website"
              defaultValue={settings?.website ?? ""}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            TRN
            <input
              name="trn"
              defaultValue={settings?.trn ?? ""}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            City
            <input
              name="city"
              defaultValue={settings?.city ?? ""}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className={`${labelClass} sm:col-span-2`}>
            Address
            <textarea
              name="address"
              defaultValue={settings?.address ?? ""}
              disabled={!canEdit}
              className={textAreaClass}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3 border-b border-[#edf1ef] pb-4">
          <span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
            <PackageCheck className="size-5" />
          </span>

          <div>
            <h2 className="font-bold text-[#26372f]">
              AWB & branding
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Default label identity and tracking prefix.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            AWB display name
            <input
              name="awb_brand_name"
              defaultValue={
                settings?.awb_brand_name ?? organizationName
              }
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            AWB prefix
            <input
              name="awb_prefix"
              defaultValue={settings?.awb_prefix ?? "BP"}
              disabled={!canEdit}
              maxLength={6}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3 border-b border-[#edf1ef] pb-4">
            <FileText className="size-5 text-[#13734b]" />
            <div>
              <h2 className="font-bold text-[#26372f]">
                Print defaults
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Default AWB print format and copies.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Default format
              <select
                name="default_print_format"
                defaultValue={
                  settings?.default_print_format ?? "4x6"
                }
                disabled={!canEdit}
                className={inputClass}
              >
                <option value="4x6">4×6 Label</option>
                <option value="a4">A4</option>
              </select>
            </label>

            <label className={labelClass}>
              Default copies
              <input
                name="default_print_copies"
                type="number"
                min="1"
                max="10"
                defaultValue={
                  settings?.default_print_copies ?? 1
                }
                disabled={!canEdit}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3 border-b border-[#edf1ef] pb-4">
            <Settings2 className="size-5 text-[#13734b]" />
            <div>
              <h2 className="font-bold text-[#26372f]">
                Operations
              </h2>
              <p className="mt-1 text-xs text-[#87938d]">
                Default service and delivery attempt policy.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Default service
              <select
                name="default_service_type"
                defaultValue={
                  settings?.default_service_type ?? "next_day"
                }
                disabled={!canEdit}
                className={inputClass}
              >
                <option value="same_day">Same day</option>
                <option value="next_day">Next day</option>
                <option value="standard">Standard</option>
              </select>
            </label>

            <label className={labelClass}>
              Standard attempts
              <select
                name="standard_delivery_attempts"
                defaultValue={String(
                  settings?.standard_delivery_attempts ?? 3,
                )}
                disabled={!canEdit}
                className={inputClass}
              >
                <option value="1">1 attempt</option>
                <option value="2">2 attempts</option>
                <option value="3">3 attempts</option>
              </select>
            </label>

            <label className={`${labelClass} sm:col-span-2`}>
              4th attempt policy
              <select
                name="fourth_attempt_allowed"
                defaultValue={
                  settings?.fourth_attempt_allowed === false
                    ? "false"
                    : "true"
                }
                disabled={!canEdit}
                className={inputClass}
              >
                <option value="true">
                  Seller authorization allowed
                </option>
                <option value="false">
                  4th attempt disabled
                </option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3 border-b border-[#edf1ef] pb-4">
          <WalletCards className="size-5 text-[#13734b]" />

          <div>
            <h2 className="font-bold text-[#26372f]">
              Finance defaults
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Organization-level finance defaults. Shipper rates remain
              configured per shipper.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Currency
            <input
              value={settings?.currency ?? "AED"}
              readOnly
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Default COD cycle
            <input
              name="default_cod_cycle_days"
              type="number"
              min="1"
              max="90"
              defaultValue={
                settings?.default_cod_cycle_days ?? 7
              }
              disabled={!canEdit}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      {canEdit ? (
        <div className="flex justify-end">
          <button
            disabled={pending}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#13734b] px-6 text-sm font-bold text-white shadow-lg shadow-[#13734b]/15 disabled:opacity-60"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}

            {pending ? "Saving…" : "Save settings"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
