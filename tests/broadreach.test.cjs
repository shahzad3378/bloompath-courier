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
const bulk = loadTs('src/lib/broadreach-bulk.ts');
const bulkParser = loadTs('src/lib/broadreach-bulk-parser.ts', { '@/lib/broadreach-bulk': bulk });
const shipment = {
  tracking_number: 'FD10001', pieces: 1, weight_kg: 2, payment_type: 'prepaid', cod_amount: 0,
  sender_name: 'Sender', sender_address: '1 Street', sender_city: 'Toronto', sender_state_province: 'ON', sender_postal_code: 'M5V 1A1', sender_country_code: 'CA',
  consignee_name: 'Receiver', consignee_address: '2 Street', consignee_city: 'Toronto', consignee_state_province: 'ON', consignee_postal_code: 'M5V 1A1', consignee_country_code: 'CA',
};
const options = { test: true, currency: 'CAD', items: [{ description: 'Shirt', qty: 2, unit: 'pc', value: 12.5, sku: 'SHIRT', origin: 'CN', hscode: '6109100012' }] };
const fastDropSender = { name: 'Fast Drop Worldwide Logistics Inc.', phone: '+14383081520', address: '5004 Timberlea Rd', address2: 'Unit 45', city: 'Mississauga', state: 'ON', postalCode: 'L4W5C5', country: 'CA' };
const response = { shipmentresponse: { tracknbr: 'PARTNER1001', label: Buffer.from('%PDF-1.4\nexample').toString('base64'), labelformat: 'pdf', service: 'ca_rateshop', carrier: 'Example' } };

test('destination selects the exact rate-shop code, keeps tenant AWB reference and uses kg/cm', () => {
  const ca = core.buildBroadReachShipment(shipment, 'account', options).shipment;
  assert.equal(ca.service, 'ca_rateshop'); assert.equal(ca.reference, 'FD10001');
  assert.equal(ca.weightUnit, 'kg'); assert.equal(ca.dimUnit, 'cm'); assert.equal(ca.weight, 2); assert.equal(ca.value, 25); assert.equal(ca.test, 1);
  assert.equal(ca.pieces, 1); assert.equal(ca.shipper.address1, '1 Street'); assert.equal(ca.consignee.province, 'ON'); assert.equal(ca.consignee.postalCode, 'M5V 1A1');
  assert.equal(ca.uom, undefined); assert.equal(ca.shipper.addr1, undefined);
  const fastDrop = core.buildBroadReachShipment(shipment, '1384', { ...options, sender: fastDropSender }).shipment;
  assert.equal(fastDrop.shipper.name, 'Fast Drop Worldwide Logistics Inc.');
  assert.equal(fastDrop.shipper.address1, '5004 Timberlea Rd');
  assert.equal(fastDrop.shipper.province, 'ON');
  assert.equal(fastDrop.consignee.address1, '2 Street');
  const us = core.buildBroadReachShipment({ ...shipment, consignee_country_code: 'US', consignee_state_province: 'WA', consignee_postal_code: '98230' }, 'account', { ...options, test: false }).shipment;
  assert.equal(us.service, 'us_rateshop'); assert.equal(us.test, 0);
});

test('A2 rates contract uses nested consignee and parses services/total with empty errors', async () => {
  const saved = global.fetch;
  try {
    const payload = core.buildBroadReachRates(shipment, '1384', fastDropSender);
    assert.deepEqual(payload, { rateshipment: { account: '1384', weight: 2, weightUnit: 'kg', pieces: 1, dimUnit: 'cm', shipper: { name: 'Fast Drop Worldwide Logistics Inc.', company: 'Fast Drop Worldwide Logistics Inc.', address1: '5004 Timberlea Rd', address2: 'Unit 45', city: 'Mississauga', province: 'ON', postalCode: 'L4W5C5', country: 'CA', phone: '+14383081520' }, consignee: { country: 'CA', postalCode: 'M5V1A1', province: 'ON' } } });
    global.fetch = async (_url, init) => { assert.deepEqual(JSON.parse(init.body), payload); return Response.json({ rateshipmentresponse: { services: [{ service: 'USPS_GROUND_ADVANTAGE', total: 12.5 }], errors: [] }, errors: [] }); };
    assert.equal(await server.requestBroadReachRates(payload, { username: 'user', password: 'pass', account: '1384' }), 1);
    global.fetch = async () => Response.json({ rateshipmentresponse: { services: [], errors: ['Account is unavailable'] } });
    await assert.rejects(server.requestBroadReachRates(payload, { username: 'user', password: 'pass', account: '1384' }), issue => issue.diagnostic.reason === 'account_rejected');
  } finally { global.fetch = saved; }
});

test('A2 tracking/label response aliases retain service and numeric cost; raw ZPL is supported', () => {
  const result = core.parseBroadReachResponse({ shipmentresponse: { trackingNumber: 'A2TRACK', label: response.shipmentresponse.label, labelFormat: 'PDF', serviceLevel: 'USPS_GROUND_ADVANTAGE', totalCost: 12.5 } });
  assert.equal(result.tracking, 'A2TRACK'); assert.equal(result.service, 'USPS_GROUND_ADVANTAGE'); assert.equal(result.rate, '12.5');
  const zpl = core.parseBroadReachResponse({ shipmentresponse: { trackingNumber: 'ZPLTRACK', label: '^XA\n^FO10,10^FDExample^FS\n^XZ' } });
  assert.equal(zpl.format, 'zpl'); assert.match(Buffer.from(zpl.label, 'base64').toString(), /^\^XA/);
});

test('label URL downloads are bounded and credentials never reach another host or redirect', async () => {
  const saved = global.fetch, hosts = process.env.BROADREACH_LABEL_HOSTS;
  const config = { username: 'user', password: 'pass', account: '1384' };
  const payload = core.buildBroadReachShipment(shipment, '1384', options);
  try {
    let calls = 0;
    global.fetch = async (_url, init) => { calls++; return Response.json({ shipmentresponse: { trackingNumber: 'CREATED1', labelUrl: 'http://127.0.0.1/private' } }); };
    await assert.rejects(server.requestBroadReachLabel(payload, config), issue => issue.diagnostic.reason === 'label_host_rejected' && issue.tracking === 'CREATED1'); assert.equal(calls, 1);
    process.env.BROADREACH_LABEL_HOSTS = 'labels.example.com';
    global.fetch = async (url, init) => {
      if (init.method === 'POST') return Response.json({ shipmentresponse: { trackingNumber: 'CREATED2', labelUrl: 'https://labels.example.com/label.pdf', serviceLevel: 'TEST' } });
      assert.equal(url, 'https://labels.example.com/label.pdf'); assert.equal(init.headers.Authorization, undefined); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
      return new Response('%PDF-1.4 example', { headers: { 'Content-Type': 'application/pdf' } });
    };
    assert.equal((await server.requestBroadReachLabel(payload, config)).tracking, 'CREATED2');
    global.fetch = async (_url, init) => init.method === 'POST' ? Response.json({ shipmentresponse: { trackingNumber: 'CREATED3', documents: [{ type: 'shipping_label', url: 'https://shipping-api.brdrch.com/labels/3', format: 'PDF' }] } }) : (assert.ok(init.headers.Authorization), new Response('%PDF-1.4 example'));
    assert.equal((await server.requestBroadReachLabel(payload, config)).tracking, 'CREATED3');
    global.fetch = async (_url, init) => init.method === 'POST' ? Response.json({ shipmentresponse: { trackingNumber: 'CREATED4', labelUrl: 'https://labels.example.com/label.pdf' } }) : new Response('private data', { status: 403 });
    await assert.rejects(server.requestBroadReachLabel(payload, config), issue => issue.tracking === 'CREATED4' && issue.diagnostic.reason === 'label_download_failed');
    global.fetch = async (_url, init) => init.method === 'POST' ? Response.json({ shipmentresponse: { trackingNumber: 'CREATED5', labelUrl: 'https://labels.example.com/label.pdf' } }) : new Response(new Uint8Array(3 * 1024 * 1024 + 1));
    await assert.rejects(server.requestBroadReachLabel(payload, config), issue => issue.tracking === 'CREATED5' && issue.diagnostic.reason === 'response_too_large');
  } finally { global.fetch = saved; if (hosts === undefined) delete process.env.BROADREACH_LABEL_HOSTS; else process.env.BROADREACH_LABEL_HOSTS = hosts; }
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

const itemRow = (awb, changes = {}) => {
  const values = { awb, currency: 'CAD', description: 'Shirt', qty: '1', value: '12.50', sku: '', origin: '', hscode: '', length: '', width: '', height: '', ...changes };
  return bulk.broadReachBulkHeaders.map(header => values[header]);
};
test('bulk groups content rows into one parcel and validates domestic/cross-border customs', () => {
  const parcels = bulkParser.parseBroadReachBulkRows([bulk.broadReachBulkHeaders, itemRow('FD10001'), itemRow('FD10001', { description: 'Book' }), itemRow('FD10002')]);
  assert.equal(parcels.length, 2); assert.deepEqual(parcels[0].rows, [2, 3]); assert.equal(parcels[0].options.items.length, 2);
  assert.equal(core.buildBroadReachShipment(shipment, '1384', { ...parcels[0].options, test: true }).shipment.value, 25);
  const usShipment = { ...shipment, consignee_country_code: 'US', consignee_state_province: 'WA', consignee_postal_code: '98230' };
  assert.throws(() => core.buildBroadReachShipment(usShipment, '1384', { ...parcels[0].options, test: true }), /HS code/);
  const crossBorder = bulkParser.parseBroadReachBulkRows([bulk.broadReachBulkHeaders, itemRow('FD10001', { sku: 'SHIRT', origin: 'CN', hscode: '0109100012' })]);
  assert.equal(core.buildBroadReachShipment(usShipment, '1384', { ...crossBorder[0].options, test: false }).shipment.item[0].hscode, '0109100012');
  for (const rows of [
    [bulk.broadReachBulkHeaders.slice(1), itemRow('FD1')],
    [bulk.broadReachBulkHeaders, itemRow('FD1'), itemRow('FD1', { currency: 'USD' })],
    [bulk.broadReachBulkHeaders, ...Array.from({ length: 101 }, (_, i) => itemRow('FD' + i))],
    [bulk.broadReachBulkHeaders],
  ]) assert.throws(() => bulkParser.parseBroadReachBulkRows(rows));
});

test('bulk books sequentially once, reports partial results and halts on carrier uncertainty', async () => {
  const parcels = bulkParser.parseBroadReachBulkRows([bulk.broadReachBulkHeaders, itemRow('FD1'), itemRow('FD2'), itemRow('FD3')]);
  const calls = [], updates = []; let concurrent = 0;
  const outcome = await bulk.processBroadReachBatch(parcels, 'live', true, async form => {
    assert.equal(++concurrent, 1); assert.equal(form.get('confirm_live'), 'on'); assert.equal(form.get('mode'), 'live');
    calls.push(form.get('awb')); await Promise.resolve(); concurrent--;
    return calls.length === 1 ? { status: 'success', bookingId: 'saved', tracking: 'TRACK1', message: 'Saved' } : { status: 'error', message: '401', haltBatch: true };
  }, (index, result) => updates.push({ index, ...result }), () => false);
  assert.equal(outcome, 'stopped'); assert.deepEqual(calls, ['FD1', 'FD2']);
  assert.deepEqual(updates.map(row => row.status), ['processing', 'success', 'processing', 'error']);
  let requests = 0;
  assert.equal(await bulk.processBroadReachBatch(parcels, 'test', false, async () => { requests++; throw Error('offline'); }, () => {}, () => false), 'stopped');
  assert.equal(requests, 1);
  assert.equal(await bulk.processBroadReachBatch(parcels, 'test', false, async () => { throw Error('must not send'); }, () => {}, () => true), 'stopped');
});

test('bulk preview stays tenant-scoped and never calls the carrier or reserves a booking', async () => {
  let authenticated = true, requestedTenant;
  const previewAction = loadTs('src/app/(portal)/courier-integrations/broadreach/bulk-actions.ts', {
    '@/lib/auth': { requireProfile: async roles => { assert.ok(roles.includes('dispatcher')); if (!authenticated) throw Error('denied'); return { organization_id: 'tenant' }; } },
    '@/lib/broadreach': core, '@/lib/broadreach-bulk': bulk, '@/lib/broadreach-bulk-parser': bulkParser,
    '@/lib/broadreach-server': { getBroadReachConfig: () => ({ account: '1384' }), getBroadReachSender: () => fastDropSender },
    '@/lib/bulk-shipments': { readBulkFileRows: async () => [bulk.broadReachBulkHeaders, itemRow('FD10001'), itemRow('FD_UNKNOWN')] },
    '@/lib/supabase/server': { createClient: async () => ({ from: table => {
      assert.equal(table, 'shipments');
      const query = { select: () => query, eq: (name, value) => { assert.equal(name, 'organization_id'); requestedTenant = value; return query; }, in: () => query, is: async () => ({ data: [shipment], error: null }) };
      return query;
    } }) },
  });
  const form = new FormData(); form.set('file', new File(['example'], 'batch.csv'));
  const result = await previewAction.previewBroadReachBulk({ status: 'idle', message: '', rows: [] }, form);
  assert.equal(requestedTenant, 'tenant'); assert.deepEqual(result.rows.map(row => row.status), ['ready', 'invalid']);
  assert.match(result.rows[1].message, /not found/);
  authenticated = false;
  await assert.rejects(previewAction.previewBroadReachBulk({}, form), /denied/);
});

test('result CSV neutralizes spreadsheet formulas and preserves tracking plus recovery detail', () => {
  const csv = bulk.broadReachResultsCsv([{ awb: '=1+1', rows: [2, 3], status: 'error', message: 'Review "booking"', tracking: 'TRACK1' }]);
  assert.match(csv, /"'=1\+1"/); assert.match(csv, /"2 \/ 3"/); assert.match(csv, /Review ""booking""/); assert.match(csv, /TRACK1/);
});

test('shared upload reader accepts quoted CSV and XLSX content without losing text HS codes', async () => {
  const fileReader = loadTs('src/lib/bulk-shipments.ts', { '@/lib/shipments': loadTs('src/lib/shipments.ts') });
  const csv = await fileReader.readBulkFileRows(new File(['awb,description\r\nFD1,"Shirt, cotton"'], 'contents.csv'));
  assert.deepEqual(csv[1], ['FD1', 'Shirt, cotton']);
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Bulk Upload');
  sheet.addRow(bulk.broadReachBulkHeaders); sheet.addRow(itemRow('FD1', { sku: 'SKU', origin: 'CN', hscode: '0109100012' }));
  const rows = await fileReader.readBulkFileRows(new File([await workbook.xlsx.writeBuffer()], 'contents.xlsx'));
  assert.equal(bulkParser.parseBroadReachBulkRows(rows)[0].options.items[0].hscode, '0109100012');
});

test('server booking enforces live activation and explicit charge confirmation before database access', async () => {
  const action = loadTs('src/app/(portal)/courier-integrations/broadreach/actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    '@/lib/auth': { requireProfile: async () => ({ organization_id: 'tenant' }) },
    '@/lib/broadreach': core,
    '@/lib/broadreach-server': { getBroadReachConfig: () => ({ liveEnabled: false }) },
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('must not reach database'); } },
    '@/lib/supabase/server': { createClient: () => { throw Error('must not reach database'); } },
  });
  const form = new FormData(); form.set('mode', 'live'); form.set('confirm_live', 'on');
  const result = await action.generateBroadReachAwb({}, form);
  assert.equal(result.status, 'error'); assert.match(result.message, /Live booking must be enabled/);
});
