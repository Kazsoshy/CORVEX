export function normalizeProductName(name) {
  return String(name ?? '').trim();
}

export async function productNameTaken(db, name, excludeId = null) {
  const normalized = normalizeProductName(name);
  const params = [normalized];
  let excludeSql = '';
  if (excludeId != null) {
    params.push(Number(excludeId));
    excludeSql = ` AND id <> $${params.length}`;
  }
  const result = await db.query(
    `SELECT id FROM products WHERE lower(btrim(name)) = lower($1)${excludeSql} LIMIT 1`,
    params
  );
  return result.rows.length > 0;
}

export function productNameConflict(err) {
  if (err?.code === '23505' && err.constraint === 'products_name_lower_unique') {
    return 'A product with this name already exists.';
  }
  return null;
}
