const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(filename, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = new Module(path.resolve(filename));
  m.filename = path.resolve(filename);
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  const original = m.require.bind(m);
  m.require = (name) => Object.hasOwn(imports, name) ? imports[name] : original(name);
  m._compile(source, m.filename);
  return m.exports;
}
const core = loadTs('src/lib/broadreach.ts');
const server = loadTs('src/lib/broadreach-server.ts', { 'server-only': {}, '@/lib/broadreach': core });
const shipment = {
  tracking_number: 'FD10001', pieces: 1, weight_kg: 2, payment_type: 'prepaid', cod_amount: 0,
  sender_name: 'Sender', sender_address: '1 Street', sender_city: 'Toronto', sender_state_province: 'ON', sender_postal_code: 'M5V 1A1', sender_country_code: 'CA',
  consignee_name: 'Receiver', consignee_address: '2 Street', consignee_city: 'Toronto', consignee_state_province: 'ON', consignee_postal_code: 'M5V 1A1', consignee_country_code: 'CA',
};
const options = { test: true, currency: 'CAD', items: [{ description: 'Shirt', qty: 2, unit: 'pc', value: 12.5, sku: 'SHIRT', origin: 'CN', hscode: '6109100012' }] };
const response = { shipmentresponse: { tracknbr: 'PARTNER1001', label: Buffer.from('%PDF-1.4\nexample').toString('base64'), labelformat: 'pdf', service: 'ca_rateshop', carrier: 'Example' } };

test('destination selects the exact rate-shop code, keeps tenant AWB reference and uses kg/cm', () => {
  const ca = core.buildBroadReachShipment(shipment, 'account', options).shipment;
  assert.equal(ca.service, 'ca_rateshop'); assert.equal(ca.reference, 'FD10001');
  assert.equal(ca.uom, 'kg'); assert.equal(ca.dimunit, 'cm'); assert.equal(ca.weight, 2); assert.equal(ca.value, 25); assert.equal(ca.test, 1);
  const us = core.buildBroadReachShipment({ ...shipment, consignee_country_code: 'US', consignee_state_province: 'WA', consignee_postal_code: '98230' }, 'account', { ...options, test: false }).shipment;
  assert.equal(us.service, 'us_rateshop'); assert.equal(us.test, 0);
});

test('connection checks send rates only and safely classify rejected credentials and provider errors', async () => {
  const saved = global.fetch;
  const config = { username: 'user', password: 'pass', account: 'account', liveEnabled: false };
  const payload = { rateshipment: { account: 'account', service: 'ca_rateshop', weight: 2, uom: 'kg' } };
  try {
    global.fetch = async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), payload);
      assert.equal(Object.hasOwn(JSON.parse(init.body), 'shipment'), false);
      return Response.json({ rateshipmentresponse: [{ service: 'ca_rateshop', rate: '12.50' }] });
    };
    assert.equal(await server.requestBroadReachRates(payload, config), 1);
    for (const [status, body, reason] of [
      [401, { error: 'private data' }, 'credentials_rejected'],
      [403, { error: 'private data' }, 'access_rejected'],
      [200, { errorresponse: 'invalid account private data' }, 'account_rejected'],
      [200, { errorresponse: 'invalid password private data' }, 'credentials_rejected'],
      [200, { rateshipmentresponse: [] }, 'no_rates'],
    ]) {
      global.fetch = async () => Response.json(body, { status });
      await assert.rejects(server.requestBroadReachRates(payload, config), issue => {
        const safe = server.safeBroadReachError(issue);
        assert.equal(safe.diagnostic.reason, reason);
        assert.equal(safe.diagnostic.httpStatus, status);
        assert.doesNotMatch(JSON.stringify(safe), /private data|user:pass/);
        return true;
      });
    }
    global.fetch = async () => new Response('<html>private data</html>');
    await assert.rejects(server.requestBroadReachRates(payload, config), issue => server.safeBroadReachError(issue).diagnostic.reason === 'invalid_json');
    global.fetch = async () => Response.json({ shipmentresponse: { tracknbr: '123' } });
    await assert.rejects(server.requestBroadReachLabel(core.buildBroadReachShipment(shipment, 'account', options), config), issue => server.safeBroadReachError(issue).diagnostic.reason === 'invalid_label');
    assert.doesNotMatch(JSON.stringify(server.safeBroadReachError(new Error('password secret'))), /password secret/);
  } finally { global.fetch = saved; }
});
test('unsafe or incomplete bookings fail before the carrier request', () => {
  for (const change of [{ pieces: 2 }, { weight_kg: 0 }, { consignee_country_code: 'AE' }, { sender_postal_code: '' }, { payment_type: 'cod', cod_amount: 20 }]) assert.throws(() => core.buildBroadReachShipment({ ...shipment, ...change }, 'account', options));
  assert.throws(() => core.buildBroadReachShipment({ ...shipment, consignee_country_code: 'US' }, 'account', { ...options, items: [{ description: 'Shirt', qty: 1, unit: 'pc', value: 5 }] }), /HS code/);
  assert.throws(() => core.buildBroadReachShipment(shipment, 'account', { ...options, dimensions: { length: 1, width: 0, height: 2 } }));
});

test('provider references preserve values and enforce the confirmed 35-character limit', () => {
  const result = core.buildBroadReachShipment({ ...shipment, tracking_number: 'A'.repeat(35), reference_number: '  ORDER001  ' }, '1384', options).shipment;
  assert.equal(result.account, '1384'); assert.equal(result.reference, 'A'.repeat(35)); assert.equal(result.reference2, 'ORDER001');
  for (const change of [{ tracking_number: 'A'.repeat(36) }, { reference_number: 'B'.repeat(36) }]) assert.throws(() => core.buildBroadReachShipment({ ...shipment, ...change }, '1384', options), /35 characters/);
});
test('carrier label responses reject missing tracking, malformed base64 and mislabeled documents', () => {
  assert.equal(core.parseBroadReachResponse(response).tracking, 'PARTNER1001');
  for (const change of [{ tracknbr: '' }, { label: 'bad!!!' }, { labelformat: 'html' }, { label: Buffer.from('<html>').toString('base64') }]) assert.throws(() => core.parseBroadReachResponse({ shipmentresponse: { ...response.shipmentresponse, ...change } }));
});
test('credentials are available only to the configured tenant and live is disabled by default', () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { BROADREACH_ORGANIZATION_ID: 'tenant', BROADREACH_USERNAME: 'username', BROADREACH_PASSWORD: 'password', BROADREACH_ACCOUNT: 'account', BROADREACH_LIVE_ENABLED: 'false' });
    assert.equal(server.getBroadReachConfig('other-tenant'), null); assert.equal(server.getBroadReachConfig(null), null);
    assert.equal(server.getBroadReachConfig('tenant').liveEnabled, false);
    process.env.BROADREACH_USERNAME = 'invalid:name'; assert.equal(server.getBroadReachConfig('tenant'), null);
  } finally { process.env = saved; }
});
test('transport sends Basic auth and required headers once, without redirect or cache', async () => {
  const saved = global.fetch; let calls = 0;
  try {
    global.fetch = async (url, init) => {
      calls++; assert.equal(url, 'https://shipping-api.brdrch.com/api/v1'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
      assert.equal(init.headers['X-Requested-With'], 'XMLHttpRequest'); assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('user:pass').toString('base64'));
      return Response.json(response);
    };
    await server.requestBroadReachLabel(core.buildBroadReachShipment(shipment, 'account', options), { username: 'user', password: 'pass', account: 'account', liveEnabled: false });
    assert.equal(calls, 1);
    global.fetch = async () => { calls++; throw new Error('timeout'); };
    await assert.rejects(server.requestBroadReachLabel(core.buildBroadReachShipment(shipment, 'account', options), { username: 'user', password: 'pass', account: 'account', liveEnabled: false }));
    assert.equal(calls, 2);
  } finally { global.fetch = saved; }
});
