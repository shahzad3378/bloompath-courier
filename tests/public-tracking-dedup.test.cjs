const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

test('public tracking keeps one original booking and restores the latest delivered status', async () => {
  const file = 'src/app/api/public-tracking/route.ts';
  const m = new Module(path.resolve(file));
  m.filename = path.resolve(file);
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  m.require = (name) => {
    if (name === '@/lib/env') return { getSupabaseEnv: () => ({ url: 'https://supabase.example', publishableKey: 'public-key' }) };
    if (name === '@/lib/public-awb-tracking') return { findPublicAwbTracking: async () => null };
    return require(name);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, m.filename);
  const originalFetch = global.fetch;
  global.fetch = async () => Response.json({
    trackingNumber: 'FD260101100005490', currentStatus: 'Shipment booked', updatedAt: '2026-10-25T16:04:00Z',
    events: [
      { status: 'Delivered', timestamp: '2026-10-21T01:28:00Z' },
      { status: 'Out for delivery', timestamp: '2026-10-21T00:17:00Z' },
      { status: 'Shipment booked', timestamp: '2026-10-25T16:04:00Z' },
      { status: 'Shipment booked', timestamp: '2026-10-12T00:37:00Z' },
    ],
  });
  try {
    const response = await m.exports.POST(new Request('https://app.example/api/public-tracking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trackingNumber: 'FD260101100005490' }) }));
    const result = await response.json();
    assert.equal(result.currentStatus, 'Delivered');
    assert.equal(result.events.filter((event) => /^(shipment\s+)?booked$/i.test(event.status)).length, 1);
    assert.equal(result.events.at(-1).timestamp, '2026-10-12T00:37:00Z');
  } finally { global.fetch = originalFetch; }
});

test('public tracking looks up exact AWBs across shippers and keeps history tenant-scoped', async () => {
  function load(file, imports) {
    const filename = path.resolve(file);
    const m = new Module(filename);
    m.filename = filename;
    m.require = (name) => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency ${name}`);
      return imports[name];
    };
    m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename);
    return m.exports;
  }

  const createdAt = '2026-11-22T01:00:00Z';
  const failedAt = '2026-11-22T02:00:00Z';
  const warehouseAt = '2026-11-22T03:00:00Z';
  const queries = [];
  const shipments = new Map([
    ['BP26112210005716', { id: 1, organization_id: 'tenant-1', tracking_number: 'BP26112210005716', consignee_country_code: 'AE' }],
    ['NEW-REGION-123', { id: 2, organization_id: 'tenant-2', tracking_number: 'NEW-REGION-123', consignee_country_code: 'GB' }],
  ]);
  const admin = {
    from(table) {
      const filters = {};
      queries.push({ table, filters });
      const query = {
        select: () => query,
        eq(column, value) { filters[column] = value; return query; },
        is(column, value) { filters[column] = value; return query; },
        order: () => query,
        limit: async () => ({ data: filters.shipment_id === 1
          ? [{ status: 'at_warehouse', created_at: warehouseAt }, { status: 'undelivered', created_at: failedAt }]
          : [{ status: 'booked', created_at: createdAt }] }),
        in: async (column, values) => {
          filters[column] = values;
          return { data: [{ created_at: failedAt, undelivered_reason: 'customer_unavailable' }] };
        },
        maybeSingle: async () => {
          const shipment = shipments.get(filters.tracking_number);
          return { data: shipment ? { ...shipment, status: 'booked', created_at: createdAt } : null };
        },
      };
      return query;
    },
  };
  const awb = load('src/lib/public-awb-tracking.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/dispatch': load('src/lib/dispatch.ts', {}),
    '@/lib/customer-tracking': { customerEventLabel: (status) => ({ at_warehouse: 'At warehouse', undelivered: 'Undelivered' })[status], customerStatusLabel: (shipment) => shipment.id === 1 ? 'At warehouse' : 'Booked' },
  });
  const { POST } = load('src/app/api/public-tracking/route.ts', {
    '@/lib/public-awb-tracking': awb,
    '@/lib/env': { getSupabaseEnv: () => assert.fail('Exact AWBs should resolve before the reference fallback') },
  });
  for (const [trackingNumber, shipment] of shipments) {
    const response = await POST(new Request('https://app.example/api/public-tracking', {
      method: 'POST',
      body: JSON.stringify({ trackingNumber: trackingNumber.toLowerCase() }),
    }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.trackingNumber, trackingNumber);
    const failed = shipment.id === 1;
    assert.equal(result.currentStatus, failed ? 'At warehouse' : 'Shipment booked');
    assert.equal(result.currentReason, undefined);
    assert.deepEqual(result.events, [
      ...(failed ? [
        { status: 'At warehouse', timestamp: warehouseAt },
        { status: 'Undelivered', timestamp: failedAt, reason: 'Customer unavailable' },
      ] : []),
      { status: 'Shipment booked', timestamp: createdAt },
    ]);
    assert.equal(result.timeZone, shipment.consignee_country_code === 'AE' ? 'Asia/Dubai' : undefined);
    assert.deepEqual(queries.splice(0), [
      { table: 'shipments', filters: { tracking_number: trackingNumber, deleted_at: null } },
      { table: 'customer_tracking_events', filters: { organization_id: shipment.organization_id, shipment_id: shipment.id } },
      ...(failed ? [{ table: 'delivery_attempts', filters: { organization_id: shipment.organization_id, shipment_id: shipment.id, outcome: 'undelivered', created_at: [failedAt] } }] : []),
    ]);
  }
});
