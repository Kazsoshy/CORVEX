/**
 * Read-only data quality audit for CORVEX.
 * Usage: node backend/scripts/audit_data_quality.js
 */
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

function section(title) {
  console.log(`\n=== ${title} ===`);
}

try {
  section('Sample branches');
  const branches = await pool.query(
    `SELECT id, name, address, phone, email, status, region
     FROM branches ORDER BY name LIMIT 10`
  );
  console.table(branches.rows);

  section('Duplicate branch names');
  const dupBranches = await pool.query(
    `SELECT name, COUNT(*)::int AS c FROM branches GROUP BY name HAVING COUNT(*) > 1`
  );
  console.log(dupBranches.rows.length ? dupBranches.rows : 'none');

  section('Placeholder-looking branch addresses');
  const placeholders = await pool.query(
    `SELECT id, name, address, phone, email
     FROM branches
     WHERE address ILIKE '100 Main Ave%'
        OR address ILIKE '%Seed Street%'
     ORDER BY id`
  );
  console.log(`count=${placeholders.rows.length}`);
  console.table(placeholders.rows.slice(0, 8));

  section('Branch email validation');
  const badEmail = await pool.query(
    `SELECT id, name, email FROM branches
     WHERE email IS NULL OR TRIM(email) = ''
        OR email !~ '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'`
  );
  console.log(badEmail.rows.length ? badEmail.rows : 'all ok');

  section('Branch phone patterns');
  const phones = await pool.query(
    `SELECT phone, COUNT(*)::int AS c FROM branches GROUP BY phone ORDER BY c DESC LIMIT 15`
  );
  console.table(phones.rows);

  section('Same phone on multiple branches');
  const dupPhone = await pool.query(
    `SELECT phone, COUNT(*)::int AS c FROM branches
     WHERE phone IS NOT NULL AND TRIM(phone) <> ''
     GROUP BY phone HAVING COUNT(*) > 1`
  );
  console.log(dupPhone.rows.length ? dupPhone.rows : 'none');

  section('Branch status distribution');
  const statuses = await pool.query(
    `SELECT status, COUNT(*)::int AS c FROM branches GROUP BY status`
  );
  console.table(statuses.rows);

  section('Users missing email or phone');
  const users = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE email IS NULL OR TRIM(email) = '')::int AS missing_email,
            COUNT(*) FILTER (WHERE COALESCE(phone, contact_number) IS NULL
                              OR TRIM(COALESCE(phone, contact_number)) = '')::int AS missing_phone,
            COUNT(*)::int AS total
     FROM users`
  );
  console.table(users.rows);

  section('Duplicate user emails');
  const dupUsers = await pool.query(
    `SELECT email, COUNT(*)::int AS c FROM users
     WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1`
  );
  console.log(dupUsers.rows.length ? dupUsers.rows : 'none');

  section('Customers placeholder addresses / phones');
  const cust = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE address ILIKE '%Seed Street%')::int AS seed_street,
            COUNT(*) FILTER (WHERE portal_email ILIKE '%@example.ph')::int AS example_email,
            COUNT(*) FILTER (WHERE contact_phone IS NULL OR TRIM(contact_phone) = '')::int AS missing_phone,
            COUNT(*)::int AS total
     FROM customers`
  );
  console.table(cust.rows);

  section('Orphan-ish FK checks (counts)');
  const orphans = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM customers c
         LEFT JOIN branches b ON b.id = c.branch_id WHERE c.branch_id IS NOT NULL AND b.id IS NULL) AS customers_bad_branch,
      (SELECT COUNT(*)::int FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id WHERE u.branch_id IS NOT NULL AND b.id IS NULL) AS users_bad_branch,
      (SELECT COUNT(*)::int FROM sales_invoices s
         LEFT JOIN customers c ON c.customer_id = s.customer_id WHERE c.customer_id IS NULL) AS invoices_bad_customer,
      (SELECT COUNT(*)::int FROM collection_payment p
         LEFT JOIN customers c ON c.customer_id = p.customer_id WHERE c.customer_id IS NULL) AS payments_bad_customer
  `);
  console.table(orphans.rows);

  section('Invoice / payment status values');
  const invStatus = await pool.query(
    `SELECT status, COUNT(*)::int AS c FROM sales_invoices GROUP BY status ORDER BY c DESC`
  );
  console.table(invStatus.rows);
  const payStatus = await pool.query(
    `SELECT status, COUNT(*)::int AS c FROM collection_payment GROUP BY status ORDER BY c DESC`
  );
  console.table(payStatus.rows);
} finally {
  await pool.end();
}
