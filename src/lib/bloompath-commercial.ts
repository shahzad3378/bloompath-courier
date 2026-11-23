export const bloomPathUaeOrganization = "d89203fd-4ae6-460b-a27a-43c703f710b1";
export const areaTiers = ["normal", "far", "remote"] as const;
export type AreaTier = (typeof areaTiers)[number];
export function isAreaTier(value: unknown): value is AreaTier {
  return areaTiers.some(tier => tier === value);
}
type AreaRate = Record<(typeof areaTiers)[number], number>;
export type CommercialAgreement = {
  fulfillment_fee: number;
  fulfillment_checkpoint: "dispatched" | "delivered";
  customer_rates: AreaRate;
  carrier_costs: (AreaRate & { name: string })[];
};

function amount(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) throw new Error("Enter valid non-negative amounts with up to two decimals.");
  return Number(text);
}

export function readCommercialAgreement(form: FormData): CommercialAgreement | null {
  if (form.get("commercial_agreement") !== "true") return null;
  const checkpoint = form.get("fulfillment_checkpoint");
  if (checkpoint !== "dispatched" && checkpoint !== "delivered") throw new Error("Select a fulfillment checkpoint.");
  const names = form.getAll("carrier_name").map((item) => String(item).trim());
  if (names.length > 20 || names.some((name) => !name || name.length > 120) ||
    new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error("Use a different name for each 3PL, up to 20.");
  const normal = form.getAll("carrier_normal"), far = form.getAll("carrier_far"), remote = form.getAll("carrier_remote");
  if ([normal, far, remote].some((rates) => rates.length !== names.length)) throw new Error("Enter all three rates for each 3PL.");
  return {
    fulfillment_fee: amount(form.get("fulfillment_fee")),
    fulfillment_checkpoint: checkpoint,
    customer_rates: {
      normal: amount(form.get("customer_normal")), far: amount(form.get("customer_far")), remote: amount(form.get("customer_remote")),
    },
    carrier_costs: names.map((name, index) => ({
      name, normal: amount(normal[index]), far: amount(far[index]), remote: amount(remote[index]),
    })),
  };
}
