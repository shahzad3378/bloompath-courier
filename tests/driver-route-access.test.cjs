const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const roles = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/roles.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,roles);
let role = 'super_admin';
const context = {exports: {}, URL, require: name => {
 if(name==='@/lib/roles') return roles.exports;
 if(name==='@/lib/env') return {hasSupabaseEnv:()=>true,getSupabaseEnv:()=>({url:'https://example.invalid',publishableKey:'test-public'})};
 if(name==='next/server') return {NextResponse:{next:()=>({type:'next',headers:{set(){}}}),redirect:url=>({type:'redirect',url:String(url)})}};
 if(name==='@supabase/ssr') return {createServerClient:()=>({auth:{getClaims:async()=>({data:{claims:{sub:role?'driver-test':null}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:'driver-test',role,status:'active'}})})})};
 throw new Error('Unexpected module: '+name);
}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/supabase/proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
async function visit(path,as){role=as;const url='https://example.invalid'+path;const nextUrl=new URL(url);nextUrl.clone=()=>new URL(url);return context.exports.updateSession({url,nextUrl,cookies:{getAll:()=>[]}})}
(async()=>{
 for(const as of ['super_admin','operations_admin','dispatcher','customer_service']) assert.equal((await visit('/driver-support',as)).type,'next');
 assert.equal(new URL((await visit('/driver-support','driver')).url).pathname,'/driver');
 assert.equal(new URL((await visit('/driver-support','shipper')).url).pathname,'/shipper');
 assert.equal(new URL((await visit('/driver-support',null)).url).pathname,'/login');
 assert.equal((await visit('/driver','driver')).type,'next');
 assert.equal((await visit('/driver/deliveries/1','driver')).type,'next');
 assert.equal(new URL((await visit('/driver/deliveries/1','super_admin')).url).pathname,'/dashboard');
 console.log('Driver/support path boundaries and anonymous/non-staff redirect checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
