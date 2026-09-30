import pkg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { SEED_PASSWORD } from './lib/seedDefaults.js';

dotenv.config();

if (!process.env.DB_PASSWORD) {
  console.error('DB_PASSWORD is not set.');
  process.exit(1);
}

const newPassword = process.env.RESET_PASSWORD || SEED_PASSWORD;
if (newPassword.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

async function run() {
  const hash = await bcrypt.hash(newPassword, 12);
  const result = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() RETURNING id`,
    [hash]
  );
  console.log(`Updated password for ${result.rowCount} user(s). Use: ${newPassword}`);
  await pool.end();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
