"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useState,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  PackagePlus,
} from "lucide-react";
import {
  createShipmentAction,
  type CreateShipmentState,
} from "@/app/(portal)/shipments/actions";
import { ShipmentStateField } from "@/components/shipment-state-field";
import { uaeCities } from "@/lib/shipments";
import { calculateInternationalWeights, type InternationalMode } from "@/lib/international-bulk";

const initialState: CreateShipmentState = {
  message: "",
};

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-[#dbe5e0] bg-white px-3.5 text-sm text-[#25352d] outline-none transition placeholder:text-[#a2ada7] focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10";

const textAreaClass =
  "mt-1.5 min-h-24 w-full resize-none rounded-xl border border-[#dbe5e0] bg-white px-3.5 py-3 text-sm text-[#25352d] outline-none transition placeholder:text-[#a2ada7] focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10";

const labelClass =
  "text-xs font-bold text-[#516159]";

type ShipperOption = {
  id: string;
  full_name: string;
  email: string;
};

type MarketOption = {
  code: string;
  name: string;
  location_strategy: string;
  postal_code_label: string;
};

function CityField({
  name,
  countryCode,
  value,
  onChange,
}: {
  name: string;
  countryCode: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  if (countryCode === "AE") {
    const cityOptions =
      value &&
      !uaeCities.some((city) => city === value)
        ? [value, ...uaeCities]
        : uaeCities;

    if (onChange) {
      return (
        <select
          name={name}
          value={value || "Dubai"}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className={inputClass}
          required
        >
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      );
    }

    return (
      <select
        name={name}
        defaultValue="Dubai"
        className={inputClass}
        required
      >
        {uaeCities.map((city) => (
          <option
            key={city}
            value={city}
          >
            {city}
          </option>
        ))}
      </select>
    );
  }

  if (onChange) {
    return (
      <input
        name={name}
        value={value || ""}
        onChange={(event) =>
          onChange(event.target.value)
        }
        maxLength={80}
        className={inputClass}
        placeholder="City"
        required
      />
    );
  }

  return (
    <input
      name={name}
      maxLength={80}
      className={inputClass}
      placeholder="City"
      required
    />
  );
}

function PostalField({
  name,
  market,
  value,
  onChange,
}: {
  name: string;
  market: MarketOption | undefined;
  value?: string;
  onChange?: (value: string) => void;
}) {
  if (!market) {
    return null;
  }

  const required = [
    "postal_code",
    "zip_code",
    "postcode",
  ].includes(
    market.location_strategy,
  );

  return (
    <label className={labelClass}>
      {market.location_strategy === "city_zone"
        ? "Postal / Zone Prefix"
        : market.postal_code_label ||
          "Postal Code"}
      {required ? " *" : ""}

      <input
        name={name}
        value={value}
        onChange={
          onChange
            ? (event) =>
                onChange(event.target.value)
            : undefined
        }
        maxLength={30}
        className={inputClass}
        placeholder={
          market.location_strategy ===
          "zip_code"
            ? "e.g. 10001"
            : market.code === "CA"
              ? "e.g. M5V 3A8"
              : market.code === "GB"
                ? "e.g. SW1A 1AA"
                : market.location_strategy ===
                    "city_zone"
                  ? "Customer postal/zone prefix"
                  : "Postal code"
        }
        required={required}
      />
    </label>
  );
}

export function ShipmentForm({
  shippers,
  requiresShipperSelection,
  markets,
  isInternational,
}: {
  shippers: ShipperOption[];
  requiresShipperSelection: boolean;
  markets: MarketOption[];
  isInternational: boolean;
}) {
  const [state, formAction, pending] =
    useActionState(
      createShipmentAction,
      initialState,
    );

  const defaultCountry = markets[0]?.code || "AE";
  const hasInternationalMarkets = markets.length > 1;
  const initialConsigneeCountry = isInternational
    ? markets.find((market) => market.code !== defaultCountry)?.code || defaultCountry
    : defaultCountry;

  const [senderCountry, setSenderCountry] = useState(defaultCountry);

  const [
    consigneeCountry,
    setConsigneeCountry,
  ] = useState(initialConsigneeCountry);

  const [consigneePostal, setConsigneePostal] =
    useState("");

  const [consigneeCity, setConsigneeCity] =
    useState(
      initialConsigneeCountry === "AE" ? "Dubai" : "",
    );

  const [piecesValue, setPiecesValue] = useState("1");
  const [weightValue, setWeightValue] = useState("1");
  const [transportMode, setTransportMode] = useState<InternationalMode>("air");
  const [dimensions, setDimensions] = useState({ length: "", width: "", height: "" });

  const pieceCount = Number(piecesValue);
  const actualWeight = Number(weightValue);
  const lengthCm = Number(dimensions.length);
  const widthCm = Number(dimensions.width);
  const heightCm = Number(dimensions.height);
  const hasValidInternationalDimensions =
    Number.isInteger(pieceCount) && pieceCount > 0 &&
    Number.isFinite(actualWeight) && actualWeight > 0 &&
    [lengthCm, widthCm, heightCm].every((value) => Number.isFinite(value) && value > 0);
  const internationalWeights = hasValidInternationalDimensions
    ? calculateInternationalWeights(transportMode, lengthCm, widthCm, heightCm, pieceCount, actualWeight)
    : null;

  const [zoneLookup, setZoneLookup] =
    useState<{
      status:
        | "idle"
        | "checking"
        | "matched"
        | "unmatched"
        | "not_configured"
        | "error";
      zoneName?: string;
      city?: string;
    }>({ status: "idle" });

  const senderMarket =
    markets.find(
      (market) =>
        market.code === senderCountry,
    );

  const destinationMarkets = isInternational
    ? markets.filter((market) => market.code !== senderCountry)
    : markets.filter((market) => market.code === senderCountry);

  const consigneeMarket =
    markets.find(
      (market) =>
        market.code ===
        consigneeCountry,
    );

  useEffect(() => {
    const shouldChangeDestination = isInternational
      ? senderCountry === consigneeCountry
      : senderCountry !== consigneeCountry;
    if (!shouldChangeDestination) return;
    const next = isInternational
      ? markets.find((market) => market.code !== senderCountry)?.code || senderCountry
      : senderCountry;
    setConsigneeCountry(next);
    setConsigneeCity(next === "AE" ? "Dubai" : "");
    setConsigneePostal("");
    setZoneLookup({ status: "idle" });
  }, [isInternational, senderCountry, consigneeCountry, markets]);

  useEffect(() => {
    const postal = consigneePostal.trim();

    if (postal.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(
      async () => {
        setZoneLookup({ status: "checking" });

        try {
          const response = await fetch(
            "/api/service-zones/resolve",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                countryCode:
                  consigneeCountry,
                postalCode: postal,
                city: "",
                area: "",
              }),
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            throw new Error("Zone lookup failed");
          }

          const result = (await response.json()) as {
            configured: boolean;
            zone: {
              name: string;
              city: string | null;
            } | null;
          };

          if (!result.configured) {
            setZoneLookup({
              status: "not_configured",
            });
            return;
          }

          if (!result.zone) {
            setZoneLookup({
              status: "unmatched",
            });
            return;
          }

          if (result.zone.city) {
            setConsigneeCity(result.zone.city);
          }

          setZoneLookup({
            status: "matched",
            zoneName: result.zone.name,
            city: result.zone.city || undefined,
          });
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }

          setZoneLookup({ status: "error" });
        }
      },
      450,
    );

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    consigneeCountry,
    consigneePostal,
  ]);

  return (
    <form
      action={formAction}
      className="mx-auto max-w-[1200px]"
    >
      {isInternational ? <input type="hidden" name="is_international" value="1" /> : null}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/shipments" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[#587068]">
            <ArrowLeft className="size-4" /> Back to shipments
          </Link>
          <p className="text-sm font-semibold text-[#188459]">{isInternational ? "International booking" : "Order booking"}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            {isInternational ? "Create international shipment & AWB" : "Create shipment & AWB"}
          </h1>
          <p className="mt-2 text-sm text-[#74827b]">
            {isInternational
              ? "Enter sender, receiver and customs details. Air or sea chargeable weight is calculated from dimensions."
              : "Enter delivery details. Country-specific location validation and service-zone mapping are applied automatically."}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <nav aria-label="Shipment type" className="flex rounded-xl border border-[#dfe7e3] bg-white p-1">
            <Link href="/shipments/new" aria-current={!isInternational ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${!isInternational ? "bg-[#e7f4ed] text-[#13734b]" : "text-[#627069] hover:bg-[#f6f8f7]"}`}>
              Local shipment
            </Link>
            <Link href="/shipments/new?mode=international" aria-current={isInternational ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${isInternational ? "bg-[#e7f4ed] text-[#13734b]" : "text-[#627069] hover:bg-[#f6f8f7]"}`}>
              International shipment
            </Link>
          </nav>
          <button disabled={pending || (isInternational && !hasInternationalMarkets)}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white shadow-lg shadow-[#13734b]/15 disabled:opacity-60">
            <PackagePlus className="size-4" />
            {pending ? "Generating AWB…" : isInternational ? "Generate international AWB" : "Generate AWB"}
          </button>
        </div>
      </div>

      {isInternational && !hasInternationalMarkets ? (
        <p role="status" className="mt-5 rounded-xl border border-[#f0d8ad] bg-[#fff8eb] px-4 py-3 text-sm font-semibold text-[#8a641f]">
          International booking is unavailable because this courier account has only one active country. Ask an administrator to enable a destination country.
        </p>
      ) : null}

      {state.message ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-[#f1cece] bg-[#fff3f3] px-4 py-3 text-sm font-semibold text-[#a63e3e]"
        >
          {state.message}
        </p>
      ) : null}

      {requiresShipperSelection ? (
        <section className="mt-5 rounded-2xl border border-[#cfe2d8] bg-[#f8fcfa] p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">
            Shipper account
          </p>

          <h2 className="mt-1 font-bold text-[#26372f]">
            Select seller for this AWB
          </h2>

          <label
            className={`${labelClass} mt-4 block max-w-xl`}
          >
            Shipper *
            <select
              name="shipper_id"
              required
              defaultValue=""
              className={inputClass}
            >
              <option
                value=""
                disabled
              >
                Select active shipper
              </option>

              {shippers.map(
                (shipper) => (
                  <option
                    key={shipper.id}
                    value={shipper.id}
                  >
                    {shipper.full_name} ·{" "}
                    {shipper.email}
                  </option>
                ),
              )}
            </select>
          </label>
        </section>
      ) : null}

      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
          <div className="border-b border-[#edf1ef] pb-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">
              01 · Pickup
            </p>
            <h2 className="mt-1 font-bold text-[#26372f]">
              Sender details
            </h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Sender name *
              <input
                name="sender_name"
                maxLength={120}
                className={inputClass}
                required
              />
            </label>

            <label className={labelClass}>
              Phone number *
              <input
                name="sender_phone"
                type="tel"
                minLength={7}
                maxLength={20}
                className={inputClass}
                required
              />
            </label>

            <label className={labelClass}>
              Country *
              <select
                name="sender_country_code"
                value={senderCountry}
                onChange={(event) => {
                  const countryCode = event.target.value;
                  setSenderCountry(countryCode);
                  const next = isInternational
                    ? (countryCode === consigneeCountry
                      ? markets.find((market) => market.code !== countryCode)?.code || countryCode
                      : consigneeCountry)
                    : countryCode;
                  setConsigneeCountry(next);
                  if (next !== consigneeCountry) {
                    setConsigneeCity(next === "AE" ? "Dubai" : "");
                    setConsigneePostal("");
                  }
                }}
                className={inputClass}
                required
              >
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
              City *
              <CityField
                name="sender_city"
                countryCode={
                  senderCountry
                }
              />
            </label>

            <ShipmentStateField side="sender" countryCode={senderCountry} />

            <PostalField
              name="sender_postal_code"
              market={senderMarket}
            />

            <label className={labelClass}>
              Reference number
              <input
                name="reference_number"
                maxLength={80}
                className={inputClass}
              />
            </label>

            <label
              className={`${labelClass} sm:col-span-2`}
            >
              Pickup address *
              <textarea
                name="sender_address"
                minLength={5}
                maxLength={500}
                className={textAreaClass}
                required
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
          <div className="border-b border-[#edf1ef] pb-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">
              02 · Delivery
            </p>
            <h2 className="mt-1 font-bold text-[#26372f]">
              Consignee details
            </h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Consignee name *
              <input
                name="consignee_name"
                maxLength={120}
                className={inputClass}
                required
              />
            </label>

            <label className={labelClass}>
              Primary phone *
              <input
                name="consignee_phone"
                type="tel"
                minLength={7}
                maxLength={20}
                className={inputClass}
                required
              />
            </label>

            <label className={labelClass}>
              Alternative phone
              <input
                name="consignee_alt_phone"
                type="tel"
                maxLength={20}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Country *
              <select
                name="consignee_country_code"
                value={consigneeCountry}
                onChange={(event) =>
                  {
                    const countryCode =
                      event.target.value;

                    setConsigneeCountry(
                      countryCode,
                    );
                    setConsigneePostal("");
                    setConsigneeCity(
                      countryCode === "AE"
                        ? "Dubai"
                        : "",
                    );
                    setZoneLookup({
                      status: "idle",
                    });
                  }
                }
                className={inputClass}
                required
              >
                {destinationMarkets.map((market) => (
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
              City *
              <CityField
                name="consignee_city"
                countryCode={
                  consigneeCountry
                }
                value={consigneeCity}
                onChange={setConsigneeCity}
              />
            </label>

            <ShipmentStateField side="consignee" countryCode={consigneeCountry} />

            <PostalField
              name="consignee_postal_code"
              market={consigneeMarket}
              value={consigneePostal}
              onChange={(value) => {
                setConsigneePostal(value);

                if (value.trim().length < 2) {
                  setZoneLookup({
                    status: "idle",
                  });
                }
              }}
            />

            {zoneLookup.status !== "idle" ? (
              <div
                aria-live="polite"
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-3 text-xs font-semibold sm:col-span-2 ${
                  zoneLookup.status === "matched"
                    ? "border-[#bfe3cf] bg-[#ebf8f1] text-[#176a47]"
                    : zoneLookup.status ===
                        "checking"
                      ? "border-[#dbe5e0] bg-[#f8faf9] text-[#68766f]"
                      : "border-[#f0d8ad] bg-[#fff8eb] text-[#8a641f]"
                }`}
              >
                {zoneLookup.status ===
                "checking" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : zoneLookup.status ===
                  "matched" ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <MapPin className="size-4" />
                )}

                {zoneLookup.status === "checking"
                  ? "Checking postal prefix…"
                  : zoneLookup.status ===
                      "matched"
                    ? `Zone matched: ${zoneLookup.zoneName}. City selected: ${zoneLookup.city || consigneeCity}.`
                    : zoneLookup.status ===
                        "not_configured"
                      ? "No service-zone prefixes are configured for this country yet."
                      : zoneLookup.status ===
                          "unmatched"
                        ? "This postal prefix does not match a configured service zone."
                        : "Zone lookup is temporarily unavailable; booking will verify again on submit."}
              </div>
            ) : null}

            <label className={labelClass}>
              Area / District
              <input
                name="consignee_area"
                maxLength={120}
                className={inputClass}
                placeholder="Area, district or neighbourhood"
              />
            </label>

            <label className={labelClass}>
              Landmark
              <input
                name="consignee_landmark"
                maxLength={200}
                className={inputClass}
              />
            </label>

            <label
              className={`${labelClass} sm:col-span-2`}
            >
              Delivery address *
              <textarea
                name="consignee_address"
                minLength={5}
                maxLength={500}
                className={textAreaClass}
                required
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6 xl:col-span-2">
          <div className="border-b border-[#edf1ef] pb-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">
              03 · Parcel
            </p>
            <h2 className="mt-1 font-bold text-[#26372f]">
              Service, package & payment
            </h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className={labelClass}>
              Service *
              <select
                name="service_type"
                defaultValue="next_day"
                className={inputClass}
              >
                <option value="same_day">
                  Same day
                </option>
                <option value="next_day">
                  Next day
                </option>
                <option value="standard">
                  Standard
                </option>
              </select>
            </label>

            <label className={labelClass}>
              Payment *
              <select
                name="payment_type"
                defaultValue="cod"
                className={inputClass}
              >
                <option value="cod">
                  Cash on delivery
                </option>
                <option value="prepaid">
                  Prepaid
                </option>
              </select>
            </label>

            <label className={labelClass}>
              {isInternational ? "Bags / pieces *" : "Pieces *"}
              <input
                name="pieces"
                type="number"
                min="1"
                max="999"
                value={piecesValue}
                onChange={(event) => setPiecesValue(event.target.value)}
                className={inputClass}
                required
              />
            </label>

            <label className={labelClass}>
              {isInternational ? "Total actual weight (kg) *" : "Weight (kg) *"}
              <input
                name="weight_kg"
                type="number"
                min="0.001"
                max="1000"
                step="0.001"
                value={weightValue}
                onChange={(event) => setWeightValue(event.target.value)}
                className={inputClass}
                required
              />
            </label>

            <label className={labelClass}>
              COD amount *
              <input
                name="cod_amount"
                type="number"
                min="0"
                max="9999999999"
                step="0.01"
                defaultValue="0"
                className={inputClass}
                required
              />
            </label>

            <label
              className={`${labelClass} sm:col-span-2 xl:col-span-3`}
            >
              Parcel description *
              <input
                name="parcel_description"
                minLength={2}
                maxLength={500}
                className={inputClass}
                required
              />
            </label>

            <label
              className={`${labelClass} sm:col-span-2 xl:col-span-4`}
            >
              Delivery instructions
              <textarea
                name="delivery_instructions"
                maxLength={500}
                className={textAreaClass}
              />
            </label>
          </div>
        </section>
        {isInternational ? (
          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6 xl:col-span-2">
            <div className="border-b border-[#edf1ef] pb-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#188459]">04 · International</p>
              <h2 className="mt-1 font-bold text-[#26372f]">Transport, dimensions & customs</h2>
              <p className="mt-1 text-sm text-[#74827b]">Enter dimensions per bag and total actual weight. Each bag gets a separate AWB; weight, declared value and COD are split across the bags.</p>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className={labelClass}>Transport mode *
                <select name="transport_mode" value={transportMode} onChange={(event) => setTransportMode(event.target.value === "sea" ? "sea" : "air")} className={inputClass} required>
                  <option value="air">Air</option><option value="sea">Sea</option>
                </select>
              </label>
              {(["length", "width", "height"] as const).map((dimension) => (
                <label key={dimension} className={labelClass}>{dimension[0].toUpperCase() + dimension.slice(1)} per piece (cm) *
                  <input type="number" name={`${dimension}_cm`} min="0.1" max="10000" step="any" value={dimensions[dimension]}
                    onChange={(event) => setDimensions((current) => ({ ...current, [dimension]: event.target.value }))}
                    className={inputClass} required />
                </label>
              ))}
              <label className={labelClass}>Total declared goods value
                <input type="number" name="declared_value" min="0" max="9999999999" step="0.01" defaultValue="0" className={inputClass} />
              </label>
              <label className={labelClass}>HS code (optional)
                <input type="text" name="hs_code" inputMode="numeric" minLength={4} maxLength={10} pattern="[0-9]{4,10}" className={inputClass} />
              </label>
            </div>
            {internationalWeights ? (
              <div aria-live="polite" className="mt-5 grid gap-3 rounded-xl bg-[#f3faf6] p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <p>Actual weight <strong>{actualWeight.toFixed(2)} kg</strong></p>
                <p>Volume <strong>{internationalWeights.volumeCbm.toFixed(4)} CBM</strong></p>
                <p>Volumetric weight <strong>{internationalWeights.volumetricWeightKg.toFixed(2)} kg</strong></p>
                {transportMode === "sea" ? <p>Sea W/M <strong>{internationalWeights.chargeableWm?.toFixed(3)}</strong></p> : null}
                <p className="font-black text-[#13734b]">{transportMode === "air" ? "Air" : "Sea"} chargeable weight <strong>{internationalWeights.chargeableWeightKg.toFixed(2)} kg</strong></p>
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-[#f7f9f8] p-4 text-sm text-[#74827b]">Enter positive dimensions, pieces and actual weight to calculate Air or Sea chargeable weight.</p>
            )}
          </section>
        ) : null}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          disabled={pending || (isInternational && !hasInternationalMarkets)}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-6 text-sm font-bold text-white disabled:opacity-60"
        >
          <PackagePlus className="size-4" />
          {pending
            ? "Generating AWB…"
            : isInternational ? "Generate international AWB" : "Generate AWB"}
        </button>
      </div>
    </form>
  );
}
