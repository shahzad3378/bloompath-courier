import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMoneyTotals,
  rowCurrency,
  sumByCurrency,
} from "../src/lib/currency.ts";

test("missing row currency uses the company currency", () => {
  assert.equal(rowCurrency(null, "PKR"), "PKR");
  assert.equal(rowCurrency("usd", "PKR"), "USD");
  assert.equal(rowCurrency("not-a-code", "sar"), "SAR");
});

test("different currencies stay in separate totals", () => {
  const totals = sumByCurrency(
    [
      { amount: 10, currency: "AED" },
      { amount: 5, currency: "USD" },
      { amount: 2.5, currency: null },
      { amount: 1, currency: "AED" },
    ],
    (row) => row.amount,
    (row) => row.currency,
    "PKR",
  );

  assert.deepEqual(totals, [
    { currency: "AED", amount: 11 },
    { currency: "PKR", amount: 2.5 },
    { currency: "USD", amount: 5 },
  ]);
  assert.equal(
    formatMoneyTotals(totals, "PKR"),
    "AED 11.00 · PKR 2.50 · USD 5.00",
  );
});

test("an empty report total uses only the company currency", () => {
  assert.equal(formatMoneyTotals([], "QAR"), "QAR 0.00");
});
