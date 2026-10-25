import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(){
 const profile=await requireProfile(["shipper","super_admin","operations_admin","warehouse_staff"]);const db=await createClient();
 const {data,error}=await db.from("fulfillment_products").select("name,quantity_on_hand,quantity_reserved").eq("organization_id",profile.organization_id!).eq("active",true).order("name").limit(1000);
 if(error)return new Response("Could not load product list",{status:500});
 const available=[...new Set((data??[]).filter(p=>p.quantity_on_hand>p.quantity_reserved).map(p=>p.name))];
 const workbook=new ExcelJS.Workbook();workbook.creator="BloomPath Courier";
 const orders=workbook.addWorksheet("Fulfillment Orders");
 orders.columns=[{header:"order_reference",key:"order_reference",width:22},{header:"recipient_name",key:"recipient_name",width:28},{header:"recipient_phone",key:"recipient_phone",width:22},{header:"delivery_address",key:"delivery_address",width:46},{header:"product_name",key:"product_name",width:32},{header:"quantity",key:"quantity",width:14}];
 orders.views=[{state:"frozen",ySplit:1}];orders.autoFilter={from:"A1",to:"F201"};
 orders.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};orders.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF174EA6"}};
 const instructions=workbook.addWorksheet("Instructions");instructions.columns=[{width:38},{width:72}];instructions.addRow(["How to group products into one order","Example"]);instructions.addRow(["Use one spreadsheet row per product.","To make one order with two products, repeat ORDER-001 on both rows."]);instructions.addRow(["Keep consignee details the same on all rows with the same order_reference.","ORDER-001 | same customer details | Product A | 1"]);instructions.addRow(["Rows without an order_reference are treated as separate orders.","ORDER-001 | same customer details | Product B | 2"]);instructions.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};instructions.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF174EA6"}};
 const catalog=workbook.addWorksheet("Product List");catalog.state="veryHidden";catalog.getCell("A1").value="Available product names";available.forEach((name,index)=>catalog.getCell(index+2,1).value=name);
 if(available.length){workbook.definedNames.add(`'Product List'!$A$2:$A$${available.length+1}`,"AvailableProducts");for(let row=2;row<=201;row++){orders.getCell(row,5).dataValidation={type:"list",allowBlank:true,formulae:["=AvailableProducts"],showErrorMessage:true,errorTitle:"Choose a listed product",error:"Select a product from the dropdown."};}}
 const bytes=await workbook.xlsx.writeBuffer();
 return new Response(bytes as unknown as BodyInit,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":"attachment; filename=fulfillment-orders-template.xlsx","Cache-Control":"no-store"}});
}
