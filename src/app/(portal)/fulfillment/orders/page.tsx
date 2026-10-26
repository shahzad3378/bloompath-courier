import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ShipperOrderTabs, type Product } from "@/app/(portal)/shipper/fulfillment/order-forms";
import { FulfillmentOrdersTable, type FulfillmentOrderRow } from "@/components/fulfillment-orders-table";
import type { FulfillmentAwbCountry } from "@/components/fulfillment-awb-form";

export const metadata = { title: "Fulfillment Orders" };

export default async function FulfillmentOrdersPage() {
  const profile = await requireProfile(["super_admin","operations_admin","warehouse_staff"]);
  const db = await createClient();
  const [{data},{data:products},{data:shippers},{data:marketRows}] = await Promise.all([
    db.from("fulfillment_orders").select("id,order_number,shipper_reference,shipper_id,recipient_name,recipient_phone,delivery_address,product_name,sku,quantity,status,payment_type,cod_amount,created_at,shipper:profiles!fulfillment_orders_shipper_id_fkey(full_name,email)").eq("organization_id",profile.organization_id!).order("created_at",{ascending:true}).order("id",{ascending:true}).limit(1000),
    db.from("fulfillment_products").select("id,name,sku,quantity_on_hand,quantity_reserved").eq("organization_id",profile.organization_id!).eq("active",true).order("name").limit(1000),
    db.from("profiles").select("id,full_name,email").eq("organization_id",profile.organization_id!).eq("role","shipper").eq("status","active").order("full_name").limit(500),
    db.from("organization_countries").select("country_code,is_primary").eq("organization_id",profile.organization_id!).eq("is_active",true)
  ]);
  const shipperOptions = (shippers??[]).map(shipper=>({id:shipper.id,label:shipper.full_name||shipper.email||"Shipper"}));
  type Line = NonNullable<typeof data>[number];
  const grouped = new Map<string,{order:Line;items:{name:string;sku:string;quantity:number}[]}>();
  for(const line of data??[]){
    let group = grouped.get(line.order_number);
    if(!group){group={order:line,items:[]};grouped.set(line.order_number,group);}
    group.items.push({name:line.product_name,sku:line.sku,quantity:line.quantity});
  }
  const groupedOrders = [...grouped.values()].sort((a,b)=>b.order.created_at.localeCompare(a.order.created_at));
  const orderNumbers = groupedOrders.map(order=>order.order.order_number);
  const [{data:charges},{data:shipments}] = orderNumbers.length ? await Promise.all([
    db.from("fulfillment_order_service_charges").select("order_number,group_name,amount,currency").eq("organization_id",profile.organization_id!).in("order_number",orderNumbers),
    db.from("shipments").select("id,tracking_number,fulfillment_order_id,status,customer_tracking_status,created_at").eq("organization_id",profile.organization_id!).is("deleted_at",null).in("fulfillment_order_id",groupedOrders.map(order=>order.order.id))
  ]) : [{data:[]},{data:[]}];
  const chargeByOrder = new Map((charges??[]).map(charge=>[charge.order_number,charge]));
  const shipmentByOrder = new Map((shipments??[]).map(shipment=>[shipment.fulfillment_order_id,shipment]));
  const countryCodes = [...new Set((marketRows??[]).map(row=>row.country_code))];
  const {data: countryRows} = countryCodes.length ? await db.from("countries").select("code,name,location_strategy,postal_code_label").in("code",countryCodes).eq("is_active",true) : await db.from("countries").select("code,name,location_strategy,postal_code_label").eq("code","AE").eq("is_active",true);
  const countries: FulfillmentAwbCountry[] = (countryRows??[]).map(country=>({
    code:country.code,name:country.name,location_strategy:country.location_strategy,
    postal_code_label:country.postal_code_label,
    is_primary:(marketRows??[]).some(row=>row.country_code===country.code&&row.is_primary)
  })).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.name.localeCompare(b.name));
  const tableOrders: FulfillmentOrderRow[] = groupedOrders.map(({order,items})=>{
    const relatedShipper = Array.isArray(order.shipper)?order.shipper[0]:order.shipper;
    const charge = chargeByOrder.get(order.order_number);
    const shipment = shipmentByOrder.get(order.id);
    return {
      orderId:order.id,orderNumber:order.order_number,reference:order.shipper_reference,shipperId:order.shipper_id,
      shipper:order.shipper_id?(relatedShipper?.full_name||relatedShipper?.email||"Shipper"):"Internal",
      recipient:order.recipient_name,phone:order.recipient_phone,address:order.delivery_address,items,
      fee:charge?charge.currency+" "+Number(charge.amount).toFixed(2):null,feeGroup:charge?.group_name??null,
      paymentType:order.payment_type as "cod"|"prepaid",codAmount:Number(order.cod_amount??0),
      status:order.status,createdAt:order.created_at,
      awb:shipment?{id:shipment.id,trackingNumber:shipment.tracking_number,status:shipment.status,customerStatus:shipment.customer_tracking_status,createdAt:shipment.created_at}:null
    };
  });

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--portal-blue)]">Fulfillment</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[#17231e]">Fulfillment Orders</h1><p className="mt-2 text-sm text-[#65736c]">Create customer orders from available inventory, progress picking and packing, create the delivery AWB, then track it from Operations.</p></header>
    <ShipperOrderTabs products={(products??[]) as Product[]} isStaff shippers={shipperOptions} templateHref="/shipper/fulfillment/template"/>
    <FulfillmentOrdersTable orders={tableOrders} countries={countries}/>
  </div>;
}
