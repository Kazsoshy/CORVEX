import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const pool = new pkg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

const userId = (await pool.query(`SELECT id FROM users WHERE status = 'Active' LIMIT 1`)).rows[0]?.id;
await pool.end();

if (!userId) {
  console.error('No active user found');
  process.exit(1);
}

const res = await fetch('http://localhost:5000/api/products', {
  headers: { 'X-User-Id': String(userId) },
});

console.log('Status:', res.status);
const body = await res.text();
console.log('Body:', body.slice(0, 500));
