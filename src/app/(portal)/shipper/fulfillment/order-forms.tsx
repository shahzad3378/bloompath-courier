"use client";

import { useActionState } from "react";
import { bulkCreateShipperFulfillmentOrdersAction, createShipperFulfillmentOrderAction } from "@/app/(portal)/fulfillment/actions";

type Product = { id: string; name: string; sku: string; quantity_on_hand: number; quantity_reserved: number };
const field="bp-input w-full";

function Result({message}:{message:string}){return message?<p aria-live="polite" className={`rounded-lg px-3 py-2 text-xs font-semibold ${message.includes("submitted")||message.includes("successfully")?"bg-blue-50 text-blue-800":"bg-red-50 text-red-700"}`}>{message}</p>:null;}

export function ShipperOrderForm({products}:{products:Product[]}){
 const [message,action,pending]=useActionState(createShipperFulfillmentOrderAction,"");
 const available=products.filter(p=>p.quantity_on_hand>p.quantity_reserved);
 return <form action={action} className="space-y-3">
  <input className={field} name="order_reference" placeholder="Your order reference (optional)" maxLength={120}/>
  <input className={field} name="recipient_name" placeholder="Consignee name" required maxLength={160}/>
  <input className={field} name="recipient_phone" placeholder="Phone number" required maxLength={50}/>
  <textarea className={`${field} min-h-20`} name="delivery_address" placeholder="Delivery address" required maxLength={500}/>
  <div className="grid grid-cols-[1fr_100px] gap-2"><select name="product_id" className={field} required defaultValue=""><option value="" disabled>Select product</option>{available.map(p=><option key={p.id} value={p.id}>{p.name} · {p.quantity_on_hand-p.quantity_reserved} available</option>)}</select><input className={field} name="quantity" type="number" min="1" max="1000" defaultValue="1" required/></div>
  <Result message={message}/><button disabled={pending||!available.length} className="bp-button-primary w-full disabled:opacity-50">{pending?"Submitting…":"Submit fulfillment order"}</button>
 </form>;
}

export function ShipperBulkUploadForm(){
 const [message,action,pending]=useActionState(bulkCreateShipperFulfillmentOrdersAction,"");
 return <form action={action} className="space-y-3"><label className="block text-xs font-bold text-[#526159]">Excel file (.xlsx, up to 200 orders)<input className={`${field} mt-2`} type="file" name="file" accept=".xlsx" required/></label><Result message={message}/><button disabled={pending} className="bp-button-primary w-full disabled:opacity-50">{pending?"Uploading…":"Upload fulfillment orders"}</button></form>;
}
