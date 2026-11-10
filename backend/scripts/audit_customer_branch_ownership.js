/**
 * Read-only audit of customer branch ownership inconsistencies.
 * Does NOT modify data. Run: node backend/scripts/audit_customer_branch_ownership.js
 *
 * Reports:
 *  - Customers missing branch_id
 *  - Customers whose territory belongs to another branch
 *  - Customers whose assigned sales agent / account manager is on another branch
 *  - Active customers with no map coordinates
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    missingBranchId: [],
    territoryBranchMismatch: [],
    salesAgentBranchMismatch: [],
    collectorBranchMismatch: [],
    missingCoordinates: { count: 0, sample: [] },
    totals: {},
  };

  try {
    const totals = await pool.query(`
      SELECT
        COUNT(*)::int AS total_customers,
        COUNT(*) FILTER (WHERE branch_id IS NULL)::int AS missing_branch,
        COUNT(*) FILTER (WHERE status = 'Active')::int AS active_customers,
        COUNT(*) FILTER (
          WHERE status = 'Active'
            AND (latitude IS NULL OR longitude IS NULL
              OR (latitude = 0 AND longitude = 0))
        )::int AS active_missing_coords
      FROM customers
    `);
    report.totals = totals.rows[0];

    const missing = await pool.query(`
      SELECT customer_id, customer_code, first_name, last_name, status, created_at
      FROM customers
      WHERE branch_id IS NULL
      ORDER BY customer_id
      LIMIT 200
    `);
    report.missingBranchId = missing.rows;

    const territoryMismatch = await pool.query(`
      SELECT c.customer_id, c.customer_code, c.first_name, c.last_name,
             c.branch_id AS customer_branch_id, cb.name AS customer_branch,
             t.territory_id, t.territory_name, t.branch_id AS territory_branch_id, tb.name AS territory_branch
      FROM customers c
      JOIN territories t ON t.territory_id = c.territory_id
      LEFT JOIN branches cb ON cb.id = c.branch_id
      LEFT JOIN branches tb ON tb.id = t.branch_id
      WHERE c.territory_id IS NOT NULL
        AND t.branch_id IS DISTINCT FROM c.branch_id
      ORDER BY c.customer_id
      LIMIT 200
    `);
    report.territoryBranchMismatch = territoryMismatch.rows;

    const salesMismatch = await pool.query(`
      SELECT c.customer_id, c.customer_code, c.first_name, c.last_name,
             c.branch_id AS customer_branch_id, cb.name AS customer_branch,
             u.id AS sales_agent_id, TRIM(u.first_name || ' ' || u.last_name) AS sales_agent_name,
             u.branch_id AS sales_agent_branch_id, sb.name AS sales_agent_branch
      FROM customers c
      JOIN users u ON u.id = c.assigned_sales_agent_id
      LEFT JOIN branches cb ON cb.id = c.branch_id
      LEFT JOIN branches sb ON sb.id = u.branch_id
      WHERE c.assigned_sales_agent_id IS NOT NULL
        AND u.branch_id IS DISTINCT FROM c.branch_id
      ORDER BY c.customer_id
      LIMIT 200
    `);
    report.salesAgentBranchMismatch = salesMismatch.rows;

    const collectorMismatch = await pool.query(`
      SELECT c.customer_id, c.customer_code, c.first_name, c.last_name,
             c.branch_id AS customer_branch_id, cb.name AS customer_branch,
             u.id AS collector_id, TRIM(u.first_name || ' ' || u.last_name) AS collector_name,
             u.branch_id AS collector_branch_id, ub.name AS collector_branch
      FROM customers c
      JOIN users u ON u.id = c.account_manager_id
      JOIN roles r ON r.role_id = u.role_id
      LEFT JOIN branches cb ON cb.id = c.branch_id
      LEFT JOIN branches ub ON ub.id = u.branch_id
      WHERE c.account_manager_id IS NOT NULL
        AND r.slug = 'collector'
        AND u.branch_id IS DISTINCT FROM c.branch_id
      ORDER BY c.customer_id
      LIMIT 200
    `);
    report.collectorBranchMismatch = collectorMismatch.rows;

    const missingCoords = await pool.query(`
      SELECT customer_id, customer_code, first_name, last_name, branch_id, address
      FROM customers
      WHERE status = 'Active'
        AND (latitude IS NULL OR longitude IS NULL OR (latitude = 0 AND longitude = 0))
      ORDER BY customer_id
      LIMIT 50
    `);
    report.missingCoordinates = {
      count: Number(report.totals.active_missing_coords || 0),
      sample: missingCoords.rows,
    };

    console.log(JSON.stringify(report, null, 2));
    console.log('\n--- Summary ---');
    console.log(`Total customers: ${report.totals.total_customers}`);
    console.log(`Missing branch_id: ${report.totals.missing_branch}`);
    console.log(`Territory/branch mismatches: ${report.territoryBranchMismatch.length}`);
    console.log(`Sales agent branch mismatches: ${report.salesAgentBranchMismatch.length}`);
    console.log(`Collector branch mismatches: ${report.collectorBranchMismatch.length}`);
    console.log(`Active missing coordinates: ${report.missingCoordinates.count}`);
    console.log('\nSafe correction strategy:');
    console.log('1. Do NOT auto-reassign branch_id from GPS or creator heuristics without review.');
    console.log('2. Clear or reassign territory_id when territory.branch_id != customer.branch_id.');
    console.log('3. Review cross-branch staff assignments with OM before changing account_manager / sales agent.');
    console.log('4. Ask sales/collectors to set map locations for active customers missing coordinates.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[audit_customer_branch_ownership] failed:', err.message);
  process.exit(1);
});
