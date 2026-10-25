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
  m.require = (name) => name === '@/lib/env' ? { getSupabaseEnv: () => ({ url: 'https://supabase.example', publishableKey: 'public-key' }) } : require(name);
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
