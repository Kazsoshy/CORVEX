/**
 * Helpers to keep dynamic SQL free of untrusted string interpolation.
 */

/**
 * @param {unknown} value
 * @param {string} [label]
 * @returns {string} YYYY-MM-DD
 */
export function requireIsoDate(value, label = 'date') {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const err = new Error(`Invalid ${label}; expected YYYY-MM-DD.`);
    err.statusCode = 400;
    throw err;
  }
  return s;
}

/**
 * Optional AND <column> = $n fragment for a finite branch id.
 * @param {string} column SQL column reference (trusted identifier only)
 * @param {number|null|undefined} branchId
 * @param {number} [startIndex] next $ placeholder index
 */
export function optionalBranchClause(column, branchId, startIndex = 1) {
  if (!Number.isFinite(branchId)) {
    return { sql: '', params: [], nextIndex: startIndex };
  }
  return {
    sql: ` AND ${column} = $${startIndex}`,
    params: [Number(branchId)],
    nextIndex: startIndex + 1,
  };
}
