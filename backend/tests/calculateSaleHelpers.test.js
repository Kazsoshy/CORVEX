import test from 'node:test';
import assert from 'node:assert/strict';

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function computeSpotCashPreview(originalTotal) {
  const original = money(originalTotal);
  const discountAmount = money(Math.round(original * 100 * 0.3) / 100);
  return {
    originalTotal: original,
    discountAmount,
    finalObligation: money(original - discountAmount),
  };
}

function computeInstallmentPreview(totalAmount, downPayment, termMonths) {
  const total = money(totalAmount);
  const down = money(downPayment);
  const months = Number(termMonths) || 0;
  const financed = money(Math.max(0, total - down));
  const financedCents = Math.round(financed * 100);
  const baseCents = Math.floor(financedCents / months);
  const monthly = money(baseCents / 100);
  const lastPayment = money((financedCents - baseCents * (months - 1)) / 100);
  return { monthly, lastPayment, financed };
}

function evaluateCreditLimit({ payType, creditLimit, outstanding, queuedOfflineCredit = 0, cartObligation }) {
  const limit = money(creditLimit);
  const after = money(money(outstanding) + money(queuedOfflineCredit) + (payType === 'installment' ? money(cartObligation) : 0));
  const exceeded = payType === 'installment' && limit > 0 && after > limit;
  return { exceeded, overBy: exceeded ? money(after - limit) : 0 };
}

test('spot cash applies 30% discount', () => {
  const result = computeSpotCashPreview(15999);
  assert.equal(result.discountAmount, 4799.7);
  assert.equal(result.finalObligation, 11199.3);
});

test('installment last payment absorbs remainder cents', () => {
  const result = computeInstallmentPreview(15999, 0, 7);
  assert.equal(result.monthly, 2285.57);
  assert.equal(result.lastPayment, 2285.58);
  assert.equal(money(result.monthly * 6 + result.lastPayment), 15999);
});

test('credit limit exceeded only for installment', () => {
  assert.equal(evaluateCreditLimit({
    payType: 'full',
    creditLimit: 10000,
    outstanding: 0,
    cartObligation: 20000,
  }).exceeded, false);
  const over = evaluateCreditLimit({
    payType: 'installment',
    creditLimit: 10000,
    outstanding: 5000,
    cartObligation: 6000,
  });
  assert.equal(over.exceeded, true);
  assert.equal(over.overBy, 1000);
});
