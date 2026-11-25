/**
 * Idempotent seed: ONE customer owned by General Santos Branch
 * so a Davao City Sales Agent can exercise Exact Match → branch transfer.
 *
 * Usage: npm run seed:cross-branch-customer
 */
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = pkg;

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

/** Stable identity for idempotent re-runs. */
const SEED = {
  first_name: 'Crossbranch',
  last_name: 'Seedcustomer',
  middle_name: 'One',
  contact_phone: '+63 917 880 1620',
  address_region: 'Region XII (Soccsksargen)',
  address_province: 'General Santos City (HUC)',
  address_city: 'City of General Santos',
  address_barangay: 'Lagao',
  address_street: 'Corner Pioneer Avenue',
  address_zip: '9500',
  latitude: 6.1164,
  longitude: 125.1717,
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const branch = await client.query(
      `SELECT id, name FROM branches WHERE name ILIKE '%General Santos%' ORDER BY id LIMIT 1`
    );
    if (!branch.rows[0]) {
      throw new Error('General Santos Branch not found. Run npm run seed:secondary-branches first.');
    }
    const branchId = branch.rows[0].id;
    const branchName = branch.rows[0].name;

    const territory = await client.query(
      `SELECT territory_id, territory_name
       FROM territories
       WHERE branch_id = $1 AND COALESCE(status, 'Active') = 'Active'
       ORDER BY territory_id
       LIMIT 1`,
      [branchId]
    );
    const territoryId = territory.rows[0]?.territory_id || null;
    const territoryName = territory.rows[0]?.territory_name || null;

    const address = [
      SEED.address_street,
      SEED.address_barangay,
      SEED.address_city,
      SEED.address_province,
    ].join(', ');

    const existing = await client.query(
      `SELECT customer_id FROM customers
       WHERE first_name = $1 AND last_name = $2 AND branch_id = $3
       LIMIT 1`,
      [SEED.first_name, SEED.last_name, branchId]
    );

    let customerId;
    if (existing.rows[0]) {
      customerId = existing.rows[0].customer_id;
      await client.query(
        `UPDATE customers SET
           middle_name = $1,
           contact_phone = $2,
           contact_person_fname = $3,
           contact_person_lname = $4,
           contact_person_phone = $2,
           address = $5,
           address_region = $6,
           address_province = $7,
           address_city = $8,
           address_barangay = $9,
           address_street = $10,
           address_zip = $11,
           latitude = $12,
           longitude = $13,
           territory_id = COALESCE($14, territory_id),
           status = 'Active',
           phone_verification_status = 'Verified',
           updated_at = CURRENT_TIMESTAMP
         WHERE customer_id = $15`,
        [
          SEED.middle_name,
          SEED.contact_phone,
          SEED.first_name,
          SEED.last_name,
          address,
          SEED.address_region,
          SEED.address_province,
          SEED.address_city,
          SEED.address_barangay,
          SEED.address_street,
          SEED.address_zip,
          SEED.latitude,
          SEED.longitude,
          territoryId,
          customerId,
        ]
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO customers (
           branch_id, first_name, middle_name, last_name,
           contact_phone, contact_person_fname, contact_person_lname, contact_person_phone,
           address, address_region, address_province, address_city, address_barangay, address_street, address_zip,
           latitude, longitude, territory_id, status, phone_verification_status, customer_type
         ) VALUES (
           $1,$2,$3,$4,
           $5,$2,$4,$5,
           $6,$7,$8,$9,$10,$11,$12,
           $13,$14,$15,'Active','Verified','Individual'
         )
         RETURNING customer_id`,
        [
          branchId,
          SEED.first_name,
          SEED.middle_name,
          SEED.last_name,
          SEED.contact_phone,
          address,
          SEED.address_region,
          SEED.address_province,
          SEED.address_city,
          SEED.address_barangay,
          SEED.address_street,
          SEED.address_zip,
          SEED.latitude,
          SEED.longitude,
          territoryId,
        ]
      );
      customerId = inserted.rows[0].customer_id;
    }

    const code = `C-${customerId}-2026`;
    await client.query(
      `UPDATE customers SET customer_code = $1 WHERE customer_id = $2 AND (customer_code IS NULL OR customer_code = '')`,
      [code, customerId]
    );

    await client.query(
      `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume, last_collection_date, last_sales_visit)
       VALUES ($1, 12500, 48000, CURRENT_DATE - 12, CURRENT_DATE - 5)
       ON CONFLICT (customer_id) DO UPDATE
         SET outstanding_balance = EXCLUDED.outstanding_balance,
             purchase_volume = EXCLUDED.purchase_volume,
             updated_at = CURRENT_TIMESTAMP`,
      [customerId]
    );

    const row = await client.query(
      `SELECT c.customer_id, c.customer_code, c.first_name, c.middle_name, c.last_name,
              c.contact_phone, c.status, c.branch_id, b.name AS branch_name,
              c.territory_id, t.territory_name,
              c.address_street, c.address_barangay, c.address_city, c.address_province,
              c.latitude, c.longitude
       FROM customers c
       JOIN branches b ON b.id = c.branch_id
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       WHERE c.customer_id = $1`,
      [customerId]
    );

    await client.query('COMMIT');

    const info = row.rows[0];
    console.log('');
    console.log('Cross-branch seed customer ready (home branch ≠ Davao City):');
    console.log('────────────────────────────────────────');
    console.log(`  Name:           ${[info.first_name, info.middle_name, info.last_name].filter(Boolean).join(' ')}`);
    console.log(`  Customer ID:    ${info.customer_id}`);
    console.log(`  Customer code:  ${info.customer_code}`);
    console.log(`  Phone:          ${info.contact_phone}`);
    console.log(`  Status:         ${info.status}`);
    console.log(`  Home branch:    ${info.branch_name} (id ${info.branch_id})`);
    console.log(`  Territory:      ${info.territory_name || '—'} (${info.territory_id || '—'})`);
    console.log(`  Address:        ${[info.address_street, info.address_barangay, info.address_city, info.address_province].filter(Boolean).join(', ')}`);
    console.log(`  Map pin:        ${info.latitude}, ${info.longitude}`);
    console.log('────────────────────────────────────────');
    console.log('Find via Sales → Customers → Find Existing Customer using phone or name.');
    console.log(`Expected home branch for transfer tests: ${branchName}`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
