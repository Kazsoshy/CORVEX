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

// Reset all seeded user passwords to their defined values
const userPasswords = [
  { email: 'marcus.santos@corvex.ph',         password: 'SuperAdmin@2026' },
  { email: 'corazon.v@corvex.ph',             password: 'SuperAdmin@2026' },
  { email: 'rodrigo.n@corvex.ph',             password: 'SuperAdmin@2026' },
  { email: 'elena.mercado@corvex.ph',         password: 'OpManager@2026' },
  { email: 'roberto.villanueva@corvex.ph',    password: 'BranchMgr@2026' },
  { email: 'miguel.f@corvex.ph',              password: 'BranchMgr@2026' },
  { email: 'grace.t@corvex.ph',               password: 'BranchMgr@2026' },
  { email: 'ana.r@corvex.ph',                 password: 'InvStaff@2026' },
  { email: 'ben.c@corvex.ph',                 password: 'InvStaff@2026' },
  { email: 'florencia.r@corvex.ph',           password: 'InvStaff@2026' },
  { email: 'danilo.o@corvex.ph',              password: 'InvStaff@2026' },
  { email: 'carlos.m@corvex.ph',              password: 'Sales@2026' },
  { email: 'jane.s@corvex.ph',                password: 'Sales@2026' },
  { email: 'robert.l@corvex.ph',              password: 'Sales@2026' },
  { email: 'patricia.c@corvex.ph',            password: 'Sales@2026' },
  { email: 'jose.b@corvex.ph',                password: 'Sales@2026' },
  { email: 'maria.dc@corvex.ph',              password: 'Collector@2026' },
  { email: 'john.dc@corvex.ph',               password: 'Collector@2026' },
  { email: 'pedro.g@corvex.ph',               password: 'Collector@2026' },
  { email: 'luz.b@corvex.ph',                 password: 'Collector@2026' },
  { email: 'ramon.a@corvex.ph',               password: 'Collector@2026' },
  { email: 'luntiang.tahanan@email.com',      password: 'Client@2026' },
  { email: 'furniture.plus@gensan.ph',        password: 'Client@2026' },
  { email: 'casa.moderna@email.com',          password: 'Client@2026' },
  { email: 'abode.furniture@gensan.ph',       password: 'Client@2026' },
  { email: 'mabuhay.sala@davao.ph',           password: 'Client@2026' },
];

async function run() {
  console.log(`Resetting passwords for ${userPasswords.length} users...`);
  for (const { email, password } of userPasswords) {
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, full_name`,
      [hash, email]
    );
    if (r.rows.length > 0) {
      console.log(`  ✓ ${r.rows[0].full_name} (${email})`);
    } else {
      console.log(`  ✗ NOT FOUND: ${email}`);
    }
  }
  console.log('\nDone! All passwords reset.');
  pool.end();
}

run();
