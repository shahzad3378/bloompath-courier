import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { FulfillmentBulkUploadForm } from "@/components/fulfillment-bulk-upload-form";
export const metadata = { title: "Bulk Upload Fulfillment Products" };
export default async function BulkUploadProductsPage() {
  await requireProfile(["super_admin", "operations_admin", "warehouse_staff"]);
  return <div className="mx-auto max-w-5xl space-y-5"><Link href="/fulfillment" className="text-sm font-semibold text-[#174ea6]">← Inventory</Link><header><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--portal-blue)]">Fulfillment / Inventory</p><h1 className="mt-1 text-3xl font-black text-[#17231e]">Bulk Upload Products</h1><p className="mt-2 text-sm text-[#65736c]">Add inventory products using Excel or CSV.</p></header><FulfillmentBulkUploadForm kind="products" /></div>;
}
