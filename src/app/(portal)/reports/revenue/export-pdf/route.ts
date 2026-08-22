import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireProfile } from "@/lib/auth";
import { internalRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
function money(value:unknown,currency:string){return `${currency} ${Number(value||0).toFixed(2)}`;}
export async function GET(){
 const profile=await requireProfile(internalRoles); const supabase=await createClient();
 const [{data:rowsData},{data:settings}]=await Promise.all([
  supabase.from("finance_ledger").select("tracking_number,currency,cod_amount,delivery_charge,return_charge,total_charges,net_payable,transaction_at").eq("organization_id",profile.organization_id).order("transaction_at",{ascending:false}),
  supabase.from("organization_settings").select("display_name,legal_name,trn,currency").eq("organization_id",profile.organization_id).maybeSingle(),
 ]);
 const rows=rowsData??[]; const configured=String(settings?.currency??"").trim().toUpperCase(); const currency=/^[A-Z]{3}$/.test(configured)?configured:(rows[0]?.currency||"USD");
 const pdf=await PDFDocument.create(); const regular=await pdf.embedFont(StandardFonts.Helvetica); const bold=await pdf.embedFont(StandardFonts.HelveticaBold); const green=rgb(.075,.45,.294),dark=rgb(.12,.16,.14),grey=rgb(.45,.49,.47); let page=pdf.addPage([595.28,841.89]); let y=795; const company=settings?.display_name||settings?.legal_name||"Courier Company";
 const drawText=(value:unknown,x:number,yy:number,size=8,isBold=false)=>page.drawText(String(value??""),{x,y:yy,size,font:isBold?bold:regular,color:dark});
 const newPage=()=>{page=pdf.addPage([595.28,841.89]);y=795;drawText(company,40,y,12,true);drawText("Revenue Report",420,y,10,true);y-=35};
 drawText(company,40,y,18,true); page.drawText("REVENUE REPORT",{x:390,y,size:13,font:bold,color:green}); y-=20; if(settings?.trn) page.drawText(`Tax ID: ${settings.trn}`,{x:40,y,size:8,font:regular,color:grey}); y-=35;
 const headers=[["AWB",40],["COD",170],["Delivery",250],["Return",330],["Charges",405],["Net",490]] as const;
 const tableHeader=()=>{page.drawRectangle({x:40,y:y-16,width:515,height:22,color:green});for(const [label,x] of headers)page.drawText(label,{x,y:y-8,size:7,font:bold,color:rgb(1,1,1)});y-=27}; tableHeader();
 for(const row of rows){if(y<90){newPage();tableHeader()} drawText(row.tracking_number,40,y,7,true);drawText(Number(row.cod_amount||0).toFixed(2),170,y,7);drawText(Number(row.delivery_charge||0).toFixed(2),250,y,7);drawText(Number(row.return_charge||0).toFixed(2),330,y,7);drawText(Number(row.total_charges||0).toFixed(2),405,y,7);drawText(Number(row.net_payable||0).toFixed(2),490,y,7,true);y-=18}
 if(y<170)newPage(); y-=20; const totalCod=rows.reduce((s,r)=>s+Number(r.cod_amount||0),0),totalCharges=rows.reduce((s,r)=>s+Number(r.total_charges||0),0),netPayable=rows.reduce((s,r)=>s+Number(r.net_payable||0),0); drawText("Total COD",350,y,9,true);drawText(money(totalCod,currency),455,y,9,true);y-=18;drawText("Courier Charges",350,y,9,true);drawText(money(totalCharges,currency),455,y,9,true);y-=18;drawText("Net Payable",350,y,10,true);page.drawText(money(netPayable,currency),{x:455,y,size:10,font:bold,color:green});
 const bytes=await pdf.save(); const date=new Date().toISOString().slice(0,10); return new Response(bytes as BodyInit,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="revenue-report-${date}.pdf"`,"Cache-Control":"no-store"}});
}
