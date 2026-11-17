/**
 * CORVEX — Credit consistency verification (read-only).
 *
 * Reports:
 *   - rows where available <> credit_limit - outstanding_balance
 *   - rows where credit_limit = 0 AND outstanding_balance > 0
 *   - orphan credit rows (no matching customer_activity)
 *
 * Deterministic table output (no RANDOM()).
 *
 * Usage: node backend/scripts/verify_credit_consistency.js
 * Exit code 1 when any violation is found.
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

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function pad(str, width) {
  const s = String(str);
  return s.length >= width ? s : s.padEnd(width, ' ');
}

async function main() {
  const rows = await pool.query(`
    SELECT
      c.customer_id,
      c.customer_code,
      c.first_name || ' ' || c.last_name AS customer_name,
      COALESCE(ca.outstanding_balance, 0)::numeric(14,2) AS outstanding_balance,
      COALESCE(cci.credit_limit, 0)::numeric(14,2) AS credit_limit,
      COALESCE(cci.credit_limit, 0)::numeric(14,2)
        - COALESCE(ca.outstanding_balance, 0)::numeric(14,2) AS available_balance,
      CASE
        WHEN cci.customer_id IS NULL AND COALESCE(ca.outstanding_balance, 0) > 0 THEN 'missing_credit_row'
        WHEN COALESCE(cci.credit_limit, 0) = 0 AND COALESCE(ca.outstanding_balance, 0) > 0 THEN 'zero_limit_with_balance'
        WHEN COALESCE(cci.credit_limit, 0)::numeric(14,2)
              - COALESCE(ca.outstanding_balance, 0)::numeric(14,2) < 0
          THEN 'negative_available'
        ELSE 'ok'
      END AS violation
    FROM customers c
    LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
    LEFT JOIN customer_credit_info cci ON cci.customer_id = c.customer_id
    ORDER BY c.customer_id
  `);

  const violations = rows.rows.filter((r) => r.violation !== 'ok');
  const orphanRows = await pool.query(`
    SELECT cci.customer_id, c.customer_code
    FROM customer_credit_info cci
    LEFT JOIN customers c ON c.customer_id = cci.customer_id
    LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
    WHERE c.customer_id IS NULL OR ca.customer_id IS NULL
    ORDER BY cci.customer_id
  `);

  const summary = {
    total_customers: rows.rows.length,
    violations: violations.length,
    orphan_credit_rows: orphanRows.rows.length,
    ok: violations.length === 0 && orphanRows.rows.length === 0,
  };

  console.log('CORVEX Credit Consistency Report');
  console.log('='.repeat(60));
  console.log(`Total customers:            ${summary.total_customers}`);
  console.log(`Violations:                 ${summary.violations}`);
  console.log(`Orphan credit rows:         ${summary.orphan_credit_rows}`);
  console.log(`Status:                     ${summary.ok ? 'PASS' : 'FAIL'}`);
  console.log('='.repeat(60));

  if (violations.length) {
    console.log('\nViolations:');
    console.log(
      pad('ID', 8),
      pad('Code', 14),
      pad('Name', 28),
      pad('Outstanding', 14),
      pad('Limit', 14),
      pad('Available', 14),
      'Issue'
    );
    console.log('-'.repeat(110));
    for (const r of violations) {
      console.log(
        pad(r.customer_id, 8),
        pad(r.customer_code || '', 14),
        pad(r.customer_name || '', 28),
        pad(money(r.outstanding_balance), 14),
        pad(money(r.credit_limit), 14),
        pad(money(r.available_balance), 14),
        r.violation
      );
    }
  }

  if (orphanRows.rows.length) {
    console.log('\nOrphan credit rows (no customer / no activity):');
    for (const r of orphanRows.rows) {
      console.log(`  customer_id=${r.customer_id} code=${r.customer_code || '—'}`);
    }
  }

  console.log('\n' + JSON.stringify({ ok: summary.ok, ...summary }, null, 2));
  await pool.end();
  process.exit(summary.ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});