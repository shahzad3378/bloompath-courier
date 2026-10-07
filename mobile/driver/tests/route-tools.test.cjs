const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');const ts=require('typescript');
const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/route-tools.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);const api=context.exports;
assert.equal(api.validPoint(null,55),false);assert.equal(api.validPoint(NaN,55),false);assert.equal(api.validPoint(0,0),false);assert.equal(api.validPoint(-33.8,151.2),true);
const route=[{id:1,latitude:25,longitude:55},{id:2,latitude:25,longitude:57},{id:3,latitude:25,longitude:55.1}];assert.equal(api.suggestOrder(route)[1].id,3);assert.equal(route[1].id,2);
assert.ok(api.distance({id:1,latitude:0,longitude:179.9},{id:2,latitude:0,longitude:-179.9})<30);
const address='10 Road & City?';assert.equal(new URL(api.navigationUrl(address)).searchParams.get('destination'),address);
const html=api.mapHtml([{id:1,latitude:25,longitude:55,awb:'</script><script>alert(1)</script>'}],{js:'',css:''});assert.ok(!html.includes('awb":"</script>'));assert.ok(html.includes('label.textContent=p.awb'));
console.log('Route coordinate validation, nearest-stop suggestion, source immutability, navigation encoding and map injection checks passed');
