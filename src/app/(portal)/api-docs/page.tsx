import { Braces, KeyRound, Radio, ShieldCheck } from "lucide-react";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Customer / Seller API" };

const roles = ["super_admin", "operations_admin", "dispatcher", "finance_staff", "customer_service"] as const;

const endpoints = [
  ["POST", "/api/v1/shipments", "Create one shipment and return courier AWB."],
  ["POST", "/api/v1/shipments/bulk", "Create multiple shipments in one request."],
  ["GET", "/api/v1/shipments/{awb}", "Track one shipment by courier AWB."],
  ["PATCH", "/api/v1/shipments/{awb}", "Update an eligible shipment before operational lock."],
  ["POST", "/api/v1/shipments/{awb}/cancel", "Cancel an eligible shipment."],
  ["GET", "/api/v1/zones", "Read service-zone references available to the account."],
  ["GET", "/api/v1/manifests/{id}", "Read pickup-manifest status and AWBs."],
];

export default async function ApiDocsPage() {
  await requireProfile(roles);
  return <div className="mx-auto max-w-[1200px] space-y-6">
    <header><p className="text-sm font-semibold text-[#188459]">Developer API</p><h1 className="mt-1 text-3xl font-black text-[#17231e]">Customer / Seller API v1</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#74827b]">Integration contract for seller portals, ecommerce websites, ERPs, marketplaces and customer systems connecting into this courier tenant.</p></header>

    <section className="grid gap-4 md:grid-cols-3">
      {[[KeyRound,"Authentication","Bearer API key per customer/account."],[ShieldCheck,"Tenant isolation","Every request is scoped to the issuing courier company and account."],[Radio,"Webhooks","Status changes can be pushed to registered endpoints."]].map(([Icon,title,text]) => <div key={String(title)} className="rounded-2xl border border-[#e0e8e4] bg-white p-5"><Icon className="size-5 text-[#13734b]" /><h2 className="mt-3 font-bold text-[#26372f]">{String(title)}</h2><p className="mt-2 text-xs leading-5 text-[#7c8982]">{String(text)}</p></div>)}
    </section>

    <section className="rounded-2xl border border-[#e0e8e4] bg-white p-6"><div className="flex items-center gap-3"><Braces className="size-5 text-[#13734b]" /><h2 className="text-lg font-black text-[#26372f]">API contract</h2></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-[#e8eeeb] text-[11px] uppercase tracking-wide text-[#7d8a84]"><tr><th className="py-3">Method</th><th className="py-3">Endpoint</th><th className="py-3">Purpose</th></tr></thead><tbody className="divide-y divide-[#edf1ef]">{endpoints.map(([method,path,purpose]) => <tr key={path}><td className="py-3 font-black text-[#13734b]">{method}</td><td className="py-3 font-mono text-xs text-[#34453c]">{path}</td><td className="py-3 text-[#607068]">{purpose}</td></tr>)}</tbody></table></div></section>

    <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-[#e0e8e4] bg-white p-6"><h2 className="font-black text-[#26372f]">Authentication</h2><pre className="mt-4 overflow-x-auto rounded-xl bg-[#15231c] p-4 text-xs leading-6 text-white">{`Authorization: Bearer YOUR_API_KEY\nContent-Type: application/json\nIdempotency-Key: your-unique-order-key`}</pre><p className="mt-3 text-xs leading-5 text-[#7a8881]">API keys must be stored server-side. A customer key must never give access to another shipper or tenant.</p></div><div className="rounded-2xl border border-[#e0e8e4] bg-white p-6"><h2 className="font-black text-[#26372f]">Create shipment example</h2><pre className="mt-4 overflow-x-auto rounded-xl bg-[#15231c] p-4 text-xs leading-6 text-white">{`{\n  "reference_number": "ORDER-1001",\n  "service_type": "standard",\n  "payment_type": "cod",\n  "consignee_name": "Jane Customer",\n  "consignee_phone": "+14165550123",\n  "consignee_address": "1 Cardiff Rd",\n  "consignee_city": "Toronto",\n  "consignee_state_province": "ON",\n  "consignee_postal_code": "M4P 0G2",\n  "consignee_country_code": "CA",\n  "pieces": 1,\n  "weight_kg": 1.0,\n  "cod_amount": 49.99\n}`}</pre></div></section>

    <section className="rounded-2xl border border-[#cfe2d8] bg-[#f7fbf9] p-6"><h2 className="font-black text-[#26372f]">Webhook events</h2><p className="mt-2 text-sm text-[#6f7e77]">Recommended events: <span className="font-mono text-xs">shipment.booked</span>, <span className="font-mono text-xs">shipment.picked_up</span>, <span className="font-mono text-xs">shipment.at_warehouse</span>, <span className="font-mono text-xs">shipment.out_for_delivery</span>, <span className="font-mono text-xs">shipment.delivered</span>, <span className="font-mono text-xs">shipment.undelivered</span>, <span className="font-mono text-xs">shipment.returned</span>. Webhook signatures should use an account-specific secret.</p></section>

    <p className="text-xs text-[#8a9690]">This page defines the tenant-facing v1 integration contract. API-key issuance, public endpoint handlers and webhook delivery must remain versioned against this contract.</p>
  </div>;
}
