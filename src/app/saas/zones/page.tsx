import {
  CheckCircle2,
  MapPinned,
  Power,
  Route,
} from "lucide-react";
import { requirePlatformAdmin } from "@/lib/saas-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createServiceZoneAction,
  toggleServiceZoneAction,
} from "./actions";

export const metadata = {
  title: "Service Zones",
};

function zoneDetail(row: any) {
  if (row.zone_type === "postal_prefix") {
    return row.postal_prefix || "—";
  }

  if (row.zone_type === "postal_range") {
    return `${row.postal_from || "—"} → ${
      row.postal_to || "—"
    }`;
  }

  return [
    row.city,
    row.district,
    row.area,
  ]
    .filter(Boolean)
    .join(" · ") || "Custom mapping";
}

export default async function ServiceZonesPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    updated?: string;
    error?: string;
  }>;
}) {
  await requirePlatformAdmin();

  const notices = await searchParams;

  const admin = createAdminClient();
  const db = admin as any;

  const [
    { data: organizations },
    { data: countryMappings },
    { data: zones },
  ] = await Promise.all([
    db
      .from("organizations")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name"),

    db
      .from("organization_countries")
      .select(`
        organization_id,
        country_code,
        is_primary,
        countries(
          name,
          location_strategy,
          postal_code_label
        )
      `)
      .eq("is_active", true),

    db
      .from("service_zones")
      .select(`
        id,
        organization_id,
        country_code,
        name,
        zone_type,
        postal_prefix,
        postal_from,
        postal_to,
        city,
        district,
        area,
        is_active,
        created_at,
        organizations(
          name
        ),
        countries(
          name,
          location_strategy
        )
      `)
      .order("created_at", {
        ascending: false,
      }),
  ]);

  const organizationRows =
    organizations ?? [];

  const mappings =
    countryMappings ?? [];

  const zoneRows =
    zones ?? [];

  return (
    <div className="bp-page">
      <div>
        <p className="bp-section-label">
          SaaS Management
        </p>

        <h1 className="bp-heading mt-1 text-3xl font-black">
          Service Zones
        </h1>

        <p className="mt-2 max-w-3xl text-sm text-[#74827b]">
          Configure ZIP, postal-code, postcode,
          city, district and area coverage for each
          courier company and market.
        </p>
      </div>

      {notices.created === "1" ||
      notices.updated === "1" ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          <CheckCircle2 className="size-5" />
          Service zone saved successfully.
        </div>
      ) : null}

      {notices.error ? (
        <div className="mt-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          Service zone could not be saved. Confirm
          the company, country and mapping values.
        </div>
      ) : null}

      <section className="mt-6 grid gap-5 xl:grid-cols-[390px_1fr]">
        <form
          action={createServiceZoneAction}
          className="bp-panel h-fit p-5"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]">
              <MapPinned className="size-5" />
            </span>

            <div>
              <h2 className="font-black text-[#26372f]">
                Add Service Zone
              </h2>

              <p className="mt-1 text-xs text-[#87938d]">
                Country-specific delivery mapping.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-xs font-bold text-[#53645c]">
              Courier Company *
              <select
                name="organization_id"
                required
                className="bp-input mt-2 bg-white"
              >
                <option value="">
                  Select company
                </option>

                {organizationRows.map(
                  (organization: any) => (
                    <option
                      key={organization.id}
                      value={organization.id}
                    >
                      {organization.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="block text-xs font-bold text-[#53645c]">
              Operating Country *
              <select
                name="country_code"
                required
                className="bp-input mt-2 bg-white"
              >
                <option value="">
                  Select country
                </option>

                {mappings.map(
                  (mapping: any) => {
                    const country = Array.isArray(
                      mapping.countries,
                    )
                      ? mapping.countries[0]
                      : mapping.countries;

                    const organization =
                      organizationRows.find(
                        (row: any) =>
                          row.id ===
                          mapping.organization_id,
                      );

                    return (
                      <option
                        key={`${mapping.organization_id}-${mapping.country_code}`}
                        value={mapping.country_code}
                      >
                        {country?.name ||
                          mapping.country_code}
                        {" · "}
                        {organization?.name ||
                          "Tenant"}
                        {mapping.is_primary
                          ? " · Primary"
                          : ""}
                      </option>
                    );
                  },
                )}
              </select>

              <p className="mt-1 text-[10px] text-[#87938d]">
                The selected country must belong to
                the selected company.
              </p>
            </label>

            <label className="block text-xs font-bold text-[#53645c]">
              Zone Name *
              <input
                name="name"
                required
                placeholder="e.g. Downtown Toronto"
                className="bp-input mt-2"
              />
            </label>

            <label className="block text-xs font-bold text-[#53645c]">
              Mapping Type *
              <select
                name="zone_type"
                required
                defaultValue="postal_prefix"
                className="bp-input mt-2 bg-white"
              >
                <option value="postal_prefix">
                  Postal / ZIP Prefix
                </option>

                <option value="postal_range">
                  Postal / ZIP Range
                </option>

                <option value="city">
                  City
                </option>

                <option value="district">
                  District
                </option>

                <option value="area">
                  Area / Zone
                </option>

                <option value="custom">
                  Custom Location
                </option>
              </select>
            </label>

            <div className="rounded-xl border border-[#e5ebe8] bg-[#fafcfb] p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#87938d]">
                Postal / ZIP Mapping
              </p>

              <div className="mt-3 space-y-3">
                <input
                  name="postal_prefix"
                  placeholder="Prefix e.g. M5V, SW1, 100"
                  className="bp-input uppercase"
                />

                <div className="grid grid-cols-2 gap-2">
                  <input
                    name="postal_from"
                    placeholder="From"
                    className="bp-input uppercase"
                  />

                  <input
                    name="postal_to"
                    placeholder="To"
                    className="bp-input uppercase"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#e5ebe8] bg-[#fafcfb] p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#87938d]">
                City / Area Mapping
              </p>

              <div className="mt-3 space-y-3">
                <input
                  name="city"
                  placeholder="City"
                  className="bp-input"
                />

                <input
                  name="district"
                  placeholder="District"
                  className="bp-input"
                />

                <input
                  name="area"
                  placeholder="Area / Zone"
                  className="bp-input"
                />
              </div>
            </div>

            <button
              type="submit"
              className="bp-button-primary w-full"
            >
              <MapPinned className="size-4" />
              Save Service Zone
            </button>
          </div>
        </form>

        <section className="bp-panel overflow-hidden">
          <div className="bp-panel-header flex items-center justify-between">
            <div>
              <h2 className="font-black text-[#26372f]">
                Coverage Mapping
              </h2>

              <p className="mt-1 text-xs text-[#87938d]">
                {zoneRows.length} configured service
                zone{zoneRows.length === 1 ? "" : "s"}.
              </p>
            </div>

            <Route className="size-5 text-[#13734b]" />
          </div>

          {zoneRows.length === 0 ? (
            <div className="p-10 text-center">
              <MapPinned className="mx-auto size-9 text-[#a4b0aa]" />

              <p className="mt-4 text-sm font-bold text-[#53645c]">
                No service zones yet
              </p>

              <p className="mt-1 text-xs text-[#87938d]">
                Add the first postal, ZIP or city
                coverage zone.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                  <tr>
                    <th className="px-4 py-3">
                      Company
                    </th>

                    <th className="px-4 py-3">
                      Country
                    </th>

                    <th className="px-4 py-3">
                      Zone
                    </th>

                    <th className="px-4 py-3">
                      Type
                    </th>

                    <th className="px-4 py-3">
                      Mapping
                    </th>

                    <th className="px-4 py-3">
                      Status
                    </th>

                    <th className="px-4 py-3">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#edf1ef]">
                  {zoneRows.map((row: any) => {
                    const organization =
                      Array.isArray(
                        row.organizations,
                      )
                        ? row.organizations[0]
                        : row.organizations;

                    const country =
                      Array.isArray(row.countries)
                        ? row.countries[0]
                        : row.countries;

                    return (
                      <tr
                        key={row.id}
                        className="bp-table-row"
                      >
                        <td className="px-4 py-4 font-bold text-[#34453c]">
                          {organization?.name ||
                            "Courier Company"}
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-semibold">
                            {country?.name ||
                              row.country_code}
                          </p>

                          <p className="mt-1 text-[10px] uppercase text-[#87938d]">
                            {row.country_code}
                          </p>
                        </td>

                        <td className="px-4 py-4 font-bold text-[#34453c]">
                          {row.name}
                        </td>

                        <td className="px-4 py-4">
                          <span className="rounded-full bg-[#edf3ff] px-2.5 py-1 text-[10px] font-black uppercase text-[#46639b]">
                            {row.zone_type.replaceAll(
                              "_",
                              " ",
                            )}
                          </span>
                        </td>

                        <td className="px-4 py-4 font-mono text-xs">
                          {zoneDetail(row)}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                              row.is_active
                                ? "bg-[#e8f7ef] text-[#13734b]"
                                : "bg-[#f1f3f2] text-[#7c8882]"
                            }`}
                          >
                            {row.is_active
                              ? "Active"
                              : "Disabled"}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <form
                            action={
                              toggleServiceZoneAction
                            }
                          >
                            <input
                              type="hidden"
                              name="zone_id"
                              value={row.id}
                            />

                            <input
                              type="hidden"
                              name="next_active"
                              value={
                                row.is_active
                                  ? "false"
                                  : "true"
                              }
                            />

                            <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#dce5e0] bg-white px-3 text-xs font-bold text-[#53645c]">
                              <Power className="size-3.5" />

                              {row.is_active
                                ? "Disable"
                                : "Enable"}
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ["United States", "ZIP / ZIP ranges"],
          ["Canada", "Postal prefix / FSA"],
          ["United Kingdom", "Postcode mapping"],
          ["UAE / GCC", "City / District / Area"],
        ].map(([market, strategy]) => (
          <div
            key={market}
            className="bp-card p-4"
          >
            <p className="text-xs font-black text-[#34453c]">
              {market}
            </p>

            <p className="mt-1 text-[10px] text-[#87938d]">
              {strategy}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
