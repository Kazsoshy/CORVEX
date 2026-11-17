const POLICY_VERSION = 'toril-bh-2026-01';

function cents(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function pesos(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function fromCents(value) {
  return Math.round(Number(value || 0)) / 100;
}

export function determineInstallmentTerm(total) {
  const amount = pesos(total);
  if (amount < 1000) return null;
  if (amount < 3000) return 4;
  if (amount < 5000) return 5;
  if (amount < 7000) return 6;
  return 7;
}

export function earlySettlementOptions(termMonths) {
  const matrix = {
    4: [{ rate: 0.20, timing: 'Within 1 month' }, { rate: 0.15, timing: 'Within 2 months' }, { rate: 0.10, timing: 'Within 3 months' }, { rate: 0.05, timing: 'Original maturity date', maturity: true }],
    5: [{ rate: 0.25, timing: 'Within 1 month' }, { rate: 0.20, timing: 'Within 2 months' }, { rate: 0.15, timing: 'Within 3 months' }, { rate: 0.10, timing: 'Within 4 months' }, { rate: 0.05, timing: 'Original maturity date', maturity: true }],
    6: [{ rate: 0.25, timing: 'Within 1 month' }, { rate: 0.20, timing: 'Within 2 months' }, { rate: 0.15, timing: 'Within 3 months' }, { rate: 0.10, timing: '4th or 5th month' }, { rate: 0.05, timing: 'Original maturity date', maturity: true }],
    7: [{ rate: 0.25, timing: 'Within 1 month' }, { rate: 0.20, timing: 'Within 2 months' }, { rate: 0.15, timing: '3rd or 4th month' }, { rate: 0.10, timing: '5th or 6th month' }, { rate: 0.05, timing: 'Original maturity date', maturity: true }],
  };
  return (matrix[Number(termMonths)] || []).map((option) => ({
    ...option,
    ratePercent: option.rate * 100,
  }));
}

export function calculateSalesPricing({ total, arrangement, invoiceDate, firstDueDate }) {
  const originalTotal = pesos(total);
  const normalizedArrangement = arrangement === 'spot_cash' || arrangement === 'full'
    ? 'spot_cash'
    : 'installment';

  if (normalizedArrangement === 'spot_cash') {
    const discountAmount = fromCents(Math.round(cents(originalTotal) * 0.30));
    return {
      policyVersion: POLICY_VERSION,
      arrangement: normalizedArrangement,
      originalTotal,
      discountRate: 0.30,
      discountAmount,
      finalObligation: fromCents(cents(originalTotal) - cents(discountAmount)),
      termMonths: null,
      monthlyAmount: null,
      schedule: [],
      settlementOptions: [],
    };
  }

  const termMonths = determineInstallmentTerm(originalTotal);
  if (!termMonths) {
    return {
      policyVersion: POLICY_VERSION,
      arrangement: normalizedArrangement,
      originalTotal,
      error: 'Installment purchases must be at least ₱1,000.',
      schedule: [],
      settlementOptions: [],
    };
  }

  const totalCents = cents(originalTotal);
  const baseCents = Math.floor(totalCents / termMonths);
  const remainder = totalCents - (baseCents * termMonths);
  const schedule = Array.from({ length: termMonths }, (_, index) => {
    const due = firstDueDate || invoiceDate || null;
    return {
      installmentNumber: index + 1,
      dueDate: due ? addCalendarMonths(due, index) : null,
      amount: fromCents(baseCents + (index === termMonths - 1 ? remainder : 0)),
    };
  });

  return {
    policyVersion: POLICY_VERSION,
    arrangement: normalizedArrangement,
    originalTotal,
    discountRate: 0,
    discountAmount: 0,
    finalObligation: originalTotal,
    termMonths,
    monthlyAmount: pesos(baseCents),
    schedule,
    maturityDate: schedule.at(-1)?.dueDate || null,
    settlementOptions: earlySettlementOptions(termMonths).map((option) => ({
      ...option,
      discountAmount: fromCents(Math.round(totalCents * option.rate)),
      discountedObligation: fromCents(totalCents - Math.round(totalCents * option.rate)),
    })),
  };
}

function addCalendarMonths(isoDate, months) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return null;
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export { POLICY_VERSION };
