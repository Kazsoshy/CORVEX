/**
 * Snap customer pins that drifted outside their own branch area back near the
 * branch depot. Keeps BM leaflet maps from looking like other-branch coverage.
 *
 * Usage: node backend/scripts/fix_branch_customer_coords.js
 */
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const MAX_DEG = 0.35; // ~35–40 km

if (!process.env.DB_PASSWORD) {
  console.error('DB_PASSWORD is not set. Add it to .env and retry.');
  process.exit(1);
}

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const drifted = await client.query(
      `SELECT c.customer_id, c.first_name, c.last_name, c.branch_id, b.name AS branch_name,
              c.latitude::float AS lat, c.longitude::float AS lng,
              b.latitude::float AS branch_lat, b.longitude::float AS branch_lng
       FROM customers c
       JOIN branches b ON b.id = c.branch_id
       WHERE c.latitude IS NOT NULL
         AND c.longitude IS NOT NULL
         AND b.latitude IS NOT NULL
         AND b.longitude IS NOT NULL
         AND (
           ABS(c.latitude::float - b.latitude::float) > $1
           OR ABS(c.longitude::float - b.longitude::float) > $1
         )
       ORDER BY b.name, c.last_name, c.first_name`,
      [MAX_DEG]
    );

    console.log(`Found ${drifted.rows.length} customers outside their branch area.`);

    let fixed = 0;
    for (const row of drifted.rows) {
      const offsetLat = 0.002 + ((row.customer_id % 9) * 0.0015);
      const offsetLng = 0.002 + ((row.customer_id % 7) * 0.0012);
      const signLat = row.customer_id % 2 === 0 ? 1 : -1;
      const signLng = row.customer_id % 3 === 0 ? -1 : 1;
      const nextLat = Number(row.branch_lat) + signLat * offsetLat;
      const nextLng = Number(row.branch_lng) + signLng * offsetLng;

      await client.query(
        `UPDATE customers
         SET latitude = $1, longitude = $2, updated_at = NOW()
         WHERE customer_id = $3`,
        [nextLat, nextLng, row.customer_id]
      );
      fixed += 1;
      console.log(
        `  ${row.branch_name}: ${row.first_name} ${row.last_name}`
        + ` (${row.lat}, ${row.lng}) -> (${nextLat.toFixed(4)}, ${nextLng.toFixed(4)})`
      );
    }

    await client.query('COMMIT');
    console.log(`Fixed ${fixed} customer coordinate(s).`);
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
