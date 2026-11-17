/**
 * Lightweight integrity checks for geography-first territories.
 * Run: node backend/scripts/test_territories_operational.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const results = [];
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'territories'
      AND column_name IN (
        'status','latitude','longitude','radius_meters',
        'barangay_code','barangay_name','municipality_name','province_name',
        'default_sales_agent_id','default_collector_id'
      )
    ORDER BY column_name
  `);
  assert(cols.rows.length >= 8, 'Missing territories geo/operational columns');
  results.push(['schema_columns', 'PASS', cols.rows.map((r) => r.column_name).join(',')]);

  const statusBad = await pool.query(`
    SELECT COUNT(*)::int AS n FROM territories
    WHERE status IS NOT NULL AND status NOT IN ('Active','Inactive')
  `);
  assert(statusBad.rows[0].n === 0, 'Invalid territory status values exist');
  results.push(['status_values', 'PASS']);

  const crossBranchCustomers = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM customers c
    JOIN territories t ON t.territory_id = c.territory_id
    WHERE c.branch_id IS DISTINCT FROM t.branch_id
  `);
  results.push(['cross_branch_customer_territory', 'INFO', String(crossBranchCustomers.rows[0].n)]);

  const nullTerritoryActive = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM customers
    WHERE status = 'Active' AND territory_id IS NULL
  `);
  results.push(['active_customers_missing_territory', 'INFO', String(nullTerritoryActive.rows[0].n)]);

  const activeMissingGeo = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM territories
    WHERE COALESCE(status,'Active') = 'Active'
      AND (latitude IS NULL OR longitude IS NULL)
  `);
  results.push(['active_territories_missing_pin', 'INFO', String(activeMissingGeo.rows[0].n)]);

  const activeMissingBarangay = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM territories
    WHERE COALESCE(status,'Active') = 'Active'
      AND (barangay_name IS NULL OR btrim(barangay_name) = '')
  `);
  results.push(['active_territories_missing_barangay', 'INFO', String(activeMissingBarangay.rows[0].n)]);

  // Defaults are legacy/nullable — Active territories must NOT require them.
  const activeWithNullDefaults = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM territories
    WHERE COALESCE(status,'Active') = 'Active'
      AND default_sales_agent_id IS NULL
      AND default_collector_id IS NULL
  `);
  results.push(['active_ok_without_defaults', 'PASS', String(activeWithNullDefaults.rows[0].n)]);

  const policy = await pool.query(`
    SELECT setting_value FROM system_settings WHERE setting_key = 'territory_policies' LIMIT 1
  `);
  if (policy.rows[0]) {
    let parsed;
    try {
      parsed = typeof policy.rows[0].setting_value === 'string'
        ? JSON.parse(policy.rows[0].setting_value)
        : policy.rows[0].setting_value;
    } catch {
      parsed = null;
    }
    assert(parsed && parsed.mode === 'off', 'territory_policies.mode must ship as off');
    assert(parsed.preserveHistory === true, 'territory_policies.preserveHistory must be true');
    results.push(['territory_policies_mode_off', 'PASS']);
  } else {
    results.push(['territory_policies_mode_off', 'INFO', 'setting not seeded yet']);
  }

  for (const row of results) {
    console.log(row.join('\t'));
  }
  console.log('Territory operational audit complete.');
  await pool.end();
}

main().catch(async (err) => {
  console.error('FAIL', err.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
