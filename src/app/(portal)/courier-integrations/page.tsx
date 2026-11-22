import { requireProfile } from "@/lib/auth";
import { tenantCarrierOptions } from "@/lib/carrier-tenant";
import GtaPage from "./gta-airskip/page";
import BroadReachPage from "./broadreach/page";
export const metadata = { title: "Carrier desk" };
export default async function CourierIntegrationsPage({ searchParams }: { searchParams: Promise<{ carrier?: string; tab?: string; awb?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile(["super_admin", "operations_admin", "dispatcher"]);
  const carriers = tenantCarrierOptions(profile.organization_id);
  if (!carriers.length) return <section className="bp-panel p-6"><h1 className="text-xl font-bold">Courier partners</h1><p className="mt-2 text-sm">No courier partner API is configured for this company.</p></section>;
  const carrier = carriers.find((option) => option === params.carrier) ?? carriers[0];
  return carrier === "broadreach" ? <BroadReachPage searchParams={Promise.resolve(params)} /> : <GtaPage searchParams={Promise.resolve(params)} />;
}
