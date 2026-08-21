import {
  Globe2,
  MapPinned,
  Power,
  Trash2,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ServiceZoneForm,
  type ZoneMarket,
} from "@/components/service-zone-form";
import {
  deleteServiceZoneAction,
  toggleServiceZoneAction,
} from "./actions";

export const metadata = {
  title: "Service Zones",
};

const zoneRoles = [
  "super_admin",
  "operations_admin",
] as const;

type ZoneRow = {
  id: number;
  country_code: string;
  name: string;
  zone_type: string;
  postal_prefix: string | null;
  postal_from: string | null;
  postal_to: string | null;
  city: string | null;
  district: string | null;
  area: string | null;
  is_active: boolean;
};

type OrganizationCountryRow = {
  country_code: string;
  countries:
    | { name: string }
    | Array<{ name: string }>
    | null;
};

function zoneRule(row: ZoneRow) {
  if (
    row.zone_type === "postal_prefix"
  ) {
    return `Prefix ${row.postal_prefix || "—"} → ${row.city || "—"}`;
  }

  if (
    row.zone_type === "postal_range"
  ) {
    return `${row.postal_from || "—"}–${row.postal_to || "—"} → ${row.city || "—"}`;
  }

  if (row.zone_type === "city") {
    return `City: ${row.city || "—"}`;
  }

  if (row.zone_type === "district") {
    return `District: ${row.district || "—"}`;
  }

  if (row.zone_type === "area") {
    return `Area: ${row.area || "—"}`;
  }

  return row.city || "—";
}

export default async function ServiceZonesPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
}) {
  const profile =
    await requireProfile(zoneRoles);

  const params = await searchParams;
  const supabase = await createClient();

  const [
    { data: organizationCountries },
    { data: zones },
  ] = await Promise.all([
    supabase
      .from("organization_countries")
      .select(`
        country_code,
        is_primary,
        countries!inner(
          code,
          name,
          location_strategy,
          postal_code_label
        )
      `)
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq("is_active", true),

    supabase
      .from("service_zones")
      .select(`
        id,
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
        created_at
      `)
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .order("country_code")
      .order("name"),
  ]);

  const markets: ZoneMarket[] = (
    (organizationCountries ?? []) as OrganizationCountryRow[]
  ).map((row) => {
    const country = Array.isArray(
      row.countries,
    )
      ? row.countries[0]
      : row.countries;

    return {
      code: row.country_code,
      name: country?.name || row.country_code,
    };
  });

  const zoneRows = (zones ?? []) as ZoneRow[];

  return (
    <div className="bp-page">
      <div>
        <p className="bp-section-label">
          Network Configuration
        </p>

        <h1 className="bp-heading mt-1 text-3xl font-black">
          Service Zones
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-[#74827b]">
          Configure automatic delivery-location mapping
          for each operating market.
        </p>
      </div>

      {params.created === "1" ? (
        <div className="mt-5 rounded-xl border border-[#bfe3cf] bg-[#ebf8f1] px-4 py-3 text-sm font-semibold text-[#176a47]">
          Service zone created successfully.
        </div>
      ) : null}

      {params.error ? (
        <div className="mt-5 rounded-xl border border-[#efc7c7] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#a13f3f]">
          Service zone could not be saved. Check
          the market and mapping values.
        </div>
      ) : null}

      <section className="bp-panel mt-6 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#edf8f2] text-[#13734b]">
            <MapPinned className="size-5" />
          </span>

          <div>
            <h2 className="font-black text-[#26372f]">
              Add Service Zone
            </h2>

            <p className="mt-1 text-xs text-[#87938d]">
              Add postal, ZIP, postcode or
              city/area routing rules.
            </p>
          </div>
        </div>

        <ServiceZoneForm markets={markets} />
      </section>

      <section className="bp-panel mt-6 overflow-hidden">
        <div className="bp-panel-header flex items-center justify-between">
          <div>
            <h2 className="font-black text-[#26372f]">
              Configured Zones
            </h2>

            <p className="mt-1 text-xs text-[#87938d]">
              {zoneRows.length} automatic location
              mapping rule
              {zoneRows.length === 1 ? "" : "s"}.
            </p>
          </div>

          <Globe2 className="size-5 text-[#13734b]" />
        </div>

        {zoneRows.length === 0 ? (
          <div className="p-10 text-center">
            <MapPinned className="mx-auto size-9 text-[#a5b0aa]" />

            <p className="mt-4 text-sm font-bold text-[#53645c]">
              No service zones configured
            </p>

            <p className="mt-1 text-xs text-[#87938d]">
              Bookings currently continue without
              mandatory zone matching.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-5 py-3">
                    Market
                  </th>
                  <th className="px-5 py-3">
                    Zone
                  </th>
                  <th className="px-5 py-3">
                    Type
                  </th>
                  <th className="px-5 py-3">
                    Mapping
                  </th>
                  <th className="px-5 py-3">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {zoneRows.map((row) => (
                  <tr
                    key={row.id}
                    className="bp-table-row"
                  >
                    <td className="px-5 py-4 font-mono text-xs font-black text-[#13734b]">
                      {row.country_code}
                    </td>

                    <td className="px-5 py-4 font-bold text-[#34453c]">
                      {row.name}
                    </td>

                    <td className="px-5 py-4 text-xs font-semibold capitalize text-[#68766f]">
                      {row.zone_type.replaceAll(
                        "_",
                        " ",
                      )}
                    </td>

                    <td className="px-5 py-4 text-xs text-[#68766f]">
                      {zoneRule(row)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                          row.is_active
                            ? "bg-[#e8f7ef] text-[#13734b]"
                            : "bg-[#f1f3f2] text-[#87938d]"
                        }`}
                      >
                        {row.is_active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
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
                            name="active"
                            value={
                              row.is_active
                                ? "false"
                                : "true"
                            }
                          />

                          <button
                            title={
                              row.is_active
                                ? "Disable"
                                : "Enable"
                            }
                            className="inline-grid size-9 place-items-center rounded-lg border border-[#dbe5e0] text-[#53645c]"
                          >
                            <Power className="size-4" />
                          </button>
                        </form>

                        <form
                          action={
                            deleteServiceZoneAction
                          }
                        >
                          <input
                            type="hidden"
                            name="zone_id"
                            value={row.id}
                          />

                          <button
                            title="Delete zone"
                            className="inline-grid size-9 place-items-center rounded-lg border border-[#edd1d1] text-[#a13f3f]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
