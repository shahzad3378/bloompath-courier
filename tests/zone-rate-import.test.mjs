import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseZoneRateRows, readZoneRateWorkbook, zoneRateHeaders } from '../src/lib/zone-rate-import.ts';
const zones=[{id:12,name:'Dubai',country_code:'AE'},{id:13,name:'Abu Dhabi',country_code:'AE'}];
const row=[12,'Dubai','AE','next_day','AED',10,0,5,2,1,'yes',4];
const parse=(rows)=>parseZoneRateRows([zoneRateHeaders,...rows],zones,'AED');
test('parses zone rates and separate weight tiers',()=>{
  const next=[...row];next[6]=5;next[7]=10;
  const result=parse([row,next]);assert.equal(result.length,2);assert.equal(result[0].service_zone_id,12);assert.equal(result[0].additional_kg_rate,2);assert.equal(result[0].return_charge_enabled,true);
});
test('refuses foreign zones, mismatched IDs/names and currencies',()=>{
  for(const [index,value] of [[0,999],[1,'Abu Dhabi'],[2,'CA'],[4,'CAD']]){const bad=[...row];bad[index]=value;assert.throws(()=>parse([bad]));}
});
test('rejects duplicate tiers even when weight notation differs',()=>{
  const duplicate=[...row];duplicate[6]='0.000';assert.throws(()=>parse([row,duplicate]),/duplicate/);
});
test('rejects missing prices, negative values and silent precision loss',()=>{
  for(const value of ['',-1,'10.001','NaN']){const bad=[...row];bad[5]=value;assert.throws(()=>parse([bad]));}
  const bad=[...row];bad[7]=0;assert.throws(()=>parse([bad]),/Weight To/);
});
test('rejects return prices when return charging is disabled',()=>{
  const bad=[...row];bad[10]='no';assert.throws(()=>parse([bad]),/enable Return/);
});
test('workbook rejects formulas and wrong shipper identity',async()=>{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Zone Rates');sheet.addRow(zoneRateHeaders);sheet.addRow(row);
  const account=book.addWorksheet('Account');account.addRow(['Shipper ID','shipper-a']);
  const bytes=Buffer.from(await book.xlsx.writeBuffer());
  assert.equal((await readZoneRateWorkbook(bytes,zones,'AED','shipper-a')).length,1);
  await assert.rejects(readZoneRateWorkbook(bytes,zones,'AED','shipper-b'),/different shipper/);
  sheet.getCell('F2').value={formula:'5+5',result:10};
  await assert.rejects(readZoneRateWorkbook(Buffer.from(await book.xlsx.writeBuffer()),zones,'AED','shipper-a'),/formulas/);
});
