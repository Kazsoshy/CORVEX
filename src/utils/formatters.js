/**
 * Formats a given number into a Philippine Peso currency string.
 * @param {number|string} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., ₱1,234.56)
 */
export function formatCurrency(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
