import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSalesPricing,
  determineInstallmentTerm,
} from '../lib/salesPricingPolicy.js';

test('determines inclusive installment brackets', () => {
  assert.equal(determineInstallmentTerm(1000), 4);
  assert.equal(determineInstallmentTerm(2999), 4);
  assert.equal(determineInstallmentTerm(3000), 5);
  assert.equal(determineInstallmentTerm(4999), 5);
  assert.equal(determineInstallmentTerm(5000), 6);
  assert.equal(determineInstallmentTerm(6999), 6);
  assert.equal(determineInstallmentTerm(7000), 7);
  assert.equal(determineInstallmentTerm(999.99), null);
});

test('calculates Spot Cash from the original product total', () => {
  const result = calculateSalesPricing({ total: 10000, arrangement: 'full' });
  assert.equal(result.discountAmount, 3000);
  assert.equal(result.finalObligation, 7000);
});

test('reconciles installment schedule cents to original total', () => {
  const result = calculateSalesPricing({
    total: 6000,
    arrangement: 'installment',
    invoiceDate: '2026-01-31',
    firstDueDate: '2026-02-28',
  });
  assert.equal(result.termMonths, 6);
  assert.equal(result.schedule.reduce((sum, item) => sum + item.amount, 0), 6000);
  assert.equal(result.maturityDate, '2026-07-28');
});

test('returns the complete six-month settlement matrix', () => {
  const result = calculateSalesPricing({ total: 5999, arrangement: 'installment', firstDueDate: '2026-12-14' });
  assert.deepEqual(
    result.settlementOptions.map((option) => [option.timing, option.ratePercent, option.discountAmount, option.discountedObligation]),
    [
      ['Within 1 month', 25, 1499.75, 4499.25],
      ['Within 2 months', 20, 1199.8, 4799.2],
      ['Within 3 months', 15, 899.85, 5099.15],
      ['4th or 5th month', 10, 599.9, 5399.1],
      ['Original maturity date', 5, 299.95, 5699.05],
    ],
  );
});
