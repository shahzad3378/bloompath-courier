import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const profile = await requireProfile(internalRoles);
  const supabase = await createClient();
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.from("finance_ledger").select("tracking_number,currency,cod_amount,delivery_charge,return_charge,total_charges,net_payable,transaction_type,transaction_at").eq("organization_id", profile.organization_id).order("transaction_at", { ascending: false }),
    supabase.from("organization_settings").select("currency").eq("organization_id", profile.organization_id).maybeSingle(),
  ]);
  const rows = data ?? [];
  const configured = String(settings?.currency ?? "").trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(configured) ? configured : (rows[0]?.currency || "USD");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Revenue Report");
  sheet.addRow(["Revenue Report"]); sheet.addRow(["Currency", currency]); sheet.addRow([]);
  sheet.addRow(["AWB","Transaction","Date","COD","Delivery Charge","Return Charge","Total Charges","Net Payable"]);
  for (const row of rows) sheet.addRow([row.tracking_number,row.transaction_type,row.transaction_at,Number(row.cod_amount||0),Number(row.delivery_charge||0),Number(row.return_charge||0),Number(row.total_charges||0),Number(row.net_payable||0)]);
  sheet.addRow([]);
  const totalCod=rows.reduce((s,r)=>s+Number(r.cod_amount||0),0), delivery=rows.reduce((s,r)=>s+Number(r.delivery_charge||0),0), returns=rows.reduce((s,r)=>s+Number(r.return_charge||0),0), charges=rows.reduce((s,r)=>s+Number(r.total_charges||0),0), net=rows.reduce((s,r)=>s+Number(r.net_payable||0),0);
  sheet.addRow(["","","Total COD",totalCod]); sheet.addRow(["","","Delivery Charges",delivery]); sheet.addRow(["","","Return Charges",returns]); sheet.addRow(["","","Total Charges",charges]); sheet.addRow(["","","Net Payable",net]);
  sheet.columns.forEach(c=>{c.width=20}); sheet.getColumn(1).width=24;
  const buffer=await workbook.xlsx.writeBuffer();
  const date=new Date().toISOString().slice(0,10);
  return new Response(buffer as BodyInit,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="revenue-report-${date}.xlsx"`,"Cache-Control":"no-store"}});
}
