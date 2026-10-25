import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FulfillmentStockTabs } from "@/components/fulfillment-workflow-tabs";
export const metadata = { title: "Receive Fulfillment Stock" };
export default async function FulfillmentStockPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams; const profile = await requireProfile(["super_admin", "operations_admin", "warehouse_staff"]); const db = await createClient();
  const { data } = await db.from("fulfillment_products").select("id,sku,name,quantity_on_hand,quantity_reserved").eq("organization_id", profile.organization_id!).eq("active", true).order("name").limit(1000);
  return <div className="mx-auto max-w-5xl space-y-5"><header><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--portal-blue)]">Fulfillment / Inventory</p><h1 className="mt-1 text-3xl font-black text-[#17231e]">Receive Stock</h1><p className="mt-2 text-sm text-[#65736c]">Receive one product or upload multiple stock rows from the same workspace.</p></header><FulfillmentStockTabs products={data??[]} defaultTab={params.tab}/></div>;
}
