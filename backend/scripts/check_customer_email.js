import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

const email = (process.argv[2] || 'ramsbernabe@gmail.com').toLowerCase();
const r = await pool.query(
  `SELECT customer_id, customer_code, contact_email, portal_email, portal_status, created_at
   FROM customers
   WHERE LOWER(COALESCE(contact_email, portal_email)) = $1
   ORDER BY customer_id DESC`,
  [email]
);
console.log('Customers for', email, ':', r.rows.length ? r.rows : '(none)');
await pool.end();
