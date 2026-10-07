import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { supabase, type Profile, type Shipment } from './courier';
function db() { if (!supabase) throw new Error('Connection is not configured.'); return supabase; }
function check(error: unknown, message: string) { if (error) throw new Error(message); }
export type PickupItem = { id: number; shipment_id: number; manifest_id: number; received_at: string | null; shipments: Shipment & { sender_name: string; sender_address: string; sender_city: string; sender_phone: string; weight_kg: number } };
export type Pickup = { id: number; manifest_number: string; shipper_name: string; status: string; submitted_at: string | null; pickup_manifest_items: PickupItem[] };
export type Custody = { shipment_id: number; manifest_id: number; stage: 'pickup' | 'hub_handover'; scanned_at: string };
export async function loadPickups(profile: Profile) {
 const {data,error}=await db().from('pickup_manifests').select('id,manifest_number,shipper_name,status,submitted_at').eq('organization_id',profile.organization_id).eq('assigned_driver_id',profile.id).in('status',['ready_for_pickup','picked_up','partially_received']).order('submitted_at').order('id');
 check(error,'Could not load pickup assignments. Retry.');
 const manifests=(data ?? []) as Omit<Pickup,'pickup_manifest_items'>[];
 const items: PickupItem[]=[]; const scans: Custody[]=[];
 if(manifests.length) {
  for(let offset=0;;offset+=200){ const r=await db().from('pickup_manifest_items').select('id,shipment_id,manifest_id,received_at,shipments(id,tracking_number,sender_name,sender_address,sender_city,sender_phone,weight_kg,cod_amount,currency)').in('manifest_id',manifests.map(m=>m.id)).order('id').range(offset,offset+199); check(r.error,'Could not load pickup parcels. Retry.'); items.push(...(r.data ?? []) as unknown as PickupItem[]); if((r.data ?? []).length<200)break; }
  for(let offset=0;;offset+=200){ const r=await db().from('driver_custody_scans').select('shipment_id,manifest_id,stage,scanned_at').eq('driver_id',profile.id).eq('organization_id',profile.organization_id).in('manifest_id',manifests.map(m=>m.id)).order('id').range(offset,offset+199); check(r.error,'Could not load scan records. Retry.'); scans.push(...(r.data ?? []) as Custody[]); if((r.data ?? []).length<200)break; }
 }
 return {pickups:manifests.map(m=>({...m,pickup_manifest_items:items.filter(i=>i.manifest_id===m.id)})),scans};
}
export async function recordCustody(manifest:number,tracking:string,stage:'pickup'|'hub_handover') {
 const {error}=await db().rpc('record_driver_custody_scan',{target_manifest:manifest,tracking:tracking.trim(),scan_stage:stage}); check(error,'Scan could not be recorded. Refresh and check this AWB is assigned to this pickup.');
}
export async function completePickup(manifest:number) { const {error}=await db().rpc('complete_driver_pickup',{target_manifest:manifest}); check(error,'Pickup could not be completed. Scan every parcel, refresh and retry.'); }
export type HistoryItem = {id:number; outcome:string; undelivered_reason:string|null; attempt_number:number; created_at:string; shipments:{tracking_number:string;consignee_name:string;consignee_city:string}};
export type ReturnHistory = {id:number;completed_at:string;shipments:{tracking_number:string;sender_name:string;sender_city:string}};
export async function loadHistory(profile:Profile,page=0,kind='all') {
 let query=db().from('delivery_attempts').select('id,outcome,undelivered_reason,attempt_number,created_at,shipments(tracking_number,consignee_name,consignee_city)',{count:'exact'}).eq('organization_id',profile.organization_id).eq('performed_by',profile.id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*25,page*25+24);
 if(kind!=='all')query=query.eq('outcome',kind);
 const attempts=await query;check(attempts.error,'Could not load delivery history. Retry.');
 const returns=await db().from('return_run_items').select('id,completed_at,shipments(tracking_number,sender_name,sender_city),return_runs!inner(driver_id)',{count:'exact'}).eq('organization_id',profile.organization_id).eq('return_runs.driver_id',profile.id).not('completed_at','is',null).order('completed_at',{ascending:false}).order('id',{ascending:false}).range(page*25,page*25+24);
 check(returns.error,'Could not load return history. Retry.');
 return {attempts:(attempts.data ?? []) as unknown as HistoryItem[],returns:(returns.data ?? []) as unknown as ReturnHistory[],count:attempts.count ?? 0,returnCount:returns.count ?? 0};
}
export type PayTerms={mode:'per_delivery'|'fixed'|'mixed';delivery_rate:number|null;fixed_rate:number|null;fixed_period:string|null;currency:string};
export type WalletSummary={cod:{currency:string;collected:number;deposited:number;outstanding:number}[];earnings:{currency:string;earned:number;deductions:number;paid:number;balance:number}[]};
export async function loadWallet(profile:Profile,page=0) {
 const [summary,terms,entries,receipts,earnings]=await Promise.all([
  db().rpc('driver_wallet_summary'),db().from('driver_pay_terms').select('mode,delivery_rate,fixed_rate,fixed_period,currency').eq('driver_id',profile.id).eq('organization_id',profile.organization_id).maybeSingle(),
  db().from('driver_cod_entries').select('id,tracking_number,cod_amount,received_amount,outstanding_amount,delivered_at,shipments(currency)',{count:'exact'}).eq('driver_id',profile.id).eq('organization_id',profile.organization_id).order('delivered_at',{ascending:false}).order('id',{ascending:false}).range(page*25,page*25+24),
  db().from('driver_cod_receipts').select('id,tracking_number,amount_received,received_at,shipments(currency)',{count:'exact'}).eq('driver_id',profile.id).eq('organization_id',profile.organization_id).order('received_at',{ascending:false}).order('id',{ascending:false}).range(page*25,page*25+24),
  db().from('driver_earnings').select('id,kind,amount,currency,description,created_at',{count:'exact'}).eq('driver_id',profile.id).eq('organization_id',profile.organization_id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*25,page*25+24)
 ]);
 for(const r of [summary,terms,entries,receipts,earnings])check(r.error,'Could not load cash or earnings records. Retry.');
 return {summary:summary.data as WalletSummary,terms:terms.data as PayTerms|null,entries:entries.data ?? [],receipts:receipts.data ?? [],earnings:earnings.data ?? [],counts:{cod:entries.count ?? 0,deposits:receipts.count ?? 0,earnings:earnings.count ?? 0}};
}
export async function loadProfileDetails(profile:Profile) {
 const [vehicle,bank,documents,delivered,total]=await Promise.all([
  db().from('driver_profiles').select('vehicle_number,plate_number,driving_licence_number,licence_expiry').eq('driver_id',profile.id).eq('organization_id',profile.organization_id).maybeSingle(),
  db().from('driver_bank_details').select('bank_name,account_holder,account_number').eq('driver_id',profile.id).eq('organization_id',profile.organization_id).maybeSingle(),
  db().from('driver_documents').select('id,kind,path,created_at').eq('driver_id',profile.id).eq('organization_id',profile.organization_id).order('created_at',{ascending:false}).limit(100),
  db().from('delivery_attempts').select('id',{head:true,count:'exact'}).eq('performed_by',profile.id).eq('organization_id',profile.organization_id).eq('outcome','delivered'),
  db().from('delivery_attempts').select('id',{head:true,count:'exact'}).eq('performed_by',profile.id).eq('organization_id',profile.organization_id),
 ]);
 for(const r of [vehicle,bank,documents,delivered,total])check(r.error,'Could not load your profile details. Retry.');
 return {vehicle:vehicle.data,bank:bank.data,documents:documents.data ?? [],delivered:delivered.count ?? 0,total:total.count ?? 0};
}
export async function saveBank(profile:Profile,bank_name:string,account_holder:string,account_number:string) {
 if(bank_name.trim().length<2||account_holder.trim().length<2||account_number.trim().length<5)throw new Error('Enter the bank, account holder and account number.');
 const {error}=await db().from('driver_bank_details').upsert({driver_id:profile.id,organization_id:profile.organization_id,bank_name:bank_name.trim(),account_holder:account_holder.trim(),account_number:account_number.trim(),updated_at:new Date().toISOString()},{onConflict:'driver_id'});check(error,'Bank details were not saved. Retry.');
}
export async function saveDocument(profile:Profile,kind:string,base64:string) {
 const bytes=decode(base64);if(bytes.byteLength===0||bytes.byteLength>5*1024*1024)throw new Error('Choose a JPG document photo of 5 MB or less.');
 const id=Crypto.randomUUID();const path=`${profile.organization_id}/${profile.id}/${id}.jpg`;
 const upload=await db().storage.from('driver-documents').upload(path,bytes,{contentType:'image/jpeg',upsert:false});check(upload.error,'Document photo could not be uploaded.');
 const {error}=await db().from('driver_documents').insert({id,organization_id:profile.organization_id,driver_id:profile.id,kind,path});if(error){await db().storage.from('driver-documents').remove([path]);throw new Error('Document record was not saved. Retry.');}
}
export type Ticket={id:string;subject:string;status:string;category:string;tracking_number:string|null;created_at:string};
export async function loadSupport(profile:Profile) {
 const [tickets,settings]=await Promise.all([db().from('driver_support_tickets').select('id,subject,status,category,tracking_number,created_at').eq('driver_id',profile.id).eq('organization_id',profile.organization_id).order('created_at',{ascending:false}).limit(100),db().from('organization_settings').select('contact_phone,contact_email').eq('organization_id',profile.organization_id).maybeSingle()]);
 check(tickets.error,'Could not load support requests. Retry.');check(settings.error,'Could not load dispatch contact details. Retry.');return {tickets:(tickets.data ?? []) as Ticket[],contact:settings.data};
}
export async function sendTicket(profile:Profile,id:string,subject:string,category:string,tracking:string) {
 const {error}=await db().from('driver_support_tickets').insert({id,organization_id:profile.organization_id,driver_id:profile.id,subject:subject.trim(),category,tracking_number:tracking.trim()||null});if(error&&error.code!=='23505')throw new Error('Support request was not saved. Retry.');
}
export async function loadMessages(ticket:string) {const {data,error}=await db().from('driver_support_messages').select('id,body,created_at,author_id').eq('ticket_id',ticket).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200);check(error,'Could not load messages. Retry.');return (data ?? []).reverse();}
export async function sendMessage(profile:Profile,ticket:string,id:string,body:string) {const {error}=await db().from('driver_support_messages').insert({id,ticket_id:ticket,author_id:profile.id,body:body.trim()});if(error&&error.code!=='23505')throw new Error('Message was not saved. Retry.');}
