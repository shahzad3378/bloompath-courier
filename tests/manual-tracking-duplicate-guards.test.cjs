const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadAction({ shipment, latestEvent = null, booking = null } = {}) {
  const file = 'src/app/(portal)/warehouse/manual-tracking/actions.ts';
  const calls = [];
  const m = new Module(path.resolve(file));
  m.filename = path.resolve(file);
  m.paths = Module._nodeModulePaths(path.dirname(m.filename));
  m.require = (name) => {
    if (name === 'next/cache') return { revalidatePath() {} };
    if (name === '@/lib/auth') return { async requireProfile() { return { id: 'staff-1', organization_id: 'org-1' }; } };
    if (name === '@/lib/customer-tracking') return { customerTrackingLabels: {}, manualTrackingStatuses: ['booked','at_warehouse','delivered'] };
    if (name === '@/lib/tracking-timezones') return {
      isTrackingTimeZone: (v) => v === 'Asia/Dubai',
      parseDateTimeLocal: () => '2026-10-24T10:00:00.000Z',
      formatDateTimeLocal: () => '', inferTrackingTimeZone: () => 'Asia/Dubai', trackingTimeZones: [],
    };
    if (name === '@/lib/supabase/server') return { async createClient() { return { from(table) {
      let query = { selected: '', filters: {},
        select(value) { this.selected = value; return this; },
        eq(key, value) { this.filters[key] = value; return this; },
        is() { return this; }, order() { return this; }, limit() { return this; },
        update() { return this; },
        async maybeSingle() {
          calls.push({ table, ...this.filters, selected: this.selected });
          if (table === 'shipments') return { data: shipment, error: null };
          return { data: this.selected === 'id' ? booking : latestEvent, error: null };
        },
        async insert() { calls.push({ table, inserted: true }); return { error: null }; },
      }; return query;
    } }; } };
    throw new Error(`Unexpected import ${name}`);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, m.filename);
  return { action: m.exports.recordManualTrackingAction, calls };
}
function form(status) {
  const data = new FormData();
  data.set('tracking_number', 'FD2601ABC'); data.set('status', status);
  data.set('time_zone', 'Asia/Dubai'); data.set('occurred_at', '2026-10-24T14:00');
  return data;
}

test('delivered shipment rejects any later manual tracking operation', async () => {
  const { action, calls } = loadAction({ shipment: { id: 's1', status: 'delivered', sender_country_code: 'AE', consignee_country_code: 'AE' }, latestEvent: { status: 'delivered' } });
  const result = await action({ status: 'idle', message: '' }, form('booked'));
  assert.equal(result.status, 'error');
  assert.match(result.message, /already delivered/i);
  assert.equal(calls.filter((call) => call.inserted).length, 0);
});

test('a previously booked AWB cannot be booked a second time', async () => {
  const { action, calls } = loadAction({ shipment: { id: 's1', status: 'booked', sender_country_code: 'AE', consignee_country_code: 'AE' }, latestEvent: { status: 'booked' }, booking: { id: 9 } });
  const result = await action({ status: 'idle', message: '' }, form('booked'));
  assert.equal(result.status, 'error');
  assert.match(result.message, /cannot be booked again/i);
  assert.equal(calls.filter((call) => call.inserted).length, 0);
});

test('already received warehouse parcel rejects duplicate warehouse receipt', async () => {
  const { action, calls } = loadAction({ shipment: { id: 's1', status: 'at_warehouse', sender_country_code: 'AE', consignee_country_code: 'AE' }, latestEvent: { status: 'at_warehouse' } });
  const result = await action({ status: 'idle', message: '' }, form('at_warehouse'));
  assert.equal(result.status, 'error');
  assert.match(result.message, /already received in the warehouse/i);
  assert.equal(calls.filter((call) => call.inserted).length, 0);
});


test('delivered update from warehouse does not claim shipment is ready for dispatch', async () => {
  const { action } = loadAction({ shipment: { id: 's1', status: 'at_warehouse', sender_country_code: 'CA', consignee_country_code: 'CA' }, latestEvent: { status: 'in_transit' } });
  const result = await action({ status: 'idle', message: '' }, form('delivered'));
  assert.equal(result.status, 'success');
  assert.match(result.message, /updated to Delivered/i);
  assert.match(result.message, /shipment is complete/i);
  assert.doesNotMatch(result.message, /warehouse|ready for dispatch/i);
});
