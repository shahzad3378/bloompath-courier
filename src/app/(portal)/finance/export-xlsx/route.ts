import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const roles=["super_admin","operations_admin","finance_staff"] as const;
export async function GET(){
 const profile=await requireProfile(roles); const supabase=await createClient();
 const [{data:ledger},{data:settlements},{data:settings}]=await Promise.all([
  supabase.from("finance_ledger").select("tracking_number,transaction_type,transaction_at,currency,cod_amount,delivery_charge,return_charge,total_charges,net_payable").eq("organization_id",profile.organization_id).order("transaction_at",{ascending:false}),
  supabase.from("settlements").select("settlement_number,status,currency,total_cod,total_charges,net_payable,created_at").eq("organization_id",profile.organization_id).order("created_at",{ascending:false}),
  supabase.from("organization_settings").select("currency").eq("organization_id",profile.organization_id).maybeSingle(),
 ]);
 const configured=String(settings?.currency??"").trim().toUpperCase(); const currency=/^[A-Z]{3}$/.test(configured)?configured:((ledger?.[0] as any)?.currency||(settlements?.[0] as any)?.currency||"USD");
 const wb=new ExcelJS.Workbook(); const tx=wb.addWorksheet("Transactions"); tx.addRow(["Finance Transactions"]);tx.addRow(["Currency",currency]);tx.addRow([]);tx.addRow(["AWB","Type","Date","COD","Delivery Charge","Return Charge","Total Charges","Net Payable"]); for(const r of ledger??[])tx.addRow([r.tracking_number,r.transaction_type,r.transaction_at,Number(r.cod_amount||0),Number(r.delivery_charge||0),Number(r.return_charge||0),Number(r.total_charges||0),Number(r.net_payable||0)]); tx.columns.forEach(c=>c.width=20);tx.getColumn(1).width=24;
 const st=wb.addWorksheet("Settlements");st.addRow(["Settlement History"]);st.addRow(["Currency",currency]);st.addRow([]);st.addRow(["Settlement","Status","Created","Total COD","Charges","Net Payable"]);for(const r of settlements??[])st.addRow([r.settlement_number,r.status,r.created_at,Number(r.total_cod||0),Number(r.total_charges||0),Number(r.net_payable||0)]);st.columns.forEach(c=>c.width=22);
 const buffer=await wb.xlsx.writeBuffer();const date=new Date().toISOString().slice(0,10);return new Response(buffer as BodyInit,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="finance-transactions-${date}.xlsx"`,"Cache-Control":"no-store"}});
}
