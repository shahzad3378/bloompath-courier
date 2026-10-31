const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const m = new Module('tracking-timezones');
m._compile(ts.transpileModule(fs.readFileSync('src/lib/tracking-timezones.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, 'tracking-timezones.js');
const { trackingDateCellToLocal, parseDateTimeLocal } = m.exports;
const zone = 'America/Toronto';
test('Excel date digits remain Toronto wall time and recover serial rounding', () => {
  for (const value of [new Date('2026-10-29T15:10:00.000Z'), new Date('2026-10-29T15:09:59.999Z'), '2026-10-29T15:10:00', '2026-10-29T15:10']) {
    const local = trackingDateCellToLocal(value, zone);
    assert.equal(local, '2026-10-29T15:10');
    assert.equal(parseDateTimeLocal(local, zone), '2026-10-29T19:10:00.000Z');
  }
});
test('explicit UTC and offsets remain real instants', () => {
  assert.equal(trackingDateCellToLocal('2026-10-29T19:10:00Z',zone),'2026-10-29T15:10');
  assert.equal(trackingDateCellToLocal('2026-10-29T15:10:00-04:00',zone),'2026-10-29T15:10');
});
test('winter offset, invalid dates and DST gaps are handled', () => {
  assert.equal(parseDateTimeLocal('2026-12-01T15:10',zone),'2026-12-01T20:10:00.000Z');
  assert.equal(trackingDateCellToLocal('2026-02-30T15:10',zone),null);
  assert.equal(trackingDateCellToLocal('2026-03-08T02:30',zone),null);
});
