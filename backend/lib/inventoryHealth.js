/**
 * Shared inventory / target metric definitions used by Dashboard, Reports, and KPI APIs.
 *
 * | Metric | Formula | Notes |
 * |---|---|---|
 * | Healthy Stock Rate | Sufficient ÷ eligible monitored products × 100 | Eligible = branch_inventory rows in scope |
 * | Stock Alerts | Distinct Low + Critical + Out | Bands are mutually exclusive |
 * | Collection / Sales Rate vs Target | Confirmed amount ÷ (dailyTarget × days) × 100 | Same period for numerator and denominator |
 *
 * Stock bands (deriveStockStatus / STOCK_STATUS_CASE_SQL):
 *   Out of Stock  — available_stock <= 0
 *   Critical Stock — reorder_level > 0 AND available_stock <= reorder_level × 0.3
 *   Low Stock      — reorder_level > 0 AND available_stock <= reorder_level (and not Critical)
 *   Sufficient     — otherwise
 */

/**
 * Inventory health = Sufficient monitored products ÷ eligible products × 100.
 * Eligible = rows in branch_inventory for the scoped branch(es).
 * Zero-stock products are Out of Stock (not healthy).
 */
export function inventoryHealthPercent(sufficientCount, productCount) {
  const products = Number(productCount) || 0;
  const sufficient = Number(sufficientCount) || 0;
  if (products <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, (sufficient / products) * 100)));
}

/**
 * Mutually exclusive stock bands matching deriveStockStatus:
 * Out of Stock | Critical Stock | Low Stock | Sufficient
 */
export const STOCK_STATUS_CASE_SQL = `
  CASE
    WHEN available_stock <= 0 THEN 'Out of Stock'
    WHEN reorder_level > 0 AND available_stock <= reorder_level * 0.3 THEN 'Critical Stock'
    WHEN reorder_level > 0 AND available_stock <= reorder_level THEN 'Low Stock'
    ELSE 'Sufficient'
  END
`;

export const STOCK_STATUS_CASE_SQL_BI = `
  CASE
    WHEN bi.available_stock <= 0 THEN 'Out of Stock'
    WHEN bi.reorder_level > 0 AND bi.available_stock <= bi.reorder_level * 0.3 THEN 'Critical Stock'
    WHEN bi.reorder_level > 0 AND bi.available_stock <= bi.reorder_level THEN 'Low Stock'
    ELSE 'Sufficient'
  END
`;

/** Distinct alert products = Low + Critical + Out (mutually exclusive). */
export function stockAlertsCount({ low = 0, critical = 0, outOfStock = 0 } = {}) {
  return (Number(low) || 0) + (Number(critical) || 0) + (Number(outOfStock) || 0);
}

/**
 * Rate vs period target: amount / (dailyTarget × days) × 100, capped at 100.
 * Returns 0 when the period target is zero (do not treat as 100%).
 */
export function rateAgainstDailyTarget(amount, dailyTarget, days = 7) {
  const target = (Number(dailyTarget) || 0) * (Number(days) || 0);
  const collected = Number(amount) || 0;
  if (target <= 0) return 0;
  return Math.min(100, Math.round((collected / target) * 100));
}
