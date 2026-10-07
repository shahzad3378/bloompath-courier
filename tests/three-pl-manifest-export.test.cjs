const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const ExcelJS = require('exceljs');
const { PDFDocument } = require('pdf-lib');
function load(file, mocks = {}) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => mocks[name] || require(name), m, m.exports);
  return m.exports;
}
const exporter = load('src/lib/three-pl-manifest-export.ts');
const row = { tracking_number: 'FD10001', partner_name: 'GTA AirSkip', load_number: 'L2610-0002YMM5', partner_tracking_number: 'GTA123', consignee_name: 'Test Receiver', consignee_city: 'Vancouver', pieces: 2 };
const data = { company: 'FastDrop', number: row.load_number, status: 'Handed over', rows: [row] };
test('Excel export preserves exact saved load and AWB values, with correct download headers', async () => {
  const response = await exporter.exportThreePLManifest(data, 'excel');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.match(response.headers.get('Content-Disposition'), /L2610-0002YMM5.xlsx/);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await response.arrayBuffer());
  const sheet = wb.getWorksheet('3PL Manifest');
  assert.equal(sheet.getCell('B7').value, row.tracking_number);
  assert.equal(sheet.getCell('D7').value, row.load_number);
  assert.equal(sheet.getCell('E7').value, row.partner_tracking_number);
  assert.equal(sheet.getCell('H7').value, 2);
});
test('PDF export is an actual multipage PDF and survives long and international text', async () => {
  const response = await exporter.exportThreePLManifest({ ...data, rows: Array.from({ length: 80 }, () => ({ ...row, consignee_name: 'محمد Test Receiver - very long name that wraps across table rows' })) }, 'pdf');
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  const doc = await PDFDocument.load(await response.arrayBuffer());
  assert.ok(doc.getPageCount() > 1);
});
test('export route rejects unauthorized, wrong-format and invalid selections before querying', async () => {
  let profile = null;
  const route = load('src/app/(portal)/dispatch/3pl/export/[format]/route.ts', {
    '@/lib/auth': { getCurrentProfile: async () => profile },
    '@/lib/three-pl-manifests': { manifestRoles: ['super_admin', 'operations_admin', 'warehouse_staff', 'dispatcher'] },
    '@/lib/supabase/server': { createClient: async () => { throw new Error('DB must not be called'); } },
    '@/lib/three-pl-load-numbers': {}, '@/lib/tenant-branding': {}, '@/lib/three-pl-manifest-export': exporter,
  });
  const get = (query, format = 'pdf') => route.GET(new Request(`https://example.com/export/${format}${query}`), { params: Promise.resolve({ format }) });
  assert.equal((await get('?shipment_id=1')).status, 403);
  profile = { status: 'active', organization_id: 'tenant-A', role: 'shipper' };
  assert.equal((await get('?shipment_id=1')).status, 403);
  profile.role = 'super_admin';
  assert.equal((await get('?shipment_id=1', 'csv')).status, 400);
  for (const query of ['', '?shipment_id=-1', '?shipment_id=1%20or%201=1', '?shipment_id=99999999999999999']) assert.equal((await get(query)).status, 400);
});
