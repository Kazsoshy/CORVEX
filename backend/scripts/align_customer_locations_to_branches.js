/**
 * Align customers so branch_id matches their address city, and coords match the branch.
 * Ensures Davao City collectors (e.g. maria.dc) only see Davao City customers.
 *
 * Usage: node backend/scripts/align_customer_locations_to_branches.js
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

const CITY = {
  davao: {
    keys: [/davao city/i],
    city: 'Davao City',
    lat: 7.0731,
    lon: 125.6128,
    streets: ['Quimpo Blvd', 'JP Laurel Ave', 'C.M. Recto Ave', 'Buhangin Road', 'Matina Aplaya'],
  },
  gensan: {
    keys: [/general santos/i, /\bgensan\b/i],
    city: 'General Santos City',
    lat: 6.1164,
    lon: 125.1756,
    streets: ['Magsaysay Ave', 'Pioneer Ave', 'National Highway', 'Bulaong Blvd', 'City Heights'],
  },
  oriental: {
    // Use "Mati City" — do not match Davao barangay "Matina"
    keys: [/davao oriental/i, /mati city/i],
    city: 'Mati City',
    lat: 6.9564,
    lon: 126.2219,
    streets: ['Dahican Road', 'Rizal St', 'Central Market Rd', 'Madang Village', 'Mayo Proper'],
  },
};

function cityKeyFromText(text) {
  const s = String(text || '');
  for (const [key, meta] of Object.entries(CITY)) {
    if (meta.keys.some((re) => re.test(s))) return key;
  }
  return null;
}

function cityKeyFromBranchName(name) {
  if (/davao city/i.test(name || '')) return 'davao';
  if (/general santos/i.test(name || '')) return 'gensan';
  if (/davao oriental/i.test(name || '')) return 'oriental';
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const branches = await client.query(`
      SELECT id, name FROM branches
      WHERE name ILIKE '%Davao City%'
         OR name ILIKE '%General Santos%'
         OR name ILIKE '%Davao Oriental%'
      ORDER BY id
    `);
    const branchIdByCity = {};
    for (const b of branches.rows) {
      const key = cityKeyFromBranchName(b.name);
      if (key) branchIdByCity[key] = b.id;
    }
    if (!branchIdByCity.davao || !branchIdByCity.gensan || !branchIdByCity.oriental) {
      throw new Error('Missing one of Davao City / General Santos / Davao Oriental branches');
    }
    console.log('Branches:', branchIdByCity);

    const collectors = {};
    for (const [key, branchId] of Object.entries(branchIdByCity)) {
      const r = await client.query(
        `
        SELECT u.id FROM users u
        JOIN roles r ON r.role_id = u.role_id
        WHERE r.slug = 'collector' AND u.branch_id = $1 AND u.status = 'Active'
        ORDER BY CASE WHEN u.email = 'maria.dc@corvex.ph' THEN 0 ELSE 1 END, u.id
        LIMIT 1
      `,
        [branchId]
      );
      collectors[key] = r.rows[0]?.id || null;
    }
    console.log('Collectors by city:', collectors);

    const customers = await client.query(`
      SELECT c.customer_id, c.branch_id, c.address, c.latitude, c.longitude, b.name AS branch_name
      FROM customers c
      JOIN branches b ON b.id = c.branch_id
      ORDER BY c.customer_id
    `);

    let moved = 0;
    let coordsFixed = 0;
    const movedIds = { davao: [], gensan: [], oriental: [] };

    for (const c of customers.rows) {
      const branchKey = cityKeyFromBranchName(c.branch_name);
      const addressKey = cityKeyFromText(c.address);
      // Prefer address city when it clearly points to a known branch city
      const targetKey = addressKey || branchKey;
      if (!targetKey) continue;

      const targetBranchId = branchIdByCity[targetKey];
      const meta = CITY[targetKey];
      const street = meta.streets[c.customer_id % meta.streets.length];
      const address = `${10 + (c.customer_id % 90)} ${street}, ${meta.city}`;
      const lat = Number((meta.lat + ((c.customer_id % 20) - 10) * 0.002).toFixed(7));
      const lon = Number((meta.lon + ((c.customer_id % 16) - 8) * 0.002).toFixed(7));

      const branchWrong = c.branch_id !== targetBranchId;
      const addressWrong = addressKey !== targetKey || !String(c.address || '').includes(meta.city.split(' ')[0]);
      // Also fix when on Davao branch but address says GenSan/Mati
      const mismatch = branchKey && addressKey && branchKey !== addressKey;

      if (branchWrong || mismatch || addressWrong) {
        let territoryId = null;
        const terr = await client.query(
          `SELECT territory_id FROM territories WHERE branch_id = $1 ORDER BY territory_id LIMIT 1`,
          [targetBranchId]
        );
        territoryId = terr.rows[0]?.territory_id || null;

        await client.query(
          `
          UPDATE customers
          SET branch_id = $1,
              territory_id = COALESCE($2, territory_id),
              address = $3,
              latitude = $4,
              longitude = $5
          WHERE customer_id = $6
        `,
          [targetBranchId, territoryId, address, lat, lon, c.customer_id]
        );

        // Keep operational rows with the customer
        await client.query(`UPDATE sales_invoices SET branch_id = $1 WHERE customer_id = $2`, [
          targetBranchId,
          c.customer_id,
        ]);
        await client.query(`UPDATE collection_payment SET branch_id = $1 WHERE customer_id = $2`, [
          targetBranchId,
          c.customer_id,
        ]);
        await client.query(
          `UPDATE credit_investigations SET branch_id = $1 WHERE customer_id = $2`,
          [targetBranchId, c.customer_id]
        ).catch(() => {});
        await client.query(
          `UPDATE special_collection_requests SET branch_id = $1 WHERE customer_id = $2`,
          [targetBranchId, c.customer_id]
        ).catch(() => {});
        await client.query(
          `UPDATE purchase_requests SET branch_id = $1 WHERE customer_id = $2`,
          [targetBranchId, c.customer_id]
        ).catch(() => {});

        if (branchWrong || mismatch) {
          moved += 1;
          movedIds[targetKey].push(c.customer_id);
        } else {
          coordsFixed += 1;
        }
      } else {
        // Same city — still snap coords near branch if wildly far (>50km)
        const dlat = Math.abs(Number(c.latitude) - meta.lat);
        const dlon = Math.abs(Number(c.longitude) - meta.lon);
        if (dlat > 0.3 || dlon > 0.3) {
          await client.query(
            `UPDATE customers SET latitude = $1, longitude = $2 WHERE customer_id = $3`,
            [lat, lon, c.customer_id]
          );
          coordsFixed += 1;
        }
      }
    }

    // Reassign collection_payment / field_visits collectors when customer moved
    // away from Davao so maria.dc portfolio no longer pulls them via UNION portfolio
    for (const [cityKey, ids] of Object.entries(movedIds)) {
      if (!ids.length) continue;
      const collectorId = collectors[cityKey];
      if (!collectorId) continue;
      await client.query(
        `UPDATE collection_payment SET collector_id = $1, branch_id = $2
         WHERE customer_id = ANY($3::int[])`,
        [collectorId, branchIdByCity[cityKey], ids]
      );
      await client.query(
        `UPDATE field_visits SET user_id = $1
         WHERE customer_id = ANY($2::int[])
           AND visit_type = 'Collection'`,
        [collectorId, ids]
      );
    }

    // Ensure maria.dc stays on Davao City
    await client.query(
      `UPDATE users SET branch_id = $1
       WHERE email = 'maria.dc@corvex.ph'`,
      [branchIdByCity.davao]
    );

    await client.query('COMMIT');

    console.log(`Moved customers to matching branch: ${moved}`);
    console.log(`Coords/address fixes (same branch): ${coordsFixed}`);
    console.log('Moved IDs:', movedIds);

    // Verify maria portfolio
    const maria = await client.query(
      `SELECT id, branch_id FROM users WHERE email = 'maria.dc@corvex.ph'`
    );
    const mariaId = maria.rows[0]?.id;
    const mariaBranch = maria.rows[0]?.branch_id;
    const onList = await client.query(
      `
      WITH collector_portfolio AS (
        SELECT DISTINCT customer_id FROM (
          SELECT customer_id FROM collection_payment WHERE collector_id = $1
          UNION
          SELECT customer_id FROM field_visits WHERE user_id = $1
        ) p
      )
      SELECT c.customer_id, c.first_name, c.last_name, c.address, b.name AS branch_name
      FROM customers c
      JOIN branches b ON b.id = c.branch_id
      JOIN customer_activity ca ON ca.customer_id = c.customer_id
      WHERE c.branch_id = $2
        AND c.status = 'Active'
        AND COALESCE(ca.outstanding_balance, 0) > 0
        AND (
          NOT EXISTS (SELECT 1 FROM collector_portfolio LIMIT 1)
          OR c.customer_id IN (SELECT customer_id FROM collector_portfolio)
        )
        AND (
          c.address ILIKE '%General Santos%'
          OR c.address ILIKE '%Mati%'
          OR c.address ILIKE '%Davao Oriental%'
        )
      ORDER BY c.customer_id
    `,
      [mariaId, mariaBranch]
    );
    console.log('Maria non-Davao addresses still on her branch list:', onList.rows);

    const counts = await client.query(`
      SELECT b.name, COUNT(*)::int n
      FROM customers c JOIN branches b ON b.id = c.branch_id
      GROUP BY b.name ORDER BY 1
    `);
    console.log('Customers per branch:', counts.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
