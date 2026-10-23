/**
 * Safely normalize synthetic populate-script branch contacts.
 * Only updates rows that still match known placeholder patterns.
 * Does NOT invent real business addresses or replace non-synthetic phones.
 *
 * Usage: node backend/scripts/repair_synthetic_branch_contacts.js
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

/** City label (without trailing " Branch") → landline area code */
const AREA_BY_CITY = {
  'Cagayan de Oro': '088',
  'Zamboanga City': '062',
  'Butuan City': '085',
  'Iligan City': '063',
  'Cotabato City': '064',
  'Tagum City': '084',
  'Digos City': '082',
  'Panabo City': '084',
  'Koronadal City': '083',
  'Kidapawan City': '064',
  'Surigao City': '086',
  'Tacloban City': '053',
  'Cebu City': '032',
  'Mandaue City': '032',
  'Lapu-Lapu City': '032',
  'Iloilo City': '033',
  'Bacolod City': '034',
  'Dumaguete City': '035',
  'Puerto Princesa': '048',
  'Legazpi City': '052',
  'Naga City': '054',
  'Lucena City': '042',
  'Batangas City': '043',
  'Calamba City': '049',
  'Antipolo City': '02',
  'Baguio City': '074',
  'Dagupan City': '075',
  'San Fernando Pampanga': '045',
  'Angeles City': '045',
  'Olongapo City': '047',
  'Tarlac City': '045',
  'Cabanatuan City': '044',
  'Malolos City': '044',
  'Imus City': '046',
  'Bacoor City': '046',
  'Dasmarinas City': '046',
  'Santa Rosa Laguna': '049',
  'Biñan City': '049',
  'Quezon City Hub': '02',
  'Makati Hub': '02',
  'Pasig Hub': '02',
  'Manila Hub': '02',
  'Parañaque Hub': '02',
  'Las Piñas Hub': '02',
  'Marikina Hub': '02',
  'Tuguegarao City': '078',
  'Santiago City': '078',
};

function cityEmailSlug(city) {
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function formatLandline(areaCode, local7) {
  const area = String(areaCode).replace(/\D/g, '');
  const local = String(local7).replace(/\D/g, '').padStart(7, '0').slice(-7);
  return `(${area}) ${local.slice(0, 3)}-${local.slice(3)}`;
}

function isSyntheticPhone(phone) {
  // populate_to_fifty pattern: (082) 21XXXXX without hyphen, or already hyphenated 21X-XXXX
  return /^\(0\d{1,3}\)\s*21\d{5}$/.test(String(phone || '').trim())
    || /^\(0\d{1,3}\)\s*21\d-\d{4}$/.test(String(phone || '').trim());
}

function isPlaceholderAddress(address) {
  return /^100 Main Ave,/i.test(String(address || '').trim());
}

const STREETS = ['Rizal Ave', 'Bonifacio St', 'Quezon Blvd', 'Mabini St', 'Osmena Ave'];

try {
  if (!process.env.DB_PASSWORD) {
    console.error('DB_PASSWORD is not set.');
    process.exit(1);
  }

  const { rows } = await pool.query(
    `SELECT id, name, address, phone, email, region FROM branches ORDER BY id`
  );

  let phoneUpdates = 0;
  let emailUpdates = 0;
  let addressUpdates = 0;
  const manualReview = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const city = String(row.name || '').replace(/\s+Branch$/i, '').trim();
    const area = AREA_BY_CITY[city];
    const patches = {};

    if (isSyntheticPhone(row.phone)) {
      const digits = String(row.phone).replace(/\D/g, '');
      const local7 = digits.slice(-7);
      const nextArea = area || digits.slice(0, digits.length - 7) || '082';
      const nextPhone = formatLandline(nextArea, local7);
      if (nextPhone !== row.phone) {
        patches.phone = nextPhone;
      }
    }

    const expectedEmail = `${cityEmailSlug(city)}@corvex.ph`;
    if (
      row.email
      && String(row.email).endsWith('@corvex.ph')
      && (
        row.email.includes('bi.an.')
        || (expectedEmail && row.email !== expectedEmail && cityEmailSlug(city))
      )
      && AREA_BY_CITY[city]
    ) {
      // Only auto-fix clearly malformed slug emails (e.g. Biñan → bi.an.city)
      if (row.email.includes('bi.an.') || /[^a-z0-9.@-]/.test(row.email)) {
        patches.email = expectedEmail;
      } else if (row.email !== expectedEmail && city.includes('ñ')) {
        patches.email = expectedEmail;
      }
    }

    if (isPlaceholderAddress(row.address) && city) {
      patches.address = `${100 + (row.id % 80)} ${STREETS[row.id % STREETS.length]}, ${city}`;
    }

    if (!area && isSyntheticPhone(row.phone)) {
      manualReview.push({ id: row.id, name: row.name, reason: 'No area-code map for city; phone format only' });
    }
    if (!isSyntheticPhone(row.phone) && !isPlaceholderAddress(row.address)) {
      // leave authentic-looking rows alone
    }

    const keys = Object.keys(patches);
    if (!keys.length) continue;

    const sets = keys.map((k, idx) => `${k} = $${idx + 1}`).join(', ');
    const values = keys.map((k) => patches[k]);
    values.push(row.id);
    await pool.query(
      `UPDATE branches SET ${sets}, updated_at = NOW() WHERE id = $${values.length}`,
      values
    );
    if (patches.phone) phoneUpdates += 1;
    if (patches.email) emailUpdates += 1;
    if (patches.address) addressUpdates += 1;
    console.log(`Updated #${row.id} ${row.name}:`, patches);
  }

  console.log('\nSummary:');
  console.log(`  phones updated:   ${phoneUpdates}`);
  console.log(`  emails updated:   ${emailUpdates}`);
  console.log(`  addresses updated:${addressUpdates}`);
  if (manualReview.length) {
    console.log('\nManual review:');
    console.table(manualReview);
  }

  // Flag remaining users without phone for ops review (no invention)
  const missingPhones = await pool.query(
    `SELECT id, full_name, email, role_id
     FROM users
     WHERE COALESCE(NULLIF(TRIM(phone), ''), NULLIF(TRIM(contact_number), '')) IS NULL
     ORDER BY id
     LIMIT 20`
  );
  console.log(`\nUsers missing phone (sample ${missingPhones.rows.length}; not auto-filled):`);
  console.table(missingPhones.rows);

  const seedCustomers = await pool.query(
    `SELECT customer_id, first_name, last_name, address, portal_email
     FROM customers
     WHERE address ILIKE '%Seed Street%' OR portal_email ILIKE '%@example.ph'
     ORDER BY customer_id
     LIMIT 15`
  );
  console.log(`\nCustomers still on seed placeholders (manual review; not auto-filled): ${seedCustomers.rows.length}+`);
  console.table(seedCustomers.rows);
} finally {
  await pool.end();
}
