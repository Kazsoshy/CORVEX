/**
 * Smoke checks for collector dispatch business rules.
 * Usage: node backend/scripts/test_collector_dispatch_rules.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import {
  computeCollectorSawPriority,
  assignCollectionVisits,
} from '../lib/sawCollectionData.js';
import { manilaDateString } from '../lib/sawCollection.js';

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
  const today = manilaDateString();

  const idx = await pool.query(`
    SELECT indexname FROM pg_indexes
    WHERE indexname = 'uq_field_visits_collection_customer_day'
  `);
  assert(idx.rows.length === 1, 'unique day index missing');
  results.push(['unique_index', 'PASS']);

  const collectors = await pool.query(`
    SELECT u.id, u.branch_id, u.email, b.name AS branch_name
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    JOIN branches b ON b.id = u.branch_id
    WHERE r.slug = 'collector' AND u.status = 'Active' AND u.branch_id IS NOT NULL
    ORDER BY u.branch_id, u.id
  `);
  assert(collectors.rows.length >= 2, 'need at least 2 collectors for conflict test');

  const byBranch = new Map();
  for (const row of collectors.rows) {
    const key = String(row.branch_id);
    if (!byBranch.has(key)) byBranch.set(key, []);
    byBranch.get(key).push(row);
  }
  const multiBranch = [...byBranch.values()].filter((g) => g.length >= 1).length >= 1;
  assert(multiBranch, 'no branch collectors found');
  results.push(['collectors_present', 'PASS']);

  // Empty-portfolio collector should not expand to entire branch.
  const emptyCollector = await pool.query(`
    SELECT u.id, u.branch_id
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE r.slug = 'collector' AND u.status = 'Active' AND u.branch_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM customers c WHERE c.account_manager_id = u.id AND c.status = 'Active'
      )
    LIMIT 1
  `);
  if (emptyCollector.rows[0]) {
    const c = emptyCollector.rows[0];
    const branchCust = await pool.query(
      `SELECT COUNT(*)::int AS n FROM customers WHERE branch_id = $1 AND status = 'Active'`,
      [c.branch_id]
    );
    const saw = await computeCollectorSawPriority(pool, {
      collectorId: c.id,
      branchId: c.branch_id,
      scheduledDate: today,
    });
    const branchN = Number(branchCust.rows[0].n) || 0;
    // Own book empty: ranked may include unassigned only, never another collector's book.
    const foreign = saw.ranked.filter((r) => r.book_status === 'other_book');
    assert(foreign.length === 0, 'other_book leaked into empty portfolio SAW');
    assert(saw.ranked.length < branchN || branchN === 0, 'empty portfolio expanded to whole branch');
    results.push(['empty_portfolio_no_expand', 'PASS', `ranked=${saw.ranked.length} branch=${branchN}`]);
  } else {
    results.push(['empty_portfolio_no_expand', 'SKIP', 'no empty-book collector']);
  }

  // Same-day conflict across collectors in same branch.
  const branchGroups = [...byBranch.values()].filter((g) => g.length >= 2);
  if (branchGroups.length) {
    const [a, b] = branchGroups[0];
    const candidate = await pool.query(
      `
      SELECT c.customer_id
      FROM customers c
      JOIN customer_activity ca ON ca.customer_id = c.customer_id
      WHERE c.branch_id = $1
        AND c.status = 'Active'
        AND COALESCE(ca.outstanding_balance, 0) > 0
        AND (c.account_manager_id = $2 OR c.account_manager_id IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM field_visits fv
          WHERE fv.customer_id = c.customer_id
            AND fv.visit_type = 'Collection'
            AND fv.scheduled_date = $3::date
        )
      ORDER BY c.customer_id
      LIMIT 1
      `,
      [a.branch_id, a.id, today]
    );
    if (!candidate.rows[0]) {
      results.push(['same_day_conflict', 'SKIP', 'no free candidate']);
    } else {
      const customerId = candidate.rows[0].customer_id;
      const first = await assignCollectionVisits(pool, {
        collectorId: a.id,
        branchId: a.branch_id,
        customerIds: [customerId],
        scheduledDate: today,
      });
      assert(first.created.length === 1, 'first assignment should create');
      const second = await assignCollectionVisits(pool, {
        collectorId: b.id,
        branchId: b.branch_id,
        customerIds: [customerId],
        scheduledDate: today,
      });
      assert(second.created.length === 0, 'second collector must not create');
      assert(
        second.skipped.some((s) => s.reason === 'assigned_to_other_collector' || s.reason === 'assignment_conflict'),
        'second assignment should report conflict'
      );
      results.push(['same_day_conflict', 'PASS', `customer=${customerId}`]);
    }
  } else {
    results.push(['same_day_conflict', 'SKIP', 'need 2 collectors in one branch']);
  }

  // Branch isolation for AM book
  const paired = await pool.query(`
    SELECT u.id AS collector_id, u.branch_id, c.customer_id, c.branch_id AS cust_branch
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    JOIN customers c ON c.account_manager_id = u.id AND c.status = 'Active'
    WHERE r.slug = 'collector' AND u.branch_id IS NOT NULL
    LIMIT 20
  `);
  for (const row of paired.rows) {
    assert(Number(row.branch_id) === Number(row.cust_branch), `AM book cross-branch customer ${row.customer_id}`);
  }
  results.push(['am_book_branch_match', paired.rows.length ? 'PASS' : 'SKIP', `checked=${paired.rows.length}`]);

  console.log(JSON.stringify({ today, results }, null, 2));
}

main()
  .catch((err) => {
    console.error('FAILED', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
