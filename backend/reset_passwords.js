import pkg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'corvex_db',
  password: process.env.DB_PASSWORD || '100802',
  port:     Number(process.env.DB_PORT) || 5432,
});

// Reset all seeded role passwords to their defined values
const rolePasswords = [
  { role_id: 1, name: 'Super Admin',       password: 'SuperAdmin@2026' },
  { role_id: 2, name: 'Operating Manager', password: 'OpManager@2026' },
  { role_id: 3, name: 'Branch Manager',    password: 'BranchMgr@2026' },
  { role_id: 4, name: 'Sales Agent',       password: 'Sales@2026' },
  { role_id: 5, name: 'Collector',         password: 'Collector@2026' },
  { role_id: 6, name: 'Warehouse Staff',   password: 'InvStaff@2026' },
  { role_id: 7, name: 'Customer',          password: 'Customer@2026' },
];

async function run() {
  console.log(`Resetting passwords for ${rolePasswords.length} roles...`);
  for (const { role_id, name, password } of rolePasswords) {
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      `UPDATE role_credentials SET password_hash = $1 WHERE role_id = $2 RETURNING id`,
      [hash, role_id]
    );
    if (r.rows.length > 0) {
      console.log(`  ✓ ${name} (Role ID: ${role_id})`);
    } else {
      console.log(`  ✗ NOT FOUND: ${name}`);
    }
  }
  console.log('\nDone! All role passwords reset.');
  pool.end();
}

run();
