export function ShipmentStateField({ side, countryCode, defaultValue }: {
  side: "sender" | "consignee";
  countryCode: string;
  defaultValue?: string | null;
}) {
  const required = countryCode === "CA" || countryCode === "US";
  return <label className="text-xs font-bold text-[#516159]">
    State / Province{required ? " *" : ""}
    <input key={countryCode} name={`${side}_state_province`} defaultValue={defaultValue || ""}
      required={required} maxLength={120} autoComplete="address-level1"
      className="bp-input mt-1.5 w-full" />
  </label>;
}
