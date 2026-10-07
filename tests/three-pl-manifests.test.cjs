const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(file, imports) {
 const m = new Module(path.resolve(file)); m.filename=path.resolve(file);m.paths=Module._nodeModulePaths(path.dirname(m.filename));m.require=(n)=>imports[n];
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m.filename);return m.exports;
}
const helper=load('src/lib/three-pl-manifests.ts',{});
const id='cc0387b0-8a30-4ce1-9a07-1b2f2768feac',carrier='2e0387b0-8a30-4ce1-9a07-1b2f2768feac';
function setup({deny=false,org='org',error=null}={}){
 const calls=[],paths=[]; const actions=load('src/app/(portal)/dispatch/3pl/manifests/actions.ts',{
 'next/cache':{revalidatePath:(p)=>paths.push(p)},'next/navigation':{redirect:(p)=>{throw Error('REDIRECT '+p)}},
 '@/lib/auth':{requireProfile:async(roles)=>{assert.deepEqual(roles,helper.manifestRoles);if(deny)throw Error('denied');return {id:'actor',organization_id:org}}},
 '@/lib/three-pl-manifests':helper,'@/lib/supabase/server':{createClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:id,error}}})}
 });const form=new FormData();form.set('request_id',id);form.set('carrier_id',carrier);form.set('awbs',' fd1001\nFD1002, fd1001 ');form.set('manifest_id',id);return {actions,form,calls,paths};
}
test('AWBs are normalized/deduplicated; creation uses one atomic RPC and existing request ID',async()=>{const s=setup();s.form.append('tracking_number','FD1002');await assert.rejects(s.actions.createThreePLManifestAction({},s.form),/REDIRECT/);assert.equal(s.calls.length,1);assert.deepEqual(s.calls[0].args.p_awbs,['FD1002','FD1001']);assert.equal(s.calls[0].args.p_id,id);assert.equal(s.calls[0].args.p_operation,'create');assert.ok(s.paths.includes('/warehouse'));});
test('missing tenant and invalid/oversized input never call DB',async()=>{for(const change of [s=>s.form.set('carrier_id','invalid'),s=>s.form.set('awbs','bad!'),s=>s.form.set('awbs',Array.from({length:501},(_,n)=>'FD'+(1000+n)).join('\n')),s=>s.form.set('notes','x'.repeat(1001))]){const s=setup();change(s);assert.equal((await s.actions.createThreePLManifestAction({},s.form)).status,'error');assert.equal(s.calls.length,0);}const s=setup({org:null});assert.equal((await s.actions.createThreePLManifestAction({},s.form)).status,'error');assert.equal(s.calls.length,0)});
test('confirm requires physical acknowledgement and receiver; both operations are server-authorized',async()=>{const s=setup();s.form.set('operation','confirm');assert.equal((await s.actions.changeThreePLManifestAction({},s.form)).status,'error');s.form.set('acknowledge','yes');assert.equal((await s.actions.changeThreePLManifestAction({},s.form)).status,'error');assert.equal(s.calls.length,0);s.form.set('receiver_name','Test Receiver');assert.equal((await s.actions.changeThreePLManifestAction({},s.form)).status,'success');assert.equal(s.calls[0].args.p_receiver,'Test Receiver');const denied=setup({deny:true});await assert.rejects(denied.actions.changeThreePLManifestAction({},denied.form),/denied/);assert.equal(denied.calls.length,0)});
test('cancel is explicit; invalid operations are rejected; errors never claim success or leak DB internals',async()=>{const s=setup();s.form.set('operation','cancel');s.form.set('acknowledge','yes');assert.equal((await s.actions.changeThreePLManifestAction({},s.form)).status,'success');assert.equal(s.calls[0].args.p_operation,'cancel');const failed=setup({error:{message:'relation secret_internal missing'}});assert.equal((await failed.actions.createThreePLManifestAction({},failed.form)).status,'error');assert.ok(!(await failed.actions.createThreePLManifestAction({},failed.form)).message.includes('secret_internal'));assert.deepEqual(failed.paths,[]);const invalid=setup();invalid.form.set('operation','delete');assert.equal((await invalid.actions.changeThreePLManifestAction({},invalid.form)).status,'error');assert.equal(invalid.calls.length,0)});
