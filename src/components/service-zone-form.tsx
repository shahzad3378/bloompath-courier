"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  MapPinned,
} from "lucide-react";
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
  googleLookupEnabled,
}: {
  markets: ZoneMarket[];
  googleLookupEnabled: boolean;
}) {
  const [zoneType, setZoneType] =
    useState<ServiceZoneType>(
      "postal_prefix",
    );

  const [countryCode, setCountryCode] =
    useState("");
  const [postalPrefix, setPostalPrefix] =
    useState("");
  const [city, setCity] = useState("");
  const [lookup, setLookup] = useState<{
    status:
      | "idle"
      | "checking"
      | "found"
      | "not_found"
      | "error";
    message?: string;
  }>({ status: "idle" });

  useEffect(() => {
    const prefix = postalPrefix.trim();

    if (
      !googleLookupEnabled ||
      zoneType !== "postal_prefix" ||
      !countryCode ||
      prefix.length < 2
    ) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(
      async () => {
        setLookup({ status: "checking" });

        try {
          const response = await fetch(
            "/api/locations/postal-code",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                countryCode,
                postalCode: prefix,
              }),
              signal: controller.signal,
            },
          );

          const result = (await response.json()) as {
            found?: boolean;
            city?: string;
            message?: string;
          };

          if (!response.ok) {
            throw new Error(
              result.message ||
                "City lookup failed.",
            );
          }

          if (!result.found || !result.city) {
            setLookup({
              status: "not_found",
              message:
                result.message ||
                "No city found for this prefix.",
            });
            return;
          }

          setCity(result.city);
          setLookup({
            status: "found",
            message: `City selected: ${result.city}`,
          });
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }

          setLookup({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "City lookup failed.",
          });
        }
      },
      600,
    );

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    countryCode,
    googleLookupEnabled,
    postalPrefix,
    zoneType,
  ]);

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
          value={countryCode}
          onChange={(event) => {
            setCountryCode(event.target.value);
            setPostalPrefix("");
            setCity("");
            setLookup({ status: "idle" });
          }}
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
            {
              setZoneType(
                event.target
                  .value as ServiceZoneType,
              );
              setPostalPrefix("");
              setCity("");
              setLookup({ status: "idle" });
            }
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
            value={postalPrefix}
            onChange={(event) => {
              setPostalPrefix(event.target.value);
              setCity("");
              setLookup({ status: "idle" });
            }}
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
            value={city}
            onChange={(event) =>
              setCity(event.target.value)
            }
            maxLength={120}
            placeholder="Dubai / Toronto"
            className="bp-input mt-2"
            required
          />
        </label>
      ) : null}

      {zoneType === "postal_prefix" ? (
        <div
          aria-live="polite"
          className={`flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold md:col-span-2 xl:col-span-4 ${
            lookup.status === "found"
              ? "border-[#bfe3cf] bg-[#ebf8f1] text-[#176a47]"
              : lookup.status === "checking"
                ? "border-[#dbe5e0] bg-[#f8faf9] text-[#68766f]"
                : "border-[#f0d8ad] bg-[#fff8eb] text-[#8a641f]"
          }`}
        >
          {lookup.status === "checking" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : lookup.status === "found" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}

          {!googleLookupEnabled
            ? "Google city lookup needs GOOGLE_MAPS_API_KEY in Vercel. City can be entered manually until it is connected."
            : lookup.status === "idle"
              ? "Select a country and type the postal prefix; Google will fill City automatically."
              : lookup.status === "checking"
                ? "Finding city from Google…"
                : lookup.message}
        </div>
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
