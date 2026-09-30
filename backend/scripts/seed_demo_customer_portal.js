/**
 * Creates (or resets) a demo customer portal login linked to Rafael Lim (seed customer).
 * Safe to run repeatedly — idempotent.
 */
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SEED_PASSWORD, SEED_PASSWORD_HASH } from '../lib/seedDefaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

export const DEMO_CUSTOMER_EMAIL = 'demo.customer@corvex.ph';
export const DEMO_CUSTOMER_PASSWORD = SEED_PASSWORD;

const { Pool } = pkg;

if (!process.env.DB_PASSWORD) {
  console.error('DB_PASSWORD is not set. Add it to .env in the project root (or backend/.env).');
  process.exit(1);
}

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

async function ensureCustomerRoleId(client) {
  const existing = await client.query(`SELECT role_id FROM roles WHERE slug = 'customer' LIMIT 1`);
  if (existing.rows.length) return existing.rows[0].role_id;
  const inserted = await client.query(
    `INSERT INTO roles (role_name, slug) VALUES ('Customer', 'customer') RETURNING role_id`
  );
  return inserted.rows[0].role_id;
}

async function main() {
  const davaoBranch = await pool.query(
    `SELECT id FROM branches WHERE name ILIKE '%Davao City%' LIMIT 1`
  );
  const davaoBranchId = davaoBranch.rows[0]?.id ?? null;

  const customerResult = await pool.query(
    `SELECT c.customer_id, c.branch_id, c.user_id, c.customer_code
     FROM customers c
     WHERE c.last_name = 'Lim'
       AND ($1::int IS NULL OR c.branch_id = $1)
     ORDER BY c.customer_id
     LIMIT 1`,
    [davaoBranchId]
  );
  let customer = customerResult.rows[0];
  if (!customer) {
    const fallback = await pool.query(
      `SELECT c.customer_id, c.branch_id, c.user_id, c.customer_code
       FROM customers c
       WHERE ($1::int IS NULL OR c.branch_id = $1)
       ORDER BY c.customer_id
       LIMIT 1`,
      [davaoBranchId]
    );
    customer = fallback.rows[0];
  }
  if (!customer) {
    throw new Error('No customers in database. Run migrations / seed data first.');
  }
  const passwordHash = SEED_PASSWORD_HASH;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const roleId = await ensureCustomerRoleId(client);

    const existingUser = await client.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
      [DEMO_CUSTOMER_EMAIL]
    );

    let userId;
    if (existingUser.rows.length) {
      userId = existingUser.rows[0].id;
      await client.query(
        `UPDATE users
         SET password_hash = $1, status = 'Active', role_id = $2, branch_id = $3,
             first_name = 'Rafael', last_name = 'Lim', updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [passwordHash, roleId, davaoBranchId ?? customer.branch_id, userId]
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role_id, branch_id, status)
         VALUES ('Rafael', 'Lim', $1, $2, $3, $4, 'Active')
         RETURNING id`,
        [DEMO_CUSTOMER_EMAIL, passwordHash, roleId, davaoBranchId ?? customer.branch_id]
      );
      userId = inserted.rows[0].id;
    }

    if (customer.user_id && customer.user_id !== userId) {
      await client.query(
        `UPDATE users SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [customer.user_id]
      );
    }

    const janeResult = await client.query(
      `SELECT u.id FROM users u WHERE LOWER(u.email) = 'jane.s@corvex.ph' LIMIT 1`
    );
    const janeId = janeResult.rows[0]?.id ?? null;

    await client.query(
      `UPDATE customers
       SET user_id = $1, portal_email = $2, portal_status = 'active',
           branch_id = COALESCE($5, branch_id),
           assigned_sales_agent_id = COALESCE($4, assigned_sales_agent_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = $3`,
      [userId, DEMO_CUSTOMER_EMAIL, customer.customer_id, janeId, davaoBranchId]
    );

    if (janeId) {
      await client.query(
        `UPDATE purchase_requests
         SET sales_agent_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE customer_id = $2`,
        [janeId, customer.customer_id]
      );
    }

    await client.query('COMMIT');

    console.log('\n=== Demo customer portal ready ===\n');
    console.log(`Login URL:  http://localhost:5173/customer/login`);
    console.log(`Email:      ${DEMO_CUSTOMER_EMAIL}`);
    console.log(`Password:   ${DEMO_CUSTOMER_PASSWORD}`);
    console.log(`Customer:   ${customer.customer_code || customer.customer_id} (Rafael Lim)\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
