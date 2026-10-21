const COLLECTION_KEY = 'collection_daily';
const SALES_KEY = 'sales_daily';

export async function readPerformanceTargets(pool) {
  const result = await pool.query(
    `SELECT target_key, amount::float AS amount
     FROM performance_targets
     WHERE target_key IN ($1, $2)`,
    [COLLECTION_KEY, SALES_KEY]
  );
  const found = Object.fromEntries(result.rows.map((row) => [row.target_key, Number(row.amount)]));
  if (!Number.isFinite(found[COLLECTION_KEY]) || !Number.isFinite(found[SALES_KEY])) {
    throw new Error('Collection and sales targets are not stored.');
  }
  return {
    collectionDaily: found[COLLECTION_KEY],
    salesDaily: found[SALES_KEY],
  };
}

export async function savePerformanceTargets(pool, collectionDaily, salesDaily) {
  await pool.query(
    `INSERT INTO performance_targets (target_key, amount)
     VALUES ($1, $2), ($3, $4)
     ON CONFLICT (target_key) DO UPDATE
       SET amount = EXCLUDED.amount,
           updated_at = CURRENT_TIMESTAMP`,
    [COLLECTION_KEY, collectionDaily, SALES_KEY, salesDaily]
  );
  return readPerformanceTargets(pool);
}

export function parseTargetAmount(value, label) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
    return { error: `${label} must be greater than zero.` };
  }
  return { amount };
}
