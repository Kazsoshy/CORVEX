import pkg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DB_PASSWORD) {
  console.error('DB_PASSWORD is not set.');
  process.exit(1);
}

if (!process.env.RESET_PASSWORD || process.env.RESET_PASSWORD.length < 8) {
  console.error('Set RESET_PASSWORD to the new password (at least 8 characters).');
  process.exit(1);
}

const { Pool } = pkg;
const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'corvex',
  password: process.env.DB_PASSWORD,
  port:     Number(process.env.DB_PORT) || 5432,
});

const emails = [
  'marcus.santos@corvex.ph',
  'corazon.v@corvex.ph',
  'rodrigo.n@corvex.ph',
  'elena.mercado@corvex.ph',
  'roberto.villanueva@corvex.ph',
  'miguel.f@corvex.ph',
  'grace.t@corvex.ph',
  'ana.r@corvex.ph',
  'ben.c@corvex.ph',
  'florencia.r@corvex.ph',
  'danilo.o@corvex.ph',
  'carlos.m@corvex.ph',
  'jane.s@corvex.ph',
  'robert.l@corvex.ph',
  'patricia.c@corvex.ph',
  'jose.b@corvex.ph',
  'maria.dc@corvex.ph',
  'john.dc@corvex.ph',
  'pedro.g@corvex.ph',
  'luz.b@corvex.ph',
  'ramon.a@corvex.ph',
  'luntiang.tahanan@email.com',
  'furniture.plus@gensan.ph',
  'casa.moderna@email.com',
  'abode.furniture@gensan.ph',
  'mabuhay.sala@davao.ph',
];

async function run() {
  const hash = await bcrypt.hash(process.env.RESET_PASSWORD, 12);
  console.log(`Resetting passwords for ${emails.length} users...`);
  for (const email of emails) {
    const result = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id`,
      [hash, email]
    );
    console.log(result.rows.length ? `  updated ${email}` : `  not found ${email}`);
  }
  await pool.end();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
