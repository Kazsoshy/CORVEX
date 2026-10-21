function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Current credit exposure for the organization, or one branch when branchId is set. */
export async function readCreditExposure(pool, branchId) {
  const branch = Number(branchId);
  const scoped = Number.isInteger(branch) && branch > 0;
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(cci.credit_limit), 0)::float AS total_limit,
       COALESCE(SUM(ca.outstanding_balance), 0)::float AS credit_used
     FROM customers c
     LEFT JOIN customer_credit_info cci ON cci.customer_id = c.customer_id
     LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
     ${scoped ? 'WHERE c.branch_id = $1' : ''}`,
    scoped ? [branch] : []
  );
  const totalCreditLimit = money(result.rows[0]?.total_limit);
  const creditUsed = money(result.rows[0]?.credit_used);
  return {
    totalCreditLimit,
    creditUsed,
    creditRemaining: money(totalCreditLimit - creditUsed),
  };
}
