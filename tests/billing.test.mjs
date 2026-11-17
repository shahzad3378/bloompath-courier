import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currencyTotals, netBalance, validInvoiceIds } from '../src/lib/billing.ts';

test('154 delivered AWBs are valid; reject duplicates, missing and unsafe IDs', () => {
  assert.equal(validInvoiceIds(Array.from({length:154}, (_, i) => String(i+1))).length,154);
  assert.equal(validInvoiceIds(['1','1']),null);
  assert.equal(validInvoiceIds([]),null);
  assert.equal(validInvoiceIds(['1.5']),null);
  assert.equal(validInvoiceIds(['9007199254740992']),null);
  assert.equal(validInvoiceIds(Array.from({length:5001},(_,i)=>String(i+1))),null);
});
test('COD payable deducts service charge and invoice tax once', () => {
  assert.deepEqual(netBalance(100,10,0.5),{payable:89.5,receivable:0});
});
test('prepaid and COD shortfall create receivables without negative payables', () => {
  assert.deepEqual(netBalance(0,10,0.5),{payable:0,receivable:10.5});
  assert.deepEqual(netBalance(5,10),{payable:0,receivable:5});
  assert.deepEqual(netBalance(10,10),{payable:0,receivable:0});
});
test('account net offsets prepaid charges against COD in the same currency', () => {
  assert.deepEqual(netBalance(100,20),{payable:80,receivable:0});
});
test('AED and CAD stay in separate totals', () => {
  assert.deepEqual(currencyTotals([{currency:'CAD',amount:10},{currency:'AED',amount:30},{currency:'CAD',amount:20}],row=>row.amount),[['AED',30],['CAD',30]]);
});
