"use client";

import { useState } from "react";
import { MapPinned } from "lucide-react";
import { createServiceZoneAction } from "@/app/(portal)/service-zones/actions";
import type { ServiceZoneType } from "@/lib/service-zones";

export type ZoneMarket = {
  code: string;
  name: string;
};

const labelClass =
  "text-xs font-bold text-[#53645c]";

export function ServiceZoneForm({
  markets,
}: {
  markets: ZoneMarket[];
}) {
  const [zoneType, setZoneType] =
    useState<ServiceZoneType>(
      "postal_prefix",
    );

  return (
    <form
      action={createServiceZoneAction}
      className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      <label className={labelClass}>
        Country *
        <select
          name="country_code"
          required
          className="bp-input mt-2"
          defaultValue=""
        >
          <option value="" disabled>
            Select market
          </option>

          {markets.map((market) => (
            <option
              key={market.code}
              value={market.code}
            >
              {market.name}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Mapping Type *
        <select
          name="zone_type"
          required
          value={zoneType}
          onChange={(event) =>
            setZoneType(
              event.target
                .value as ServiceZoneType,
            )
          }
          className="bp-input mt-2"
        >
          <option value="postal_prefix">
            Postal / ZIP Prefix
          </option>
          <option value="postal_range">
            Postal / ZIP Range
          </option>
          <option value="city">City</option>
          <option value="district">
            District
          </option>
          <option value="area">
            Area / Zone
          </option>
        </select>
      </label>

      {zoneType === "postal_prefix" ? (
        <label className={labelClass}>
          Postal / ZIP Prefix *
          <input
            name="postal_prefix"
            maxLength={30}
            placeholder="M5V / SW1 / 100"
            className="bp-input mt-2 uppercase"
            required
          />
        </label>
      ) : null}

      {zoneType === "postal_range" ? (
        <>
          <label className={labelClass}>
            Postal From *
            <input
              name="postal_from"
              maxLength={30}
              placeholder="10001"
              className="bp-input mt-2 uppercase"
              required
            />
          </label>

          <label className={labelClass}>
            Postal To *
            <input
              name="postal_to"
              maxLength={30}
              placeholder="10292"
              className="bp-input mt-2 uppercase"
              required
            />
          </label>
        </>
      ) : null}

      {[
        "postal_prefix",
        "postal_range",
        "city",
        "district",
        "area",
      ].includes(zoneType) ? (
        <label className={labelClass}>
          City *
          <input
            name="city"
            maxLength={120}
            placeholder="Dubai / Toronto"
            className="bp-input mt-2"
            required
          />
        </label>
      ) : null}

      {zoneType === "district" ? (
        <label className={labelClass}>
          District *
          <input
            name="district"
            maxLength={120}
            placeholder="Manhattan"
            className="bp-input mt-2"
            required
          />
        </label>
      ) : null}

      {zoneType === "area" ? (
        <label className={labelClass}>
          Area *
          <input
            name="area"
            maxLength={120}
            placeholder="Dubai Marina"
            className="bp-input mt-2"
            required
          />
        </label>
      ) : null}

      <div className="flex items-end">
        <button className="bp-button-primary w-full">
          <MapPinned className="size-4" />
          Add Zone
        </button>
      </div>
    </form>
  );
}
