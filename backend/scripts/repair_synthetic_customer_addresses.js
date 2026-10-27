/**
 * Replace only clear Seed Street placeholder customer addresses with
 * branch-aware synthetic addresses. Does not invent phones or portal emails.
 *
 * Usage: node backend/scripts/repair_synthetic_customer_addresses.js
 */
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

const STREETS = ['Rizal St', 'Bonifacio Ave', 'Mabini St', 'Quezon Ave', 'Osmena Blvd'];

try {
  if (!process.env.DB_PASSWORD) {
    console.error('DB_PASSWORD is not set.');
    process.exit(1);
  }

  // Sync dual phone columns when one side is filled (no invention)
  const synced = await pool.query(`
    WITH a AS (
      UPDATE users
      SET phone = NULLIF(TRIM(contact_number), '')
      WHERE (phone IS NULL OR TRIM(phone) = '')
        AND contact_number IS NOT NULL AND TRIM(contact_number) <> ''
      RETURNING id
    ),
    b AS (
      UPDATE users
      SET contact_number = NULLIF(TRIM(phone), '')
      WHERE (contact_number IS NULL OR TRIM(contact_number) = '')
        AND phone IS NOT NULL AND TRIM(phone) <> ''
      RETURNING id
    )
    SELECT (SELECT COUNT(*)::int FROM a) AS phone_from_contact,
           (SELECT COUNT(*)::int FROM b) AS contact_from_phone
  `);
  console.log('User phone column sync:', synced.rows[0]);

  const { rows } = await pool.query(`
    SELECT c.customer_id, c.address, c.contact_phone, c.portal_email,
           b.id AS branch_id, b.name AS branch_name, b.latitude, b.longitude
    FROM customers c
    LEFT JOIN branches b ON b.id = c.branch_id
    WHERE c.address ILIKE '%Seed Street%'
    ORDER BY c.customer_id
  `);

  let updated = 0;
  for (const row of rows) {
    const city = String(row.branch_name || 'Branch')
      .replace(/\s+Branch$/i, '')
      .trim() || `Branch ${row.branch_id || ''}`.trim();
    const street = STREETS[row.customer_id % STREETS.length];
    const number = 10 + (row.customer_id % 90);
    const nextAddress = `${number} ${street}, ${city}`;

    // Keep coords near branch when available (still synthetic offsets)
    let lat = row.latitude;
    let lon = row.longitude;
    if (lat != null && lon != null) {
      lat = Number(lat) + ((row.customer_id % 7) - 3) * 0.002;
      lon = Number(lon) + ((row.customer_id % 5) - 2) * 0.002;
    }

    if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
      await pool.query(
        `UPDATE customers
         SET address = $1, latitude = $2, longitude = $3, updated_at = NOW()
         WHERE customer_id = $4`,
        [nextAddress, lat, lon, row.customer_id]
      );
    } else {
      await pool.query(
        `UPDATE customers SET address = $1, updated_at = NOW() WHERE customer_id = $2`,
        [nextAddress, row.customer_id]
      );
    }
    updated += 1;
    console.log(`#${row.customer_id}: ${row.address} -> ${nextAddress}`);
  }

  // Normalize customer mobile display format in DB when raw 11-digit 09… present
  const phones = await pool.query(`
    UPDATE customers
    SET contact_phone = regexp_replace(contact_phone, '^(\\d{4})(\\d{3})(\\d{4})$', '\\1 \\2 \\3'),
        updated_at = NOW()
    WHERE contact_phone ~ '^09\\d{9}$'
    RETURNING customer_id, contact_phone
  `);
  console.log(`Normalized ${phones.rows.length} customer mobile numbers.`);

  const personPhones = await pool.query(`
    UPDATE customers
    SET contact_person_phone = regexp_replace(contact_person_phone, '^(\\d{4})(\\d{3})(\\d{4})$', '\\1 \\2 \\3'),
        updated_at = NOW()
    WHERE contact_person_phone ~ '^09\\d{9}$'
    RETURNING customer_id
  `);
  console.log(`Normalized ${personPhones.rows.length} contact-person mobiles.`);

  const remaining = await pool.query(`
    SELECT COUNT(*)::int AS n FROM customers WHERE address ILIKE '%Seed Street%'
  `);
  const exampleEmails = await pool.query(`
    SELECT COUNT(*)::int AS n FROM customers WHERE portal_email ILIKE '%@example.ph'
  `);
  const missingUserPhones = await pool.query(`
    SELECT COUNT(*)::int AS n FROM users
    WHERE COALESCE(NULLIF(TRIM(phone), ''), NULLIF(TRIM(contact_number), '')) IS NULL
  `);

  console.log('\nSummary');
  console.log(`  seed addresses repaired: ${updated}`);
  console.log(`  seed addresses remaining: ${remaining.rows[0].n}`);
  console.log(`  @example.ph portal emails (manual review): ${exampleEmails.rows[0].n}`);
  console.log(`  users still missing phone (manual review): ${missingUserPhones.rows[0].n}`);
} finally {
  await pool.end();
}
