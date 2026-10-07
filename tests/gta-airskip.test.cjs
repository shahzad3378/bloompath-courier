const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function loadTs(filename, imports = {}) {
 const code = ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m = new Module(path.resolve(filename)); m.filename=path.resolve(filename); m.paths=Module._nodeModulePaths(path.dirname(m.filename)); const req=m.require.bind(m);m.require=name=>Object.hasOwn(imports,name)?imports[name]:req(name);m._compile(code,m.filename);return m.exports;
}
const core=loadTs('src/lib/gta-airskip.ts');
const server=loadTs('src/lib/gta-airskip-server.ts',{'server-only':{},'@/lib/gta-airskip':core});
const shipment={tracking_number:'FD10001',pieces:1,weight_kg:2,payment_type:'prepaid',cod_amount:0,sender_name:'Sender',sender_address:'1 Street',sender_city:'Toronto',sender_state_province:'ON',sender_postal_code:'M5V 1A1',sender_country_code:'CA',consignee_name:'Receiver',consignee_address:'2 Street',consignee_city:'Toronto',consignee_state_province:'ON',consignee_postal_code:'M5V 1A1',consignee_country_code:'CA'};
const options={terminal:core.gtaSenderTerminals,destinationTerminal:'',service:'',piecesType:'Box',length:10,width:8,height:4,signature:false,insurance:false,insuranceValue:NaN,items:[]};
const item={description:'Shirt',weight:0.3,hsCode:'6109100012',declaredValue:20,currency:'USD',quantity:1};
const label=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
const response={isSuccess:true,data:{loadNumber:'LOAD1',cost:5,packages:[{trackingNumber:['GTA10001'],labelBase64:label}]}};
const config={accountKey:'fixture-account',apiKey:'fixture-api',baseUrl:server.gtaQaUrl,test:true,liveEnabled:false};
test('domestic shipment uses bare GTA schema with references, cm/kg and no customs or custom tracking',()=>{
 const payload=core.buildGtaShipment(shipment,options,'persisted-uuid');
 assert.equal(payload.IdempotencyKey,'persisted-uuid');assert.equal(payload.reference1,'FD10001');assert.equal(payload.shipment,undefined);assert.equal(payload.service,undefined);assert.equal(payload.fromCountry,'CA');
 const pkg=payload.packages[0];assert.equal(pkg.sizeType,0);assert.equal(pkg.weightType,0);assert.equal(pkg.items,undefined);assert.equal(pkg.customerTrackingNumbers,undefined);assert.equal(pkg.customerTrackingReference1,'FD10001');
});
test('cross-border / USPS requires actual item weight, HS, currency and quantity',()=>{
 assert.throws(()=>core.buildGtaShipment({...shipment,consignee_country_code:'US'},options),/customs items/);
 assert.throws(()=>core.buildGtaShipment(shipment,{...options,service:'USPS'}),/customs items/);
 const pkg=core.buildGtaShipment({...shipment,consignee_country_code:'US'},{...options,items:[item]}).packages[0]; assert.deepEqual(pkg.items[0],{...item,weightType:0});
 for(const bad of [{weight:0},{hsCode:'123'},{currency:'$'},{quantity:0},{declaredValue:NaN}])assert.throws(()=>core.buildGtaShipment(shipment,{...options,items:[{...item,...bad}]}));
});
test('blocks unsafe COD/multi-piece/incomplete dimensions and missing provider details',()=>{
 assert.throws(()=>core.buildGtaShipment({...shipment,pieces:2},options),/physical parcel/);
 assert.throws(()=>core.buildGtaShipment({...shipment,payment_type:'cod',cod_amount:20},options),/COD/);
 for(const bad of [{length:0},{width:NaN},{terminal:''},{piecesType:''},{insurance:true,insuranceValue:0},{service:'AirSkip',destinationTerminal:''}])assert.throws(()=>core.buildGtaShipment(shipment,{...options,...bad}));
 assert.throws(()=>core.buildGtaShipment({...shipment,sender_country_code:'AE'},options),/Canada and USA/);
});
test('accepts single PNG or raw ZPL label and saves load number',()=>{
 assert.equal(core.parseGtaLabel(response).format,'png');assert.equal(core.parseGtaLabel(response).loadNumber,'LOAD1');
 assert.equal(core.parseGtaLabel({isSuccess:true,data:{loadNumber:'LOAD1',packages:[{trackingNumber:['GTA10001'],labelZpl:'^XA^FO10,10^FDTest^FS^XZ'}]}}).format,'zpl');
});
test('rejects provider failures, extra tracking numbers, arbitrary bytes and null data',()=>{
 assert.throws(()=>core.parseGtaLabel({...response,isSuccess:false}),/rejected/);
 assert.throws(()=>core.parseGtaLabel({isSuccess:true,data:null}));
 assert.throws(()=>core.parseGtaLabel({isSuccess:true,data:{...response.data,packages:[{trackingNumber:['GTA1','GTA2'],labelBase64:label}]}}),/counts/);
 assert.throws(()=>core.parseGtaLabel({isSuccess:true,data:{...response.data,packages:[{trackingNumber:['GTA1'],labelBase64:Buffer.from('html').toString('base64')}]}}),/supported/);
});
test('rates return costs and separate tax without invented currency',()=>{
 assert.deepEqual(core.parseGtaRates({isSuccess:true,data:[{service:'Ground',cost:10,taxAmount:1.3}]}),[{service:'Ground',cost:10,tax:1.3}]);
 for(const data of [[],[{cost:'10'}],[{cost:NaN}]])assert.throws(()=>core.parseGtaRates({isSuccess:true,data}));
});
test('tracking filters exact saved AWB and returns bounded safe event fields',()=>{
 const result=core.parseGtaTracking({isSuccess:true,data:[{trackingNumber:'OTHER',status:'Secret'},{trackingNumber:'GTA1',status:'Completed',standardStatus:13,lastStatusDate:'2026-10-03',events:[{name:'Delivered',eventDateTime:'date',location:'Toronto',pod:'https://private.example'}]}]},'GTA1');
 assert.equal(result.status,'Completed');assert.equal(result.standardStatus,13);assert.equal(result.events[0].pod,undefined);assert.throws(()=>core.parseGtaTracking({isSuccess:true,data:[]},'GTA1'));
});
test('config is tenant-bound, QA default, rejects unsafe URLs and key injection',()=>{
 const keys=['GTA_AIRSKIP_ORGANIZATION_ID','GTA_AIRSKIP_ACCOUNT_KEY','GTA_AIRSKIP_API_KEY','GTA_AIRSKIP_BASE_URL','GTA_AIRSKIP_LIVE_ENABLED'];const old=keys.map(k=>process.env[k]);
 try {process.env.GTA_AIRSKIP_ORGANIZATION_ID='org';process.env.GTA_AIRSKIP_ACCOUNT_KEY='key';process.env.GTA_AIRSKIP_API_KEY='api';delete process.env.GTA_AIRSKIP_BASE_URL;
 assert.equal(server.getGtaConfig('other'),null);assert.equal(server.getGtaConfig('org').test,true);assert.equal(server.getGtaConfig('org').liveEnabled,false);
 for(const url of ['http://tms-api-qa.gtagsm.com','https://evil.example','https://gtagsm.com.evil.example','https://user:pass@tms-api-qa.gtagsm.com','https://tms-api-qa.gtagsm.com/path','https://tms-api-qa.gtagsm.com?x=1']){process.env.GTA_AIRSKIP_BASE_URL=url;assert.equal(server.getGtaConfig('org'),null);}
 process.env.GTA_AIRSKIP_BASE_URL=server.gtaQaUrl;process.env.GTA_AIRSKIP_API_KEY='bad\r\nHeader';assert.equal(server.getGtaConfig('org'),null);
 } finally {keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});
test('transport sends both auth headers, correct endpoints and persisted idempotency; no retries',async()=>{
 const old=global.fetch;const calls=[];global.fetch=async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});};
 try {await server.requestGtaLabel({IdempotencyKey:'uuid'},config);assert.equal(calls[0].url,server.gtaQaUrl+'/shipment?pngLabel=true');assert.equal(calls[0].opts.headers['x-account-key'],'fixture-account');assert.equal(calls[0].opts.headers['x-api-key'],'fixture-api');assert.equal(calls[0].opts.redirect,'error');assert.equal(JSON.parse(calls[0].opts.body).IdempotencyKey,'uuid');
 global.fetch=async()=>{calls.push({});throw new Error('private secret');};await assert.rejects(server.requestGtaLabel({},config),/timed out/);assert.equal(calls.length,2);
 } finally{global.fetch=old;}
});
test('carrier error text is never exposed; known tracking survives invalid label',async()=>{
 const old=global.fetch;
 try {global.fetch=async()=>new Response(JSON.stringify({isSuccess:false,errorMessage:'secret PII'}));await assert.rejects(server.requestGtaRates({},config),error=>!error.message.includes('secret') && /unsuccessful/.test(error.message));
 global.fetch=async()=>new Response(JSON.stringify({isSuccess:true,data:{...response.data,packages:[{trackingNumber:['GTA10001'],labelBase64:'BAD'}]}}));await assert.rejects(server.requestGtaLabel({},config),error=>error.tracking==='GTA10001');
 global.fetch=async()=>new Response('',{status:401});await assert.rejects(server.requestGtaLabel({},config),/HTTP 401/);
 }finally{global.fetch=old;}
});
test('tracking transport only submits exact partner filter with history',async()=>{
 const old=global.fetch;
 try{global.fetch=async(url,opts)=>{assert.equal(url,server.gtaQaUrl+'/trackings/get');assert.deepEqual(JSON.parse(opts.body),{trackingNumbers:['GTA1'],includeHistory:true,page:1,pageSize:10});return new Response(JSON.stringify({isSuccess:true,data:[{trackingNumber:'GTA1',status:'New'}]}));};assert.equal((await server.requestGtaTracking('GTA1',config)).status,'New');}finally{global.fetch=old;}
});
test('server action blocks production without activation/confirmation before reserving or requesting carrier',async()=>{
 const keys=['GTA_AIRSKIP_ORGANIZATION_ID','GTA_AIRSKIP_ACCOUNT_KEY','GTA_AIRSKIP_API_KEY','GTA_AIRSKIP_BASE_URL','GTA_AIRSKIP_LIVE_ENABLED'];const old=keys.map(k=>process.env[k]);
 let adminCalls=0;
 const query={select(){return this;},eq(){return this;},is(){return this;},async maybeSingle(){return {data:shipment};}};
 const actions=loadTs('src/app/(portal)/courier-integrations/gta-airskip/actions.ts',{'next/cache':{revalidatePath(){}},'next/navigation':{unstable_rethrow(){}},'@/lib/auth':{async requireProfile(roles){assert.ok(roles.includes('dispatcher'));return {id:'actor',organization_id:'org'};}},'@/lib/gta-airskip':core,'@/lib/gta-airskip-server':server,'@/lib/supabase/server':{async createClient(){return {from(){return query;}};}},'@/lib/supabase/admin':{createAdminClient(){adminCalls++;throw new Error('Must not access booking storage');}}});
 try{process.env.GTA_AIRSKIP_ORGANIZATION_ID='org';process.env.GTA_AIRSKIP_ACCOUNT_KEY='key';process.env.GTA_AIRSKIP_API_KEY='api';process.env.GTA_AIRSKIP_BASE_URL='https://tms-api.gtagsm.com';process.env.GTA_AIRSKIP_LIVE_ENABLED='false';
 const form=new FormData();form.set('awb','FD10001');form.set('confirm_induction','on');form.set('confirm_live','on');assert.match((await actions.generateGtaAwb({},form)).message,/must be enabled/);assert.equal(adminCalls,0);
 process.env.GTA_AIRSKIP_LIVE_ENABLED='true';form.delete('confirm_live');assert.match((await actions.generateGtaAwb({},form)).message,/explicitly confirmed/);assert.equal(adminCalls,0);
 form.delete('confirm_induction');assert.match((await actions.generateGtaAwb({},form)).message,/drop-off address/);
 }finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});
test('request mapping satisfies the provider snapshot required fields and rejects unknown-property drift',()=>{
 const schemas=JSON.parse(fs.readFileSync('tests/fixtures/gta-airskip-request-schemas.json','utf8'));
 const payload=core.buildGtaShipment({...shipment,consignee_country_code:'US'},{...options,items:[item]},'uuid');
 const check=(value,schema)=>{for(const key of schema.required||[])assert.ok(Object.hasOwn(value,key),`Missing required ${key}`);for(const key of Object.keys(value))assert.ok(Object.hasOwn(schema.properties,key),`Unknown provider field ${key}`);};
 check(payload,schemas.Shipment);check(payload.packages[0],schemas.Package);check(payload.packages[0].items[0],schemas.Item);
});
test('setup diagnostics identify missing settings, tenant mismatch and invalid URL without exposing secrets',()=>{
 const keys=['GTA_AIRSKIP_ORGANIZATION_ID','GTA_AIRSKIP_ACCOUNT_KEY','GTA_AIRSKIP_API_KEY','GTA_AIRSKIP_BASE_URL']; const old=keys.map(k=>process.env[k]);
 try{ keys.forEach(k=>delete process.env[k]);assert.match(server.getGtaSetupIssue('org'),/GTA_AIRSKIP_ORGANIZATION_ID, GTA_AIRSKIP_ACCOUNT_KEY, GTA_AIRSKIP_API_KEY/);
 process.env.GTA_AIRSKIP_ORGANIZATION_ID='different';process.env.GTA_AIRSKIP_ACCOUNT_KEY='secret-account';process.env.GTA_AIRSKIP_API_KEY='secret-api';assert.match(server.getGtaSetupIssue('org'),/Expected value: org/);assert.ok(!server.getGtaSetupIssue('org').includes('secret'));
 process.env.GTA_AIRSKIP_ORGANIZATION_ID='org';process.env.GTA_AIRSKIP_BASE_URL=server.gtaQaUrl;assert.equal(server.getGtaSetupIssue('org'),null);
 process.env.GTA_AIRSKIP_API_KEY='secret\nsecret';assert.match(server.getGtaSetupIssue('org'),/line break/);process.env.GTA_AIRSKIP_API_KEY='secret-api';process.env.GTA_AIRSKIP_BASE_URL='https://evil.example/?secret';assert.match(server.getGtaSetupIssue('org'),/BASE_URL/);assert.ok(!server.getGtaSetupIssue('org').includes('evil.example'));process.env.GTA_AIRSKIP_API_KEY='  ';assert.match(server.getGtaSetupIssue('org'),/Missing deployment settings: GTA_AIRSKIP_API_KEY/);
 }finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});
test('credential verification only calls read-only tracking with a fresh synthetic exact filter',async()=>{
 const old=global.fetch,calls=[];
 try{global.fetch=async(url,opts)=>{const payload=JSON.parse(opts.body);calls.push(payload);assert.equal(url,server.gtaQaUrl+'/trackings/get');assert.equal(payload.pageSize,1);assert.equal(payload.includeHistory,false);assert.equal(payload.trackingNumbers.length,1);assert.match(payload.trackingNumbers[0],/^CONNECTIONCHECK-[0-9a-f-]{36}$/);return new Response(JSON.stringify({isSuccess:true,data:[]}));};await server.verifyGtaCredentials(config);await server.verifyGtaCredentials(config);assert.notEqual(calls[0].trackingNumbers[0],calls[1].trackingNumbers[0]);
 global.fetch=async()=>new Response(JSON.stringify({isSuccess:false,errorMessage:'private'}));await assert.rejects(server.verifyGtaCredentials(config),/unsuccessful/);
 global.fetch=async()=>new Response(JSON.stringify({isSuccess:true,data:null}));await assert.rejects(server.verifyGtaCredentials(config),/unexpected tracking/);
 }finally{global.fetch=old;}
});

test('provider rejection categories distinguish auth, no match and undocumented response without leaking text',()=>{
 assert.match(server.describeGtaRejection({isSuccess:false,errorMessage:'Invalid ApiKey: PRIVATE'}),/could not validate/);
 assert.match(server.describeGtaRejection({isSuccess:false,errorMessage:'Account inactive PRIVATE'}),/rejected the account/);
 assert.match(server.describeGtaRejection({isSuccess:false,errorMessage:'No tracking numbers found PRIVATE'}),/no matching/);
 assert.match(server.describeGtaRejection({success:true,errorMessage:'PRIVATE'}),/undocumented response/);
 assert.ok(!server.describeGtaRejection({isSuccess:false,errorMessage:'Invalid ApiKey: PRIVATE'}).includes('PRIVATE'));
});

test('verified QA PascalCase envelope succeeds and malformed or failed envelopes stay blocked',async()=>{
 const actual={Data:[],IsSuccess:true,ErrorMessage:null};
 assert.deepEqual(core.gtaData(actual),[]);
 assert.deepEqual(core.gtaData({isSuccess:true,data:[]}),[]);
 for(const body of [{Data:[],IsSuccess:false},{Data:[],IsSuccess:'true'},{IsSuccess:true},{Data:[],IsSuccess:true,isSuccess:false},{Data:[],isSuccess:true}])assert.throws(()=>core.gtaData(body));
 assert.match(server.describeGtaRejection({IsSuccess:false,ErrorMessage:'Invalid ApiKey PRIVATE'}),/could not validate/);
 assert.ok(!server.describeGtaRejection({IsSuccess:false,ErrorMessage:'Invalid ApiKey PRIVATE'}).includes('PRIVATE'));
 const old=global.fetch;
 try{global.fetch=async()=>new Response(JSON.stringify(actual));await server.verifyGtaCredentials(config);
 global.fetch=async()=>new Response(JSON.stringify({Data:[],IsSuccess:false,ErrorMessage:'Invalid ApiKey PRIVATE'}));await assert.rejects(server.verifyGtaCredentials(config),/could not validate/);
 }finally{global.fetch=old;}
});

test('confirmed request casing keeps empty address2 and stable body idempotency without aliases',()=>{
 const payload=core.buildGtaShipment({...shipment,consignee_address_2:null},options,'saved-uuid');
 assert.equal(payload.ToAddress2,'');assert.equal(payload.toAddress2,undefined);
 assert.equal(payload.IdempotencyKey,'saved-uuid');assert.equal(payload.idempotencyKey,undefined);
});
test('verified rate object and PascalCase nested tracking/labels are parsed, conflicting aliases rejected',()=>{
 assert.deepEqual(core.parseGtaRates({IsSuccess:true,Data:{Service:'Expedited Parcel',Cost:9.43,TaxAmount:null}}),[{service:'Expedited Parcel',cost:9.43,tax:null}]);
 assert.equal(core.parseGtaLabel({IsSuccess:true,Data:{LoadNumber:'LOAD1',Packages:[{TrackingNumber:['GTA10001'],LabelBase64:label}]}}).tracking,'GTA10001');
 assert.equal(core.parseGtaTracking({IsSuccess:true,Data:[{TrackingNumber:'GTA1',Status:'Delivered',StandardStatus:40,Events:[{Name:'Delivered',Location:'Toronto',EventDateTime:'date'}]}]},'GTA1').events[0].name,'Delivered');
 assert.throws(()=>core.parseGtaRates({IsSuccess:true,Data:{Cost:1,cost:2}}),/conflicting/);
});
test('warehouse induction uses local country for customs and preserves original shipment',()=>{
 const original={...shipment,sender_country_code:'NP',sender_name:'Original shipper'};
 const payload=core.buildGtaShipment(original,{...options,pickup:{name:'Warehouse',phone:'123',address:'Street',address2:'Unit 45',city:'Mississauga',state:'ON',postalCode:'L4W5C5',country:'CA'}});
 assert.equal(payload.fromCountry,'CA');assert.equal(payload.from,'Warehouse');assert.equal(payload.packages[0].items,undefined);assert.equal(original.sender_country_code,'NP');assert.equal(payload.fromEmail,undefined);assert.equal(payload.toEmail,undefined);
});
test('existing-label reprint is bounded authenticated GET and cannot create a shipment',async()=>{
 const old=global.fetch;let calls=0;
 try {global.fetch=async(url,opts)=>{calls++;assert.equal(url,server.gtaQaUrl+'/label/format?trackingNumber=GTA1&format=PDF');assert.equal(opts.body,undefined);assert.equal(opts.method,undefined);assert.equal(opts.redirect,'error');assert.equal(opts.headers['x-api-key'],'fixture-api');return new Response('%PDF-1.4 fixture');};assert.equal((await server.requestGtaReprint('GTA1','PDF',config)).subarray(0,5).toString(),'%PDF-');assert.equal(calls,1);
 global.fetch=async()=>new Response('<html>private</html>');await assert.rejects(server.requestGtaReprint('GTA1','PNG',config),/invalid label/);
 await assert.rejects(server.requestGtaReprint('bad/?','PDF',config),/Invalid saved/);
 global.fetch=async()=>new Response('',{status:500});await assert.rejects(server.requestGtaLabel({IdempotencyKey:'uuid'},config),/may already be stored/);
 }finally{global.fetch=old;}
});
test('unsigned callbacks yield only a bounded tracking/load hint, never trust event or PII fields',()=>{
 const {gtaWebhookHint}=loadTs('src/lib/gta-airskip-webhook.ts');
 assert.deepEqual(gtaWebhookHint({TrackingNumber:'GTA1',LoadNumber:'LOAD1',EventCode:40,ReceiverEmail:'private'}),{tracking:'GTA1',load:'LOAD1'});
 for(const value of [null,[],{TrackingNumber:'GTA1'},{TrackingNumber:'https://evil',LoadNumber:'LOAD1'}])assert.equal(gtaWebhookHint(value),null);
});

test('label recovery verifies tenant, environment and exact FastDrop reference; mismatches cannot save or create',async()=>{
 const keys=['GTA_AIRSKIP_ORGANIZATION_ID','GTA_AIRSKIP_ACCOUNT_KEY','GTA_AIRSKIP_API_KEY','GTA_AIRSKIP_BASE_URL'];const old=keys.map(k=>process.env[k]);
 const id='12345678-1234-1234-1234-123456789abc';let saves=0,reprints=0,reference='OTHER';
 const scope=[];
 const booking={id,status:'needs_review',base_url:server.gtaQaUrl,shipment_id:1,partner_tracking_number:null};
 const admin={from(table){const q={select(){return this;},eq(k,v){scope.push([table,k,v]);return this;},is(){return this;},update(){saves++;return this;},async maybeSingle(){return {data:table==='shipments'?{tracking_number:'FD10001'}:booking};}};return q;},async rpc(){return {error:null};}};
 const actions=loadTs('src/app/(portal)/courier-integrations/gta-airskip/actions.ts',{'next/cache':{revalidatePath(){}},'next/navigation':{unstable_rethrow(){}},'@/lib/auth':{async requireProfile(){return {id:'actor',organization_id:'org'};}},'@/lib/gta-airskip':core,'@/lib/gta-airskip-server':{...server,async requestGtaTrackingRecord(){return {Reference1:reference,LoadNumber:'LOAD1'};},async requestGtaReprint(){reprints++;return Buffer.from(label,'base64');},async requestGtaLabel(){throw new Error('Recovery must never create');}},'@/lib/supabase/admin':{createAdminClient(){return admin;}},'@/lib/supabase/server':{async createClient(){throw new Error('Unused during recovery');}}});
 try{process.env.GTA_AIRSKIP_ORGANIZATION_ID='org';process.env.GTA_AIRSKIP_ACCOUNT_KEY='key';process.env.GTA_AIRSKIP_API_KEY='api';process.env.GTA_AIRSKIP_BASE_URL=server.gtaQaUrl;
 const form=new FormData();form.set('booking_id',id);form.set('tracking','GTA1');assert.match((await actions.recoverGtaLabel({},form)).message,/does not match/);assert.equal(saves,0);assert.equal(reprints,0);
 reference='FD10001';assert.equal((await actions.recoverGtaLabel({},form)).status,'success');assert.equal(reprints,1);assert.equal(saves,1);assert.ok(scope.filter(x=>x[1]==='organization_id').every(x=>x[2]==='org'));
 }finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});
test('webhook ignores unknown bookings and cooldown duplicates; verified pulls replace no callback event values',async()=>{
 let pulls=0,claims=0;let booking=null;const updates=[];
 const admin={from(){return {select(){return this;},eq(){return this;},in(){return this;},is(){return this;},contains(){return this;},update(value){updates.push(value);claims++;return this;},async maybeSingle(){return {data:booking};},then(resolve){resolve({error:null});}};}};
 const route=loadTs('src/app/api/webhooks/gta-airskip/route.ts',{'@/lib/supabase/admin':{createAdminClient(){return admin;}},'@/lib/gta-airskip-server':{gtaProductionUrl:server.gtaProductionUrl,getGtaConfig(){return {...config,baseUrl:server.gtaProductionUrl,test:false};},async requestGtaTracking(){pulls++;return {status:'Created',standardStatus:10,date:'date',events:[]};}},'@/lib/gta-airskip-webhook':loadTs('src/lib/gta-airskip-webhook.ts')});
 const req=()=>new Request('https://app.example/api/webhooks/gta-airskip',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({TrackingNumber:'GTA1',LoadNumber:'LOAD1',EventStatus:'Delivered',ReceiverEmail:'private'})});
 assert.equal((await route.POST(req())).status,202);assert.equal(pulls,0);assert.equal(claims,0);
 booking={id:'uuid',response_metadata:{webhookPullAttempt:new Date().toISOString()}};await route.POST(req());assert.equal(pulls,0);
 booking={id:'uuid',response_metadata:{cost:10}};await route.POST(req());assert.equal(pulls,1);assert.equal(updates.at(-1).response_metadata.tracking.status,'Created');assert.equal(JSON.stringify(updates).includes('private'),false);assert.equal(updates.at(-1).response_metadata.cost,10);
});

test('all authorized sender terminals are sent together in rate and label requests', async()=>{
 const old=global.fetch, calls=[];
 global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return new Response(JSON.stringify(response));};
 try {
  for(const terminal of ['ONDM','MISS2','MISSF','BRA',core.gtaSenderTerminals]){
   const payload=core.buildGtaShipment(shipment,{...options,terminal},'persisted-uuid');
   await server.requestGtaRates(payload,config);await server.requestGtaLabel(payload,config);
  }
  assert.equal(calls.length,10);
  for(const call of calls){assert.equal(call.body.fromTerminal,'ONDM,MISS2,MISSF,BRA');assert.equal(call.body.IdempotencyKey,'persisted-uuid');}
  assert.throws(()=>core.buildGtaShipment(shipment,{...options,terminal:'ONDM,BAD'}),/sender terminals/);
 } finally {global.fetch=old;}
});
test('confirmed GTA drop-off address is used without changing the original sender',()=>{
 const original={...shipment,sender_country_code:'NP'}, before={...original};
 const pickup={name:'GTA AIRSKIP LTD',phone:'',address:'2710 Britannia Road East',address2:'Cargo 2, Entrance 6',city:'Mississauga',state:'ON',postalCode:'L4W 2P7',country:'CA'};
 const payload=core.buildGtaShipment(original,{...options,pickup});
 assert.equal(payload.from,pickup.name);assert.equal(payload.fromAddress1,pickup.address);assert.equal(payload.fromAddress2,pickup.address2);
 assert.equal(payload.fromCity,'Mississauga');assert.equal(payload.fromState,'ON');assert.equal(payload.fromPostalCode,'L4W 2P7');assert.equal(payload.fromCountry,'CA');assert.deepEqual(original,before);
});
