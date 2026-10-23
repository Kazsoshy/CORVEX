/**
 * Constrain all seeded operational data to the three legitimate CORVEX branches:
 *   - Davao City Branch
 *   - General Santos Branch
 *   - Davao Oriental Branch
 *
 * Reassigns FKs from extra branches, fixes customer/territory locations,
 * merges colliding branch_inventory rows, then deletes invalid branches.
 *
 * Usage: node backend/scripts/fix_seed_to_three_branches.js
 */
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { alignCentralInventory, deriveStockStatus } from '../lib/branchInventoryStock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = pkg;

if (!process.env.DB_PASSWORD) {
  console.error('DB_PASSWORD is not set.');
  process.exit(1);
}

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

const CITY_META = {
  davao: {
    city: 'Davao City',
    lat: 7.0731,
    lon: 125.6128,
    streets: ['Quimpo Blvd', 'JP Laurel Ave', 'C.M. Recto Ave', 'Buhangin Road', 'Matina Aplaya'],
    areas: ['Buhangin', 'Talomo', 'Toril', 'Agdao', 'Matina'],
  },
  gensan: {
    city: 'General Santos City',
    lat: 6.1164,
    lon: 125.1756,
    streets: ['Magsaysay Ave', 'Pioneer Ave', 'National Highway', 'Bulaong Blvd', 'City Heights'],
    areas: ['Lagao', 'Bula', 'Apopong', 'Calumpang', 'Dadiangas'],
  },
  oriental: {
    city: 'Mati City',
    lat: 6.9564,
    lon: 126.2219,
    streets: ['Dahican Road', 'Rizal St', 'Central Market Rd', 'Madang Village', 'Mayo Proper'],
    areas: ['Dahican', 'Central', 'Madang', 'Badas', 'Mayo'],
  },
};

function cityKeyForBranchName(name) {
  if (/davao city/i.test(name)) return 'davao';
  if (/general santos/i.test(name)) return 'gensan';
  if (/davao oriental/i.test(name)) return 'oriental';
  return null;
}

function mapBadToAllowed(badId, allowedIds) {
  // Stable round-robin across the 3 allowed branches
  return allowedIds[Number(badId) % allowedIds.length];
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allowedRes = await client.query(`
      SELECT id, name FROM branches
      WHERE name ILIKE '%Davao City%'
         OR name ILIKE '%General Santos%'
         OR name ILIKE '%Davao Oriental%'
      ORDER BY id
    `);
    if (allowedRes.rows.length !== 3) {
      throw new Error(
        `Expected exactly 3 allowed branches, found ${allowedRes.rows.length}: ${allowedRes.rows.map((b) => b.name).join(', ')}`
      );
    }

    const allowedIds = allowedRes.rows.map((b) => b.id);
    const branchMeta = {};
    for (const b of allowedRes.rows) {
      const key = cityKeyForBranchName(b.name);
      if (!key) throw new Error(`Could not map allowed branch name: ${b.name}`);
      branchMeta[b.id] = { ...CITY_META[key], branchName: b.name };
    }
    console.log('Allowed branches:', allowedRes.rows);

    const badRes = await client.query(
      `
      SELECT id, name FROM branches
      WHERE id <> ALL($1::int[])
      ORDER BY id
    `,
      [allowedIds]
    );
    const badIds = badRes.rows.map((b) => b.id);
    console.log(`Bad branches to remove: ${badIds.length}`);
    if (!badIds.length) {
      console.log('No invalid branches. Still normalizing seed locations on allowed branches…');
    }

    // Clear manager_id on branches that will be deleted (avoid FK issues)
    if (badIds.length) {
      await client.query(`UPDATE branches SET manager_id = NULL WHERE id = ANY($1::int[])`, [badIds]);
    }

    // Remap helper: bad branch id -> allowed branch id
    const remap = (branchId) => {
      if (branchId == null) return null;
      if (allowedIds.includes(branchId)) return branchId;
      return mapBadToAllowed(branchId, allowedIds);
    };

    // ------------------------------------------------------------------
    // Users
    // ------------------------------------------------------------------
    if (badIds.length) {
      const users = await client.query(
        `SELECT id, branch_id FROM users WHERE branch_id = ANY($1::int[])`,
        [badIds]
      );
      for (const u of users.rows) {
        await client.query(`UPDATE users SET branch_id = $1 WHERE id = $2`, [
          remap(u.branch_id),
          u.id,
        ]);
      }
      console.log(`Remapped users: ${users.rows.length}`);
    }

    // Ensure each allowed branch has a branch_manager assigned as manager_id
    for (const branchId of allowedIds) {
      const mgr = await client.query(
        `
        SELECT u.id FROM users u
        JOIN roles r ON r.role_id = u.role_id
        WHERE r.slug = 'branch_manager' AND u.branch_id = $1 AND u.status = 'Active'
        ORDER BY u.id LIMIT 1
      `,
        [branchId]
      );
      if (mgr.rows[0]) {
        await client.query(`UPDATE branches SET manager_id = $1 WHERE id = $2`, [
          mgr.rows[0].id,
          branchId,
        ]);
      }
    }

    // ------------------------------------------------------------------
    // Territories
    // ------------------------------------------------------------------
    if (badIds.length) {
      const terr = await client.query(
        `SELECT territory_id, branch_id FROM territories WHERE branch_id = ANY($1::int[])`,
        [badIds]
      );
      for (const t of terr.rows) {
        const newBranch = remap(t.branch_id);
        const meta = branchMeta[newBranch];
        const area = meta.areas[t.territory_id % meta.areas.length];
        await client.query(
          `
          UPDATE territories
          SET branch_id = $1,
              territory_name = $2,
              coverage_area = $3
          WHERE territory_id = $4
        `,
          [
            newBranch,
            `${meta.city} Zone ${t.territory_id}`,
            `${area} and nearby barangays, ${meta.city}`,
            t.territory_id,
          ]
        );
      }
      console.log(`Remapped territories: ${terr.rows.length}`);
    }

    // Normalize territory labels that still mention other cities
    const allTerr = await client.query(`SELECT territory_id, branch_id, territory_name, coverage_area FROM territories`);
    for (const t of allTerr.rows) {
      const meta = branchMeta[t.branch_id];
      if (!meta) continue;
      const needsFix =
        !t.coverage_area?.toLowerCase().includes(meta.city.toLowerCase().split(' ')[0]) &&
        !t.coverage_area?.toLowerCase().includes('mati');
      // Always ensure coverage mentions the correct city for remapped seed names
      if (/Territory Seed/i.test(t.territory_name) || needsFix) {
        const area = meta.areas[t.territory_id % meta.areas.length];
        await client.query(
          `
          UPDATE territories
          SET territory_name = COALESCE(NULLIF(territory_name, ''), $2),
              coverage_area = $3
          WHERE territory_id = $1
            AND (territory_name ILIKE 'Territory Seed%' OR coverage_area ILIKE '%Branch %')
        `,
          [
            t.territory_id,
            `${meta.city} Zone ${t.territory_id}`,
            `${area} and nearby barangays, ${meta.city}`,
          ]
        );
      }
      if (/Territory Seed/i.test(t.territory_name)) {
        const area = meta.areas[t.territory_id % meta.areas.length];
        await client.query(
          `UPDATE territories SET territory_name = $2, coverage_area = $3 WHERE territory_id = $1`,
          [
            t.territory_id,
            `${meta.city} Zone ${t.territory_id}`,
            `${area} and nearby barangays, ${meta.city}`,
          ]
        );
      }
    }

    // ------------------------------------------------------------------
    // Customers — remap branch + fix address/coords
    // ------------------------------------------------------------------
    const customers = await client.query(`
      SELECT customer_id, branch_id, address, latitude, longitude
      FROM customers
      ORDER BY customer_id
    `);
    let custFixed = 0;
    for (const c of customers.rows) {
      const newBranch = remap(c.branch_id);
      const meta = branchMeta[newBranch];
      if (!meta) continue;

      const street = meta.streets[c.customer_id % meta.streets.length];
      const house = 10 + (c.customer_id % 90);
      const address = `${house} ${street}, ${meta.city}`;
      const lat = Number((meta.lat + ((c.customer_id % 20) - 10) * 0.002).toFixed(7));
      const lon = Number((meta.lon + ((c.customer_id % 16) - 8) * 0.002).toFixed(7));

      const mustRemap = !allowedIds.includes(c.branch_id);
      const addressBad =
        !/davao city|general santos|mati city|davao oriental/i.test(c.address || '') ||
        /Branch \d+/i.test(c.address || '');

      if (mustRemap || addressBad) {
        // Keep territory on same branch if possible
        let territoryId = null;
        const terrPick = await client.query(
          `SELECT territory_id FROM territories WHERE branch_id = $1 ORDER BY territory_id LIMIT 1`,
          [newBranch]
        );
        territoryId = terrPick.rows[0]?.territory_id || null;

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
          [newBranch, territoryId, address, lat, lon, c.customer_id]
        );
        custFixed += 1;
      }
    }
    console.log(`Fixed customers: ${custFixed}`);

    // Re-point account managers / sales agents to staff on the customer's branch when possible
    await client.query(`
      UPDATE customers c
      SET account_manager_id = sub.id
      FROM (
        SELECT DISTINCT ON (u.branch_id) u.branch_id, u.id
        FROM users u
        JOIN roles r ON r.role_id = u.role_id
        WHERE r.slug = 'branch_manager' AND u.status = 'Active'
        ORDER BY u.branch_id, u.id
      ) sub
      WHERE c.branch_id = sub.branch_id
        AND (c.account_manager_id IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM users u2
               WHERE u2.id = c.account_manager_id AND u2.branch_id = c.branch_id
             ))
    `);
    await client.query(`
      UPDATE customers c
      SET assigned_sales_agent_id = sub.id
      FROM (
        SELECT DISTINCT ON (u.branch_id) u.branch_id, u.id
        FROM users u
        JOIN roles r ON r.role_id = u.role_id
        WHERE r.slug = 'sales_staff' AND u.status = 'Active'
        ORDER BY u.branch_id, u.id
      ) sub
      WHERE c.branch_id = sub.branch_id
        AND (c.assigned_sales_agent_id IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM users u2
               WHERE u2.id = c.assigned_sales_agent_id AND u2.branch_id = c.branch_id
             ))
    `);

    // ------------------------------------------------------------------
    // Simple branch_id remaps (no unique collisions)
    // ------------------------------------------------------------------
    const simpleTables = [
      'credit_investigations',
      'purchase_requests',
      'restocks',
      'stock_movements',
      'special_collection_requests',
      'operational_alerts',
      'collection_payment',
      'sales_invoices',
      'performance_summary',
    ];
    for (const table of simpleTables) {
      if (!badIds.length) continue;
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 AND column_name='branch_id'`,
        [table]
      );
      if (!exists.rows.length) continue;

      const updated = await client.query(
        `
        UPDATE "${table}"
        SET branch_id = CASE branch_id
          ${badIds.map((id) => `WHEN ${id} THEN ${remap(id)}`).join('\n')}
          ELSE branch_id
        END
        WHERE branch_id = ANY($1::int[])
      `,
        [badIds]
      );
      console.log(`Remapped ${table}: ${updated.rowCount}`);
    }

    // ------------------------------------------------------------------
    // Inventory transfers — source/dest must differ and be allowed
    // ------------------------------------------------------------------
    if (badIds.length) {
      const transfers = await client.query(`
        SELECT transfer_id, source_branch_id, destination_branch_id
        FROM inventory_transfers
        WHERE source_branch_id = ANY($1::int[])
           OR destination_branch_id = ANY($1::int[])
      `, [badIds]);
      for (const tr of transfers.rows) {
        let src = remap(tr.source_branch_id);
        let dst = remap(tr.destination_branch_id);
        if (src === dst) {
          dst = allowedIds.find((id) => id !== src) || allowedIds[0];
        }
        await client.query(
          `UPDATE inventory_transfers
           SET source_branch_id = $1, destination_branch_id = $2
           WHERE transfer_id = $3`,
          [src, dst, tr.transfer_id]
        );
      }
      console.log(`Remapped inventory_transfers: ${transfers.rows.length}`);
    }

    // ------------------------------------------------------------------
    // branch_inventory — merge on UNIQUE(branch_id, product_id)
    // ------------------------------------------------------------------
    if (badIds.length) {
      const invRows = await client.query(
        `
        SELECT inventory_id, branch_id, product_id, available_stock, quantity, reorder_level
        FROM branch_inventory
        WHERE branch_id = ANY($1::int[])
        ORDER BY inventory_id
      `,
        [badIds]
      );
      let merged = 0;
      let moved = 0;
      for (const row of invRows.rows) {
        const newBranch = remap(row.branch_id);
        const existing = await client.query(
          `SELECT inventory_id, available_stock, reorder_level
           FROM branch_inventory
           WHERE branch_id = $1 AND product_id = $2`,
          [newBranch, row.product_id]
        );
        if (existing.rows[0]) {
          const nextStock =
            Number(existing.rows[0].available_stock || 0) + Number(row.available_stock || 0);
          const reorder = existing.rows[0].reorder_level || row.reorder_level || 5;
          const status = deriveStockStatus(nextStock, reorder);
          await client.query(
            `
            UPDATE branch_inventory
            SET available_stock = $1,
                quantity = $1,
                status = $2,
                stock_status = $2,
                last_updated = CURRENT_TIMESTAMP
            WHERE inventory_id = $3
          `,
            [nextStock, status, existing.rows[0].inventory_id]
          );
          await client.query(`DELETE FROM branch_inventory WHERE inventory_id = $1`, [
            row.inventory_id,
          ]);
          await alignCentralInventory(client, row.product_id);
          merged += 1;
        } else {
          const status = deriveStockStatus(row.available_stock, row.reorder_level || 5);
          await client.query(
            `
            UPDATE branch_inventory
            SET branch_id = $1,
                status = $2,
                stock_status = $2,
                last_updated = CURRENT_TIMESTAMP
            WHERE inventory_id = $3
          `,
            [newBranch, status, row.inventory_id]
          );
          await alignCentralInventory(client, row.product_id);
          moved += 1;
        }
      }
      console.log(`branch_inventory merged=${merged} moved=${moved}`);
    }

    // Rebuild central inventory for all products
    const products = await client.query(`SELECT id FROM products`);
    for (const p of products.rows) {
      await alignCentralInventory(client, p.id);
    }

    // ------------------------------------------------------------------
    // Delete invalid branches
    // ------------------------------------------------------------------
    if (badIds.length) {
      // Final safety: no remaining FKs
      const fkCheckTables = [
        ['users', 'branch_id'],
        ['customers', 'branch_id'],
        ['territories', 'branch_id'],
        ['branch_inventory', 'branch_id'],
        ['restocks', 'branch_id'],
        ['stock_movements', 'branch_id'],
        ['inventory_transfers', 'source_branch_id'],
        ['inventory_transfers', 'destination_branch_id'],
        ['sales_invoices', 'branch_id'],
        ['collection_payment', 'branch_id'],
        ['purchase_requests', 'branch_id'],
        ['credit_investigations', 'branch_id'],
        ['special_collection_requests', 'branch_id'],
        ['operational_alerts', 'branch_id'],
        ['performance_summary', 'branch_id'],
      ];
      for (const [table, col] of fkCheckTables) {
        const exists = await client.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
          [table, col]
        );
        if (!exists.rows.length) continue;
        const left = await client.query(
          `SELECT COUNT(*)::int n FROM "${table}" WHERE "${col}" = ANY($1::int[])`,
          [badIds]
        );
        if (left.rows[0].n > 0) {
          throw new Error(`Still ${left.rows[0].n} rows in ${table}.${col} pointing at bad branches`);
        }
      }

      const del = await client.query(`DELETE FROM branches WHERE id = ANY($1::int[])`, [badIds]);
      console.log(`Deleted invalid branches: ${del.rowCount}`);
    }

    await client.query('COMMIT');

    // Verify
    const finalBranches = await client.query(`SELECT id, name FROM branches ORDER BY id`);
    console.log('\nFinal branches:');
    for (const b of finalBranches.rows) console.log(` - ${b.id}: ${b.name}`);

    const outside = await client.query(`
      SELECT COUNT(*)::int n FROM customers
      WHERE address NOT ILIKE '%Davao City%'
        AND address NOT ILIKE '%General Santos%'
        AND address NOT ILIKE '%Mati City%'
    `);
    console.log(`Customers with address outside 3 cities: ${outside.rows[0].n}`);

    const byBranch = await client.query(`
      SELECT b.name, COUNT(c.customer_id)::int AS customers
      FROM branches b
      LEFT JOIN customers c ON c.branch_id = b.id
      GROUP BY b.id, b.name
      ORDER BY b.id
    `);
    console.log('Customers per branch:', byBranch.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK — fix failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
