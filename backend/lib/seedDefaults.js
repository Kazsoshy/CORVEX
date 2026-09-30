/**
 * Standard credentials and branch for CORVEX demo / seed data.
 * Use these in new migrations and seed scripts — do not invent one-off passwords.
 */
export const SEED_PASSWORD = 'Corvex@2026';

/** bcrypt.hash(SEED_PASSWORD, 12) — fixed so SQL migrations can reference the same hash */
export const SEED_PASSWORD_HASH =
  '$2b$12$qG9oaeYKfYX.XJGxMx7GUOfJ/nnDwBchIFYLkT0xDCaU7pPivRiG6';

/** Prefer `name`; legacy schemas may use `branch_name` — migrations use ILIKE for safety */
export const DAVAO_CITY_BRANCH_LABEL = 'Davao City Branch';

/** Embed in SQL: resolves Davao City branch primary key */
export const SQL_DAVAO_CITY_BRANCH_ID = `(SELECT id FROM branches WHERE name ILIKE '%Davao City%' LIMIT 1)`;
