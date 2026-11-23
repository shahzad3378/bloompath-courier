export function tenantCarrierOptions(organizationId: string | null) {
  if (!organizationId) return [];
  const options: Array<"gta-airskip" | "broadreach"> = [];
  if (organizationId === process.env.GTA_AIRSKIP_ORGANIZATION_ID) options.push("gta-airskip");
  if (organizationId === process.env.BROADREACH_ORGANIZATION_ID) options.push("broadreach");
  return options;
}
