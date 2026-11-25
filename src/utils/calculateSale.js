/**
 * Pure Log-a-Sale helpers (display + credit checks).
 * Server pricing remains authoritative via /sales/pricing/calculate.
 */

export function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addCalendarMonths(isoDate, months) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1 + Number(months || 0), day));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Last installment absorbs remainder cents (same rule as server policy). */
export function computeInstallmentPreview(totalAmount, downPayment, termMonths) {
  const total = money(totalAmount);
  const down = money(downPayment);
  const months = Number(termMonths) || 0;
  const financed = money(Math.max(0, total - down));
  if (!months || months < 1) {
    return { total, down, financed, months: 0, monthly: 0, lastPayment: 0 };
  }
  const financedCents = Math.round(financed * 100);
  const baseCents = Math.floor(financedCents / months);
  const monthly = money(baseCents / 100);
  const lastPayment = money((financedCents - baseCents * (months - 1)) / 100);
  return { total, down, financed, months, monthly, lastPayment };
}

/** Spot cash 30% of original total (display fallback; prefer server pricing). */
export function computeSpotCashPreview(originalTotal) {
  const original = money(originalTotal);
  const discountAmount = money(Math.round(original * 100 * 0.3) / 100);
  return {
    originalTotal: original,
    discountRate: 0.3,
    discountAmount,
    finalObligation: money(original - discountAmount),
  };
}

export function purchaseBracketLabel(originalTotal, termMonths) {
  if (!termMonths) return '—';
  const amount = money(originalTotal);
  if (amount < 3000) return '₱1,000–₱2,999';
  if (amount < 5000) return '₱3,000–₱4,999';
  if (amount < 7000) return '₱5,000–₱6,999';
  return '₱7,000+';
}

export function scheduleSumsToObligation(schedule, obligation, tolerance = 0.01) {
  if (!Array.isArray(schedule) || !schedule.length) return false;
  const sum = schedule.reduce((acc, row) => acc + money(row.amount), 0);
  return Math.abs(sum - money(obligation)) <= tolerance;
}

export function lineItemsInvoiceTotal(lineItems, products) {
  return money(lineItems.reduce((sum, line) => {
    const product = products.find((p) => String(p.product_id) === String(line.productId));
    const quantity = Number(line.quantity) || 0;
    const unitPrice = product ? Number(product.unit_price) : 0;
    return sum + unitPrice * quantity;
  }, 0));
}

/**
 * Credit check for installment only (spot cash ignores limit).
 * Does not invent rules — mirrors LogSalePage validation.
 */
export function evaluateCreditLimit({
  payType,
  creditLimit,
  outstanding,
  queuedOfflineCredit = 0,
  cartObligation,
}) {
  const limit = money(creditLimit);
  const bal = money(outstanding);
  const queued = money(queuedOfflineCredit);
  const cart = money(cartObligation);
  const saleUsesCredit = payType === 'installment';
  const creditImpact = saleUsesCredit ? cart : 0;
  const afterSaleOutstanding = money(bal + queued + creditImpact);
  const remainingAfterSale = limit > 0 ? Math.max(0, limit - afterSaleOutstanding) : null;
  const exceeded = saleUsesCredit && limit > 0 && afterSaleOutstanding > limit;
  const overBy = exceeded ? money(afterSaleOutstanding - limit) : 0;
  return {
    saleUsesCredit,
    creditImpact,
    afterSaleOutstanding,
    remainingAfterSale,
    exceeded,
    overBy,
    hasUsableCredit: limit > 0,
  };
}

export function paymentStanding(outstanding) {
  return money(outstanding) <= 0 ? 'Current' : 'Has Balance';
}

export function queuedOfflineInstallmentCredit(deviceSales, customerId) {
  if (!customerId || !Array.isArray(deviceSales)) return 0;
  return deviceSales.reduce((sum, row) => {
    const payload = row?.payload || {};
    if (String(payload.customer_id) !== String(customerId)) return sum;
    if (payload.pay_type !== 'installment') return sum;
    const items = Array.isArray(payload.items) ? payload.items : [];
    const total = items.reduce((acc, line) => acc + money(line.unit_price) * (Number(line.quantity) || 0), 0);
    if (total > 0) return money(sum + total);
    return money(sum + money(payload.total_amount || payload.invoice_total || 0));
  }, 0);
}

export const LOG_SALE_DRAFT_KEY = 'corvex.logSale.draft.v1';

export function saveLogSaleDraft(draft) {
  try {
    localStorage.setItem(LOG_SALE_DRAFT_KEY, JSON.stringify({
      ...draft,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // ignore quota / private mode
  }
}

export function loadLogSaleDraft() {
  try {
    const raw = localStorage.getItem(LOG_SALE_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearLogSaleDraft() {
  try {
    localStorage.removeItem(LOG_SALE_DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
