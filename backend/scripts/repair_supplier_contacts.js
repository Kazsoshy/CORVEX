/**
 * Replace name-only supplier.contact values with phone numbers.
 * Usage: node backend/scripts/repair_supplier_contacts.js
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function loadEnv() {
  for (const rel of ['.env', 'backend/.env']) {
    const envPath = path.join(root, rel);
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadEnv();

const client = process.env.DATABASE_URL
  ? new pg.Client({ connectionString: process.env.DATABASE_URL })
  : new pg.Client({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'corvex',
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT) || 5432,
    });

if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
  console.error('Set DATABASE_URL or DB_PASSWORD (and related DB_* vars).');
  process.exit(1);
}

await client.connect();
const result = await client.query(`
  UPDATE suppliers
  SET contact = '09' || LPAD(((suppliers_id * 7919) % 1000000000)::text, 9, '0'),
      updated_at = NOW()
  WHERE contact IS NULL
     OR TRIM(contact) = ''
     OR contact !~ '[0-9]'
`);
console.log(`Updated ${result.rowCount} supplier contact(s) to phone numbers.`);
const sample = await client.query(`
  SELECT suppliers_id, supplier_name, contact
  FROM suppliers
  ORDER BY suppliers_id
  LIMIT 8
`);
console.table(sample.rows);
await client.end();
