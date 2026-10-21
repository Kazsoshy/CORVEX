/** In-stock items ÷ monitored items × 100. No monitored rows scores 100. */
export function inventoryHealthPercent(outOfStock, productCount) {
  const products = Number(productCount) || 0;
  const missing = Number(outOfStock) || 0;
  if (products <= 0) return 100;
  return Math.round(Math.max(0, 100 - (missing / products) * 100));
}
