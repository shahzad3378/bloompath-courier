const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
async function track(events, proof = null, attemptLookupFails = false) {
  let handler;
  const source = fs.readFileSync('supabase/functions/fastdrop-public-tracking/index.ts','utf8').replace(/^import .*;\n/, '');
  const context = {
    Deno: { env: { get: () => 'https://example.test' }, serve: h => handler = h },
    Request, Response, URL, URLSearchParams, console,
    fetch: async (url) => {
      if (url.includes('/shipments?')) return Response.json([{id:'shipment',tracking_number:'FDTEST',updated_at:'2026-10-30T00:00:00Z'}]);
      if (url.includes('/delivery_attempts?')) return attemptLookupFails ? new Response('{}',{status:503}) : Response.json([]);
      if (url.includes('/object/sign/')) return Response.json({signedURL:'/object/sign/delivery-proofs/test?token=test'});
      if (url.includes('select=proof_path')) return Response.json(proof ? [{proof_path:proof}] : []);
      return Response.json(events);
    },
  };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
  return (await handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({trackingNumber:'FDTEST'})}))).json();
}
test('warehouse scan remains warehouse, never transit',async()=>{
 const r=await track([{status:'at_warehouse',created_at:'2026-10-30T17:00:00Z'}]);
 assert.equal(r.currentStatus,'Arrived at warehouse');
 assert.equal(r.timeZone,'America/Toronto');
});
test('late OFD cannot replace delivered or create post-delivery movement',async()=>{
 const r=await track([
 {status:'out_for_delivery',created_at:'2026-10-22T18:09:00Z'},
 {status:'delivered',created_at:'2026-10-22T16:21:00Z'},
 {status:'out_for_delivery',created_at:'2026-10-22T12:00:00Z'},
 {status:'booked',created_at:'2026-10-21T12:00:00Z'},
 {status:'booked',created_at:'2026-10-11T12:00:00Z'},
 ],'org/user/proof.jpg');
 assert.equal(r.currentStatus,'Delivered');
 assert.equal(r.updatedAt,'2026-10-22T16:21:00Z');
 assert.equal(r.events.filter(e=>e.status==='Out for delivery').length,1);
 assert.equal(r.events.at(-1).timestamp,'2026-10-11T12:00:00Z');
 assert.match(r.podUrl,/^https:\/\//);
});
test('customs warehouse scan suppresses generic receipt for same stay',async()=>{
 const r=await track([
  {status:'at_warehouse',created_at:'2026-10-20T18:44:00Z'},
  {status:'customs_clearance_completed_warehouse_scanned',created_at:'2026-10-15T20:38:00Z'},
  {status:'arrived_at_destination_airport_customs_started',created_at:'2026-10-15T19:25:00Z'},
  {status:'booked',created_at:'2026-10-11T20:37:00Z'},
 ]);
 assert.equal(r.currentStatus,'Customs clearance completed — shipment scanned in warehouse');
 assert.equal(r.updatedAt,'2026-10-15T20:38:00Z');
 assert.equal(r.events.some(e=>e.status==='Arrived at warehouse'),false);
});
test('warehouse receipt after delivery attempt remains visible',async()=>{
 const r=await track([
  {status:'at_warehouse',created_at:'2026-10-21T18:00:00Z'},
  {status:'undelivered',created_at:'2026-10-21T17:00:00Z'},
  {status:'out_for_delivery',created_at:'2026-10-21T12:00:00Z'},
  {status:'customs_clearance_completed_warehouse_scanned',created_at:'2026-10-15T20:38:00Z'},
 ]);
 assert.equal(r.currentStatus,'Arrived at warehouse');
 assert.equal(r.events.length,4);
});

test('transit after customs receipt is not reopened by a duplicate generic warehouse scan',async()=>{
 const r=await track([
  {status:'at_warehouse',created_at:'2026-10-20T18:44:40.853679Z'},
  {status:'in_transit',created_at:'2026-10-20T17:23:00Z'},
  {status:'customs_clearance_completed_warehouse_scanned',created_at:'2026-10-15T20:32:00Z'},
  {status:'arrived_at_destination_airport_customs_started',created_at:'2026-10-15T19:19:00Z'},
  {status:'booked',created_at:'2026-10-11T20:37:31Z'},
 ]);
 assert.equal(r.currentStatus,'In transit');
 assert.equal(r.updatedAt,'2026-10-20T17:23:00Z');
 assert.equal(r.events.length,4);
 assert.equal(r.events.some(e=>e.status==='Arrived at warehouse'),false);
});
test('ordinary transit and warehouse arrival without a customs receipt stay visible',async()=>{
 const r=await track([
  {status:'at_warehouse',created_at:'2026-10-20T18:44:00Z'},
  {status:'in_transit',created_at:'2026-10-20T17:23:00Z'},
 ]);
 assert.equal(r.currentStatus,'Arrived at warehouse');
 assert.equal(r.events.length,2);
});

test('manual POD remains available when driver-attempt lookup fails',async()=>{
 const r=await track([{status:'delivered',created_at:'2026-10-22T12:33:00Z'}],'org/user/proof.jpg',true);
 assert.equal(r.currentStatus,'Delivered');
 assert.match(r.podUrl,/^https:\/\//);
});
