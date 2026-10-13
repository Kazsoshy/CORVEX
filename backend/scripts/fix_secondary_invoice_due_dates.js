/**
 * Backfill due_date on secondary-branch seed invoices so org SAW can include them.
 * Run: node backend/scripts/fix_secondary_invoice_due_dates.js
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { computeOrgSawPriority, persistSawResults } from '../lib/sawCollectionData.js';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || process.env.PGUSER || 'postgres',
  password: String(process.env.DB_PASSWORD || process.env.PGPASSWORD || ''),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'corvex',
});

async function main() {
  const updated = await pool.query(
    `UPDATE sales_invoices si
     SET due_date = COALESCE(
           si.due_date,
           (COALESCE(si.invoices_date, CURRENT_DATE) - ((si.sales_invoices_id % 14) || ' days')::interval)::date
         )
     FROM customers c
     JOIN branches b ON b.id = c.branch_id
     WHERE si.customer_id = c.customer_id
       AND si.due_date IS NULL
       AND si.status IN ('Confirmed', 'Pending Review')
       AND b.name ILIKE ANY (ARRAY['%General Santos%', '%Davao Oriental%'])
     RETURNING si.sales_invoices_id, b.name AS branch_name`
  );

  console.log(`Updated due_date on ${updated.rowCount} invoice(s).`);
  const { asOf, ranked, stats } = await computeOrgSawPriority(pool);
  const saved = await persistSawResults(pool, ranked, { replaceAll: true });
  console.log(JSON.stringify({ asOf, stats, saved }, null, 2));

  const byBranch = await pool.query(
    `SELECT b.name, COUNT(sr.result_id)::int AS ranked
     FROM branches b
     LEFT JOIN customers c ON c.branch_id = b.id
     LEFT JOIN saw_results sr ON sr.customer_id = c.customer_id
     GROUP BY b.id, b.name
     ORDER BY b.name`
  );
  console.log(byBranch.rows);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
