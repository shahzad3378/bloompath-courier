import GtaPage from "./gta-airskip/page";
import BroadReachPage from "./broadreach/page";
export const metadata = { title: "Carrier desk" };
export default async function CourierIntegrationsPage({ searchParams }: { searchParams: Promise<{ carrier?: string; tab?: string; awb?: string }> }) {
  const params = await searchParams;
  return params.carrier === "broadreach" ? <BroadReachPage searchParams={Promise.resolve(params)} /> : <GtaPage searchParams={Promise.resolve(params)} />;
}
