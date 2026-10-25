/**
 * Top up every applicable public table to at least 50 rows.
 * Preserves existing data; inserts only the deficit.
 *
 * Usage: node backend/scripts/populate_to_fifty.js
 */
import crypto from 'crypto';
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SEED_PASSWORD_HASH } from '../lib/seedDefaults.js';
import { alignCentralInventory, deriveStockStatus } from '../lib/branchInventoryStock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = pkg;
const TARGET = 50;

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

const FIRST = [
  'Aida', 'Ben', 'Cora', 'Dan', 'Eva', 'Fred', 'Gina', 'Hugo', 'Ivy', 'Jake',
  'Kara', 'Luis', 'Mira', 'Noel', 'Olga', 'Pete', 'Quin', 'Rita', 'Sam', 'Tess',
  'Ulan', 'Vera', 'Wade', 'Xena', 'Yuri', 'Zara', 'Aldo', 'Belen', 'Chito', 'Dina',
  'Efren', 'Fely', 'Gino', 'Helen', 'Isko', 'Joy', 'Keno', 'Lina', 'Mark', 'Nida',
  'Omar', 'Pia', 'Ramon', 'Susan', 'Tito', 'Una', 'Vince', 'Wena', 'Yani', 'Zeke',
];
const LAST = [
  'Abad', 'Bautista', 'Cruz', 'Dizon', 'Espiritu', 'Flores', 'Garcia', 'Hernandez',
  'Ibanez', 'Javier', 'Katigbak', 'Lopez', 'Mendoza', 'Navarro', 'Ocampo', 'Pascual',
  'Quezon', 'Reyes', 'Santos', 'Torres', 'Umali', 'Villanueva', 'Wong', 'Xavier',
  'Yap', 'Zamora', 'Alvarez', 'Briones', 'Castillo', 'Delgado', 'Enriquez', 'Ferrer',
  'Gomez', 'Hilario', 'Ignacio', 'Jimenez', 'Kho', 'Lim', 'Morales', 'Nolasco',
  'Ortega', 'Pineda', 'Quinto', 'Ramos', 'Salazar', 'Tan', 'Ubaldo', 'Valdez',
  'Wagan', 'Yulo',
];

/**
 * Location templates for the branches that exist in CORVEX today.
 * Seeded customers/territories use these cities/coords — do not invent other city branches.
 */
const BRANCH_LOCATION_META = {
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

function metaForBranchName(name) {
  if (/davao city/i.test(name || '')) return BRANCH_LOCATION_META.davao;
  if (/general santos/i.test(name || '')) return BRANCH_LOCATION_META.gensan;
  if (/davao oriental/i.test(name || '')) return BRANCH_LOCATION_META.oriental;
  return null;
}

const CATEGORIES = [
  'Sofas & Sectionals', 'Recliners', 'TV Consoles', 'Accent Chairs', 'Ottomans',
  'Beds & Frames', 'Nightstands', 'Wardrobes', 'Dressers', 'Vanity Sets',
  'Dining Tables', 'Dining Chairs', 'Bar Stools', 'Buffets', 'China Cabinets',
  'Office Desks', 'Office Chairs', 'Filing Cabinets', 'Bookcases', 'Conference Tables',
  'Patio Sets', 'Garden Benches', 'Outdoor Loungers', 'Umbrella Stands', 'Planter Stands',
  'Foam Mattresses', 'Spring Mattresses', 'Kids Mattresses', 'Pillow Tops', 'Mattress Protectors',
  'Lamps', 'Rugs', 'Mirrors', 'Cushions', 'Wall Décor',
  'Kitchen Carts', 'Storage Cabinets', 'Shoe Racks', 'Coat Racks', 'Room Dividers',
  'Kids Beds', 'Kids Desks', 'Play Tables', 'Bunk Beds', 'Study Shelves',
  'Entry Consoles', 'Hall Trees', 'Sideboards',
];

const PRODUCT_NAMES = [
  'Luna Sofa', 'Nova Loveseat', 'Aria Sectional', 'Cedar Recliner', 'Maple TV Stand',
  'Oak Coffee Table', 'Pine Side Table', 'Elm Accent Chair', 'Birch Ottoman', 'Willow Console',
  'Horizon Bed Queen', 'Horizon Bed King', 'Slate Nightstand', 'Cloud Dresser', 'Aura Wardrobe',
  'Pearl Vanity', 'Grove Dining Table', 'Grove Chair Set', 'Barista Stool', 'Harbor Buffet',
  'Summit Desk', 'Focus Task Chair', 'Archive Cabinet', 'Lexicon Bookcase', 'Boardroom Table',
  'Breezeway Patio Set', 'Gardenia Bench', 'Sol Lounger', 'Canopy Stand', 'Terra Planter',
  'DreamFoam Twin', 'DreamFoam Queen', 'CoilMaster King', 'Kids Cloud Mattress', 'SoftGuard Protector',
  'Lumen Floor Lamp', 'Meadow Rug', 'Clarity Mirror', 'Plush Cushion', 'Gallery Frame Set',
  'Chef Cart', 'Pantry Cabinet', 'Entry Shoe Rack', 'Oak Coat Rack', 'Fold Divider',
  'Scout Kids Bed', 'Study Buddy Desk', 'Playtime Table', 'Twin Bunk', 'Shelf Nest',
  'Foyer Console', 'Hall Tree Plus', 'Metro Sideboard', 'Compact Sleeper',
];

const SUPPLIER_ORGS = [
  'Mindanao Woodcraft Co', 'Visayas Foam Industries', 'Metro Furnishings Inc',
  'Southern Steel Frames', 'Island Rattan Works', 'Pacific Upholstery Hub',
  'Northern Timber Supply', 'Cebu Cabinet Makers', 'Davao Foam & Spring',
  'Gensan Metal Works', 'Laguna Laminates', 'Bicol Weave Traders',
  'Iloilo Home Components', 'NCR Logistics Furnishings', 'Caraga Softgoods',
  'Zamboanga Import Desk', 'Cotabato Wood Alliance', 'Tagum Plywood Depot',
  'Panabo Hardware Furnishings', 'Koronadal Living Goods', 'Kidapawan Craft Co',
  'Surigao Coastal Supply', 'Tacloban Home Parts', 'Mandaue Assembly Line',
  'Lapu Furniture Parts', 'Bacolod Soft Seat Co', 'Dumaguete Design Mill',
  'Palawan Island Goods', 'Legazpi Home Depot', 'Naga Interior Supply',
  'Lucena Trade Furnishings', 'Batangas Port Goods', 'Calamba Panel Works',
  'Antipolo Craft House', 'Baguio Pine Furnishings', 'Dagupan Coastal Goods',
  'Pampanga Steel Seating', 'Angeles Home Parts', 'Olongapo Trade Desk',
  'Tarlac Timber Line', 'Cabanatuan Softgoods', 'Malolos Living Supply',
  'Imus Panel Depot', 'Bacoor Home Works', 'Dasmarinas Foam Lab',
  'Santa Rosa Cabinetry', 'Biñan Assembly Co', 'Quezon City Softgoods',
  'Makati Contract Furnishings', 'Pasig Modular Parts', 'Manila Upholstery Hub',
];

const EXTRA_PERMISSIONS = [
  ['View Branches', 'View branch directory and status'],
  ['Manage Branches', 'Create and update branch records'],
  ['View Territories', 'View territory coverage maps'],
  ['Manage Territories', 'Assign and edit territories'],
  ['View Products', 'Browse product catalog'],
  ['Manage Products', 'Create and update products'],
  ['View Categories', 'View product categories'],
  ['Manage Categories', 'Create and update categories'],
  ['View Suppliers', 'View supplier directory'],
  ['Manage Suppliers', 'Create and update suppliers'],
  ['View Inventory', 'View branch and central stock'],
  ['Adjust Inventory', 'Perform stock count adjustments'],
  ['Approve Transfers', 'Approve inventory transfers'],
  ['View Restocks', 'View restock delivery records'],
  ['Record Restocks', 'Create restock receipts'],
  ['View Sales Invoices', 'View sales invoices'],
  ['Create Sales Invoices', 'Draft and confirm invoices'],
  ['Review Sales Invoices', 'Approve pending sales invoices'],
  ['View Collections', 'View collection payments'],
  ['Record Collections', 'Post collection payments'],
  ['View Credit History', 'View customer credit ledger'],
  ['Manage Credit Limits', 'Approve credit limit changes'],
  ['View Field Visits', 'View scheduled field visits'],
  ['Manage Field Visits', 'Schedule and complete visits'],
  ['View Field Reports', 'View field activity reports'],
  ['Submit Field Reports', 'Create field activity reports'],
  ['View SAW Results', 'View SAW ranking outputs'],
  ['Run SAW Engine', 'Trigger SAW generation jobs'],
  ['View Notifications', 'Read in-app notifications'],
  ['Manage Notifications', 'Broadcast operational notices'],
  ['View Audit Logs', 'Inspect system audit trails'],
  ['View Performance', 'View branch performance summaries'],
  ['View Purchase Requests', 'View customer purchase requests'],
  ['Process Purchase Requests', 'Confirm or reject purchase requests'],
  ['View Credit Investigations', 'View CI submissions'],
  ['Approve Credit Investigations', 'Approve or reject CI cases'],
  ['View Special Collections', 'View special collection requests'],
  ['Approve Special Collections', 'Approve special collection requests'],
  ['View Operational Alerts', 'View operational alert feed'],
  ['Resolve Operational Alerts', 'Mark alerts resolved'],
  ['View Portal Invitations', 'View customer portal invites'],
  ['Send Portal Invitations', 'Invite customers to portal'],
  ['View Offline Queue', 'Inspect offline sync queue'],
  ['Manage Offline Queue', 'Retry or clear sync items'],
  ['View System Backups', 'List system backup jobs'],
  ['Create System Backups', 'Trigger backup jobs'],
  ['View Reports', 'Access standard operational reports'],
  ['Export Reports', 'Export report datasets'],
];

const EXTRA_PAYMENT_METHODS = [
  'Credit Card', 'COD', 'ShopeePay', 'GrabPay', 'BPI Online',
  'UnionBank Online', 'PayPal', 'Post-Dated Check', 'Installment',
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function timeOfDay(i) {
  const h = String(8 + (i % 10)).padStart(2, '0');
  const m = String((i * 7) % 60).padStart(2, '0');
  return `${h}:${m}:00`;
}

async function count(client, table) {
  const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
  return r.rows[0].n;
}

async function listTables(client) {
  const r = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  return r.rows.map((x) => x.tablename);
}

async function need(client, table, target = TARGET) {
  const n = await count(client, table);
  return Math.max(0, target - n);
}

async function pickIds(client, sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows;
}

async function main() {
  const client = await pool.connect();
  const report = {
    before: {},
    inserted: {},
    after: {},
    skipped: {},
    errors: [],
  };

  try {
    const tables = await listTables(client);
    for (const t of tables) report.before[t] = await count(client, t);

    console.log('Starting populate_to_fifty — target', TARGET);
    console.log('Before counts:', report.before);

    await client.query('BEGIN');

    // ------------------------------------------------------------------
    // Lookups that can expand
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'permissions');
      let added = 0;
      for (const [label, description] of EXTRA_PERMISSIONS) {
        if (added >= deficit) break;
        const exists = await client.query(`SELECT 1 FROM permissions WHERE label = $1`, [label]);
        if (exists.rows.length) continue;
        await client.query(
          `INSERT INTO permissions (label, description, status)
           VALUES ($1, $2, 'Active')`,
          [label, description]
        );
        added += 1;
      }
      report.inserted.permissions = added;
    }

    {
      // Expand role_permissions for new permissions (optional; already >= 50)
      const newPerms = await client.query(`
        SELECT p.permission_id
        FROM permissions p
        WHERE NOT EXISTS (
          SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.permission_id
        )
      `);
      const adminRole = await client.query(`SELECT role_id FROM roles WHERE slug = 'super_admin'`);
      const adminId = adminRole.rows[0]?.role_id;
      let added = 0;
      if (adminId) {
        for (const row of newPerms.rows) {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id, granted)
             VALUES ($1, $2, TRUE)
             ON CONFLICT DO NOTHING`,
            [adminId, row.permission_id]
          );
          added += 1;
        }
      }
      report.inserted.role_permissions = added;
    }

    {
      const deficit = await need(client, 'payment_methods');
      let added = 0;
      for (const method of EXTRA_PAYMENT_METHODS) {
        if (added >= deficit) break;
        const exists = await client.query(
          `SELECT 1 FROM payment_methods WHERE method_name = $1`,
          [method]
        );
        if (exists.rows.length) continue;
        await client.query(
          `INSERT INTO payment_methods (method_name, status) VALUES ($1, 'Active')`,
          [method]
        );
        added += 1;
      }
      report.inserted.payment_methods = added;
      if ((await count(client, 'payment_methods')) < TARGET) {
        report.skipped.payment_methods =
          'Limited set of realistic payment channels for PH retail; inventing dozens of duplicate/fake methods would be invalid.';
      }
    }

    {
      const deficit = await need(client, 'product_categories');
      let added = 0;
      for (const name of CATEGORIES) {
        if (added >= deficit) break;
        const exists = await client.query(
          `SELECT 1 FROM product_categories WHERE category_name = $1`,
          [name]
        );
        if (exists.rows.length) continue;
        await client.query(
          `INSERT INTO product_categories (category_name, status) VALUES ($1, 'Active')`,
          [name]
        );
        added += 1;
      }
      report.inserted.product_categories = added;
    }

    // ------------------------------------------------------------------
    // Branches — use existing Davao City / General Santos / Davao Oriental only.
    // Do not create extra city branches; attach seeded data to these locations.
    // ------------------------------------------------------------------
    {
      report.inserted.branches = 0;
      const branchCount = await count(client, 'branches');
      if (branchCount < TARGET) {
        report.skipped.branches =
          'Existing branches are Davao City, General Santos, and Davao Oriental; seeded rows use those locations instead of creating other city branches.';
      }
    }

    // ------------------------------------------------------------------
    // Suppliers
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'suppliers');
      let added = 0;
      for (let i = 0; i < SUPPLIER_ORGS.length && added < deficit; i += 1) {
        const name = SUPPLIER_ORGS[i];
        const exists = await client.query(
          `SELECT 1 FROM suppliers WHERE supplier_name = $1`,
          [name]
        );
        if (exists.rows.length) continue;
        const phoneDigits = String(900000000 + ((i * 7919) % 100000000)).padStart(9, '0');
        const contactNumber = `09${phoneDigits.slice(0, 2)} ${phoneDigits.slice(2, 5)} ${phoneDigits.slice(5)}`;
        await client.query(
          `INSERT INTO suppliers (supplier_name, contact, email, address, status)
           VALUES ($1, $2, $3, $4, 'Active')`,
          [
            name,
            contactNumber,
            `supplier${i + 1}@corvex-supply.ph`,
            `${100 + i} Industrial Park, Mindanao`,
          ]
        );
        added += 1;
      }
      report.inserted.suppliers = added;
    }

    // ------------------------------------------------------------------
    // Products
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'products');
      const cats = await pickIds(client, `SELECT category_id FROM product_categories ORDER BY category_id`);
      const suppliers = await pickIds(client, `SELECT suppliers_id FROM suppliers ORDER BY suppliers_id`);
      let added = 0;
      for (let i = 0; i < PRODUCT_NAMES.length && added < deficit; i += 1) {
        const sku = `CX-SEED-${String(i + 1).padStart(4, '0')}`;
        const exists = await client.query(`SELECT 1 FROM products WHERE sku = $1`, [sku]);
        if (exists.rows.length) continue;
        const categoryId = cats[i % cats.length].category_id;
        const supplierId = suppliers[i % suppliers.length].suppliers_id;
        const price = 1500 + (i % 40) * 750 + (i % 7) * 125;
        await client.query(
          `INSERT INTO products (name, category_id, unit_price, status, sku, description, unit_type, supplier_id, reorder_point)
           VALUES ($1, $2, $3, 'Active', $4, $5, 'Unit', $6, $7)`,
          [
            PRODUCT_NAMES[i],
            categoryId,
            price,
            sku,
            `Seeded catalog item ${PRODUCT_NAMES[i]}`,
            supplierId,
            3 + (i % 8),
          ]
        );
        added += 1;
      }
      report.inserted.products = added;
    }

    // ------------------------------------------------------------------
    // Users (staff + customer portal accounts)
    // ------------------------------------------------------------------
    const roleMap = Object.fromEntries(
      (await pickIds(client, `SELECT role_id, slug FROM roles`)).map((r) => [r.slug, r.role_id])
    );
    const allowedBranches = await pickIds(
      client,
      `SELECT id, name FROM branches
       WHERE name ILIKE '%Davao City%'
          OR name ILIKE '%General Santos%'
          OR name ILIKE '%Davao Oriental%'
       ORDER BY id`
    );
    if (allowedBranches.length !== 3) {
      throw new Error(
        `Expected 3 allowed branches (Davao City, General Santos, Davao Oriental); found ${allowedBranches.length}`
      );
    }
    const branchIds = allowedBranches.map((b) => b.id);
    const branchNameById = Object.fromEntries(allowedBranches.map((b) => [b.id, b.name]));
    const staffRoles = ['branch_manager', 'inventory_staff', 'sales_staff', 'collector'];

    {
      const deficit = await need(client, 'users');
      let added = 0;
      let i = 0;
      while (added < deficit && i < 200) {
        const first = FIRST[i % FIRST.length];
        const last = LAST[(i * 3) % LAST.length];
        const email = `seed.user.${i + 1}@corvex.ph`;
        const exists = await client.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
        if (exists.rows.length) {
          i += 1;
          continue;
        }
        // Mix: mostly staff, some customer portal users
        const isCustomer = i % 5 === 0;
        const roleSlug = isCustomer ? 'customer' : staffRoles[i % staffRoles.length];
        const roleId = roleMap[roleSlug];
        const branchId = isCustomer ? branchIds[i % branchIds.length] : branchIds[i % branchIds.length];
        const username = `seed_user_${i + 1}`;
        const fullName = `${first} ${last}`;
        await client.query(
          `INSERT INTO users (
             branch_id, first_name, last_name, role_id, email, password_hash, status,
             full_name, username, phone, avatar_initials
           ) VALUES ($1,$2,$3,$4,$5,$6,'Active',$7,$8,$9,$10)`,
          [
            branchId,
            first,
            last,
            roleId,
            email,
            SEED_PASSWORD_HASH,
            fullName,
            username,
            `09${String(100000000 + i).slice(-9)}`,
            `${first[0]}${last[0]}`.toUpperCase(),
          ]
        );
        added += 1;
        i += 1;
      }
      report.inserted.users = added;
    }

    // Assign managers to new branches lacking managers
    {
      const open = await client.query(`
        SELECT b.id
        FROM branches b
        WHERE b.manager_id IS NULL
        ORDER BY b.id
      `);
      const managers = await client.query(`
        SELECT u.id, u.branch_id
        FROM users u
        JOIN roles r ON r.role_id = u.role_id
        WHERE r.slug = 'branch_manager' AND u.status = 'Active'
        ORDER BY u.id
      `);
      let mi = 0;
      for (const b of open.rows) {
        // Prefer manager already on branch, else any BM
        const onBranch = managers.rows.find((m) => m.branch_id === b.id);
        const mgr = onBranch || managers.rows[mi % Math.max(managers.rows.length, 1)];
        if (!mgr) break;
        await client.query(`UPDATE branches SET manager_id = $1 WHERE id = $2`, [mgr.id, b.id]);
        if (!onBranch) mi += 1;
      }
    }

    // ------------------------------------------------------------------
    // Territories
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'territories');
      const salesUsers = await pickIds(
        client,
        `SELECT u.id, u.branch_id FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE r.slug IN ('sales_staff','collector') AND u.status = 'Active'
         ORDER BY u.id`
      );
      let added = 0;
      let i = 0;
      while (added < deficit && i < 300) {
        const branchId = branchIds[i % branchIds.length];
        const meta = metaForBranchName(branchNameById[branchId]);
        const area = meta.areas[i % meta.areas.length];
        const name = `${meta.city} Zone ${String(i + 1).padStart(3, '0')}`;
        const exists = await client.query(
          `SELECT 1 FROM territories WHERE territory_name = $1`,
          [name]
        );
        if (exists.rows.length) {
          i += 1;
          continue;
        }
        const assignee = salesUsers[i % Math.max(salesUsers.length, 1)] || null;
        await client.query(
          `INSERT INTO territories (territory_name, branch_id, assigned_user, coverage_area, status)
           VALUES ($1, $2, $3, $4, 'Active')`,
          [
            name,
            branchId,
            assignee?.id || null,
            `${area} and nearby barangays, ${meta.city}`,
          ]
        );
        added += 1;
        i += 1;
      }
      report.inserted.territories = added;
    }

    // ------------------------------------------------------------------
    // Territory assignments
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'territory_assignments');
      const territories = await pickIds(
        client,
        `SELECT territory_id, branch_id FROM territories ORDER BY territory_id`
      );
      const staff = await pickIds(
        client,
        `SELECT u.id, u.branch_id, u.role_id FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE r.slug IN ('sales_staff','collector','branch_manager') AND u.status = 'Active'
         ORDER BY u.id`
      );
      let added = 0;
      let ti = 0;
      let si = 0;
      let guard = 0;
      while (added < deficit && guard < 5000) {
        guard += 1;
        const t = territories[ti % territories.length];
        const u = staff[si % staff.length];
        ti += 1;
        si += 1;
        const exists = await client.query(
          `SELECT 1 FROM territory_assignments WHERE territory_id = $1 AND user_id = $2`,
          [t.territory_id, u.id]
        );
        if (exists.rows.length) continue;
        await client.query(
          `INSERT INTO territory_assignments (territory_id, user_id, role_id)
           VALUES ($1, $2, $3)`,
          [t.territory_id, u.id, u.role_id]
        );
        added += 1;
      }
      report.inserted.territory_assignments = added;
    }

    // ------------------------------------------------------------------
    // Customers (+ activity / credit)
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'customers');
      const territories = await pickIds(
        client,
        `SELECT territory_id, branch_id FROM territories
         WHERE branch_id = ANY($1::int[])
         ORDER BY territory_id`,
        [branchIds]
      );
      const managers = await pickIds(
        client,
        `SELECT u.id, u.branch_id FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE r.slug = 'branch_manager' AND u.status = 'Active'`
      );
      const agents = await pickIds(
        client,
        `SELECT u.id, u.branch_id FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE r.slug = 'sales_staff' AND u.status = 'Active'`
      );
      let added = 0;
      let i = 0;
      while (added < deficit && i < 300) {
        const first = FIRST[(i + 7) % FIRST.length];
        const last = LAST[(i + 11) % LAST.length];
        const code = `C-SEED-${String(i + 1).padStart(4, '0')}`;
        const exists = await client.query(`SELECT 1 FROM customers WHERE customer_code = $1`, [code]);
        if (exists.rows.length) {
          i += 1;
          continue;
        }
        const terr = territories.filter((t) => branchIds.includes(t.branch_id))[i % Math.max(territories.filter((t) => branchIds.includes(t.branch_id)).length, 1)]
          || territories[i % territories.length];
        const branchId = branchIds.includes(terr.branch_id) ? terr.branch_id : branchIds[i % branchIds.length];
        const meta = metaForBranchName(branchNameById[branchId]);
        const mgr = managers.find((m) => m.branch_id === branchId) || managers[0];
        const agent = agents.find((a) => a.branch_id === branchId) || agents[0];
        const street = meta.streets[i % meta.streets.length];
        const lat = Number((meta.lat + ((i % 20) - 10) * 0.002).toFixed(7));
        const lon = Number((meta.lon + ((i % 16) - 8) * 0.002).toFixed(7));
        const phone = `09${String(200000000 + i).slice(-9)}`;
        const ins = await client.query(
          `INSERT INTO customers (
             branch_id, account_manager_id, territory_id, assigned_sales_agent_id,
             first_name, last_name, address, latitude, longitude,
             contact_phone, contact_person_fname, contact_person_lname, contact_person_phone,
             status, customer_code, portal_status, portal_email
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Active',$14,'none',$15)
           RETURNING customer_id`,
          [
            branchId,
            mgr?.id || null,
            terr.territory_id,
            agent?.id || null,
            first,
            last,
            `${10 + (i % 90)} ${street}, ${meta.city}`,
            lat,
            lon,
            `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`,
            first,
            last,
            `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`,
            code,
            `cust.seed.${i + 1}@corvex-demo.ph`,
          ]
        );
        const customerId = ins.rows[0].customer_id;
        await client.query(
          `INSERT INTO customer_activity (
             customer_id, outstanding_balance, purchase_volume, last_collection_date, last_sales_visit
           ) VALUES ($1,$2,$3,$4,$5)`,
          [
            customerId,
            5000 + (i % 20) * 1200,
            20000 + (i % 25) * 3500,
            daysAgo(3 + (i % 40)),
            daysAgo(1 + (i % 20)),
          ]
        );
        await client.query(
          `INSERT INTO customer_credit_info (
             customer_id, credit_limit, monthly_income, employment_status, credit_score,
             approved_by, approved_date
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            customerId,
            30000 + (i % 15) * 5000,
            25000 + (i % 10) * 3000,
            i % 2 === 0 ? 'Self-Employed' : 'Employed',
            620 + (i % 180),
            mgr?.id || null,
            daysAgo(60 + (i % 90)),
          ]
        );
        added += 1;
        i += 1;
      }
      report.inserted.customers = added;
    }

    // Backfill activity/credit for any customers still missing them
    {
      let actAdded = 0;
      const missingAct = await client.query(`
        SELECT c.customer_id FROM customers c
        WHERE NOT EXISTS (SELECT 1 FROM customer_activity a WHERE a.customer_id = c.customer_id)
        ORDER BY c.customer_id
      `);
      for (const row of missingAct.rows) {
        await client.query(
          `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume, last_collection_date, last_sales_visit)
           VALUES ($1, 8000, 25000, $2, $3)`,
          [row.customer_id, daysAgo(10), daysAgo(5)]
        );
        actAdded += 1;
      }
      // Top up activity only via new customers above; count inserts from that path too
      report.inserted.customer_activity =
        (report.inserted.customers || 0) + actAdded;

      let creditAdded = 0;
      const missingCredit = await client.query(`
        SELECT c.customer_id, c.account_manager_id FROM customers c
        WHERE NOT EXISTS (SELECT 1 FROM customer_credit_info x WHERE x.customer_id = c.customer_id)
        ORDER BY c.customer_id
      `);
      // Also ensure we reach TARGET even if more customers exist than credit rows
      const creditDeficit = await need(client, 'customer_credit_info');
      for (const row of missingCredit.rows) {
        if (creditAdded >= creditDeficit && creditDeficit > 0) {
          // still fill all missing 1:1 for integrity
        }
        await client.query(
          `INSERT INTO customer_credit_info (
             customer_id, credit_limit, monthly_income, employment_status, credit_score,
             approved_by, approved_date
           ) VALUES ($1, 40000, 30000, 'Employed', 700, $2, $3)`,
          [row.customer_id, row.account_manager_id, daysAgo(45)]
        );
        creditAdded += 1;
      }
      report.inserted.customer_credit_info = creditAdded;
    }

    // ------------------------------------------------------------------
    // Branch inventory + central inventory
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'branch_inventory');
      const products = await pickIds(client, `SELECT id, reorder_point FROM products ORDER BY id`);
      let added = 0;
      let guard = 0;
      let bi = 0;
      let pi = 0;
      while (added < deficit && guard < 10000) {
        guard += 1;
        const branchId = branchIds[bi % branchIds.length];
        const product = products[pi % products.length];
        bi += 1;
        if (bi % branchIds.length === 0) pi += 1;
        const exists = await client.query(
          `SELECT 1 FROM branch_inventory WHERE branch_id = $1 AND product_id = $2`,
          [branchId, product.id]
        );
        if (exists.rows.length) continue;
        const stock = 4 + (added % 30);
        const reorder = product.reorder_point || 5;
        const status = deriveStockStatus(stock, reorder);
        await client.query(
          `INSERT INTO branch_inventory (
             branch_id, product_id, available_stock, quantity, reorder_level, status, stock_status, last_updated
           ) VALUES ($1,$2,$3,$3,$4,$5,$5,CURRENT_TIMESTAMP)`,
          [branchId, product.id, stock, reorder, status]
        );
        await alignCentralInventory(client, product.id);
        added += 1;
      }
      report.inserted.branch_inventory = added;

      // Ensure central_inventory has a row for every product
      let centralAdded = 0;
      const missingCentral = await client.query(`
        SELECT p.id FROM products p
        WHERE NOT EXISTS (SELECT 1 FROM central_inventory c WHERE c.product_id = p.id)
        ORDER BY p.id
      `);
      for (const row of missingCentral.rows) {
        await alignCentralInventory(client, row.id);
        centralAdded += 1;
      }
      report.inserted.central_inventory = centralAdded;
    }

    // Shared refs for transactional children
    const customers = await pickIds(
      client,
      `SELECT customer_id, branch_id FROM customers ORDER BY customer_id`
    );
    const products = await pickIds(client, `SELECT id, unit_price FROM products ORDER BY id`);
    const paymentMethods = await pickIds(
      client,
      `SELECT payment_method_id FROM payment_methods WHERE status = 'Active' ORDER BY payment_method_id`
    );
    const collectors = await pickIds(
      client,
      `SELECT u.id, u.branch_id FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE r.slug='collector' AND u.status='Active' ORDER BY u.id`
    );
    const salesAgents = await pickIds(
      client,
      `SELECT u.id, u.branch_id FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE r.slug='sales_staff' AND u.status='Active' ORDER BY u.id`
    );
    const inventoryStaff = await pickIds(
      client,
      `SELECT u.id, u.branch_id FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE r.slug IN ('inventory_staff','branch_manager') AND u.status='Active' ORDER BY u.id`
    );
    const allUsers = await pickIds(client, `SELECT id FROM users WHERE status='Active' ORDER BY id`);
    const suppliers = await pickIds(client, `SELECT suppliers_id FROM suppliers ORDER BY suppliers_id`);
    const fieldVisits = await pickIds(
      client,
      `SELECT visit_id, user_id, customer_id FROM field_visits ORDER BY visit_id`
    );

    // ------------------------------------------------------------------
    // Restocks
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'restocks');
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const product = products[i % products.length];
        const branchId = branchIds[i % branchIds.length];
        const supplier = suppliers[i % suppliers.length];
        await client.query(
          `INSERT INTO restocks (product_id, branch_id, delivery_ref, supplier_id, quantity, received_date)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            product.id,
            branchId,
            `DEL-SEED-${Date.now().toString(36)}-${i}`,
            supplier.suppliers_id,
            5 + (i % 20),
            daysAgo(i % 60),
          ]
        );
        added += 1;
      }
      report.inserted.restocks = added;
    }

    // ------------------------------------------------------------------
    // Stock movements
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'stock_movements');
      const types = [
        'Restock',
        'Sale Deduction',
        'Transfer In',
        'Transfer Out',
        'Stock Count Adjustment',
        'Damage Write-Off',
      ];
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const type = types[i % types.length];
        const qty = type === 'Sale Deduction' || type === 'Transfer Out' || type === 'Damage Write-Off'
          ? -(1 + (i % 5))
          : 1 + (i % 12);
        const ref = `MOV-SEED-${Date.now().toString(36)}-${i}`;
        const performer = inventoryStaff[i % inventoryStaff.length] || allUsers[0];
        await client.query(
          `INSERT INTO stock_movements (performed_by, product_id, branch_id, quantity, type, movement_ref, movement_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            performer.id,
            products[i % products.length].id,
            branchIds[i % branchIds.length],
            qty,
            type,
            ref,
            daysAgo(i % 90),
          ]
        );
        added += 1;
      }
      report.inserted.stock_movements = added;
    }

    // ------------------------------------------------------------------
    // Inventory transfers
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'inventory_transfers');
      const statuses = ['Pending Approval', 'Submitted', 'Approved', 'Completed', 'Rejected'];
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const source = branchIds[i % branchIds.length];
        let dest = branchIds[(i + 1) % branchIds.length];
        if (dest === source) dest = branchIds[(i + 2) % branchIds.length];
        const submitter = inventoryStaff[i % inventoryStaff.length] || allUsers[0];
        const status = statuses[i % statuses.length];
        const approvedBy =
          status === 'Approved' || status === 'Completed' || status === 'Rejected'
            ? (await pickIds(
                client,
                `SELECT u.id FROM users u JOIN roles r ON r.role_id=u.role_id
                 WHERE r.slug IN ('branch_manager','operating_manager') LIMIT 1`
              ))[0]?.id
            : null;
        await client.query(
          `INSERT INTO inventory_transfers (
             transfer_ref, product_id, quantity, source_branch_id, destination_branch_id,
             status, submitted_by, approved_by, approval_info, submitted_date, completed_date
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            `TRF-SEED-${Date.now().toString(36)}-${i}`,
            products[i % products.length].id,
            1 + (i % 8),
            source,
            dest,
            status,
            submitter.id,
            approvedBy,
            status === 'Rejected' ? 'Insufficient source allocation' : 'Seeded transfer',
            daysAgo(i % 45),
            status === 'Completed' ? daysAgo(i % 20) : null,
          ]
        );
        added += 1;
      }
      report.inserted.inventory_transfers = added;
    }

    // ------------------------------------------------------------------
    // Field activity reports (need visits — already >= 50)
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'field_activity_reports');
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const visit = fieldVisits[i % fieldVisits.length];
        const sync = ['Pending', 'Synced', 'Failed'][i % 3];
        await client.query(
          `INSERT INTO field_activity_reports (visit_id, user_id, activity_type, remarks, sync_status)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            visit.visit_id,
            visit.user_id,
            i % 2 === 0 ? 'Collection' : 'Sales Visit',
            `Seeded field report #${i + 1}`,
            sync,
          ]
        );
        added += 1;
      }
      report.inserted.field_activity_reports = added;
    }

    // ------------------------------------------------------------------
    // Offline sync queue
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'offline_sync_queue');
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const user = allUsers[i % allUsers.length];
        const status = ['Pending', 'Synced', 'Failed'][i % 3];
        const payload = JSON.stringify({
          type: i % 2 === 0 ? 'collection_payment' : 'field_visits',
          amount: 1000 + i * 50,
          note: `offline seed ${i + 1}`,
        });
        await client.query(
          `INSERT INTO offline_sync_queue (
             user_id, device_id, table_name, record_reference, payload, sync_status, attempted_at, synced_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            user.id,
            `device-seed-${(i % 8) + 1}`,
            i % 2 === 0 ? 'collection_payment' : 'field_visits',
            `OFF-SEED-${i + 1}`,
            payload,
            status,
            status === 'Pending' ? null : new Date(),
            status === 'Synced' ? new Date() : null,
          ]
        );
        added += 1;
      }
      report.inserted.offline_sync_queue = added;
    }

    // ------------------------------------------------------------------
    // SAW results
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'saw_results');
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const customer = customers[i % customers.length];
        const score = Number((0.35 + ((i * 17) % 60) / 100).toFixed(4)); // 0.35–0.94
        await client.query(
          `INSERT INTO saw_results (customer_id, score, ranking, generated_at)
           VALUES ($1,$2,$3,CURRENT_TIMESTAMP - ($4 || ' days')::interval)`,
          [customer.customer_id, score, 1 + (i % 20), String(i % 30)]
        );
        added += 1;
      }
      report.inserted.saw_results = added;
    }

    // ------------------------------------------------------------------
    // Purchase requests + items
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'purchase_requests');
      const statuses = ['Pending', 'In Review', 'Confirmed', 'Rejected', 'Cancelled', 'Invoiced'];
      let added = 0;
      const createdRequestIds = [];
      for (let i = 0; i < deficit; i += 1) {
        const customer = customers[i % customers.length];
        const agent =
          salesAgents.find((a) => a.branch_id === customer.branch_id) || salesAgents[0] || allUsers[0];
        const status = statuses[i % statuses.length];
        const inv =
          status === 'Invoiced'
            ? (
                await client.query(
                  `SELECT sales_invoices_id FROM sales_invoices WHERE customer_id = $1 LIMIT 1`,
                  [customer.customer_id]
                )
              ).rows[0]?.sales_invoices_id || null
            : null;
        const ins = await client.query(
          `INSERT INTO purchase_requests (
             customer_id, branch_id, sales_agent_id, status, notes, sales_invoices_id
           ) VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING request_id`,
          [
            customer.customer_id,
            customer.branch_id,
            agent.id,
            status,
            `Seeded purchase request ${i + 1}`,
            inv,
          ]
        );
        createdRequestIds.push(ins.rows[0].request_id);
        added += 1;
      }
      report.inserted.purchase_requests = added;

      const itemDeficit = await need(client, 'purchase_request_items');
      const allRequests = await pickIds(
        client,
        `SELECT request_id FROM purchase_requests ORDER BY request_id`
      );
      let itemsAdded = 0;
      for (let i = 0; i < itemDeficit; i += 1) {
        const req = allRequests[i % allRequests.length];
        const product = products[i % products.length];
        await client.query(
          `INSERT INTO purchase_request_items (request_id, product_id, quantity, notes)
           VALUES ($1,$2,$3,$4)`,
          [req.request_id, product.id, 1 + (i % 5), `Line item seed ${i + 1}`]
        );
        itemsAdded += 1;
      }
      report.inserted.purchase_request_items = itemsAdded;
    }

    // ------------------------------------------------------------------
    // Credit investigations / special collections / operational alerts
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'credit_investigations');
      const statuses = ['Pending', 'Approved', 'Rejected', 'Revision Requested'];
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const customer = customers[i % customers.length];
        const submitter =
          salesAgents.find((a) => a.branch_id === customer.branch_id) || salesAgents[0] || allUsers[0];
        const status = statuses[i % statuses.length];
        const approver =
          status === 'Pending'
            ? null
            : (
                await client.query(
                  `SELECT u.id FROM users u JOIN roles r ON r.role_id=u.role_id
                   WHERE r.slug IN ('branch_manager','operating_manager') LIMIT 1`
                )
              ).rows[0]?.id;
        await client.query(
          `INSERT INTO credit_investigations (
             customer_id, branch_id, submitted_by, approved_by, status, purpose,
             monthly_income, business_type, references_summary, form_remarks,
             delinquency_status, risk_score, leaflet_classification,
             payment_history_json, delinquency_flags_json, rejection_reason
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16)`,
          [
            customer.customer_id,
            customer.branch_id,
            submitter.id,
            approver,
            status,
            i % 2 === 0 ? 'Credit limit increase' : 'New account credit line',
            20000 + (i % 15) * 2000,
            'Retail furniture',
            'Verified trade references',
            `Seeded CI case ${i + 1}`,
            i % 4 === 0 ? 'Review' : 'Clear',
            25 + (i % 60),
            ['Low', 'Moderate', 'High'][i % 3],
            JSON.stringify([{ date: daysAgo(10), amount: 3000, status: 'Confirmed' }]),
            i % 5 === 0 ? JSON.stringify(['High outstanding balance']) : '[]',
            status === 'Rejected' ? 'Incomplete documentation' : null,
          ]
        );
        added += 1;
      }
      report.inserted.credit_investigations = added;
    }

    {
      const deficit = await need(client, 'special_collection_requests');
      const types = ['Extended Payment Term', 'Partial Collection', 'Promise to Pay', 'Reschedule Visit'];
      const statuses = ['Pending', 'Approved', 'Rejected'];
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const customer = customers[i % customers.length];
        const requester = collectors.find((c) => c.branch_id === customer.branch_id) || collectors[0] || allUsers[0];
        const status = statuses[i % statuses.length];
        const approver =
          status === 'Pending'
            ? null
            : (
                await client.query(
                  `SELECT u.id FROM users u JOIN roles r ON r.role_id=u.role_id
                   WHERE r.slug IN ('branch_manager','operating_manager') LIMIT 1`
                )
              ).rows[0]?.id;
        await client.query(
          `INSERT INTO special_collection_requests (
             customer_id, branch_id, request_type, amount, notes, requested_by, approved_by, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            customer.customer_id,
            customer.branch_id,
            types[i % types.length],
            5000 + (i % 20) * 500,
            `Seeded special collection request ${i + 1}`,
            requester.id,
            approver,
            status,
          ]
        );
        added += 1;
      }
      report.inserted.special_collection_requests = added;
    }

    {
      const deficit = await need(client, 'operational_alerts');
      const severities = ['Critical', 'Warning', 'Informational'];
      const statuses = ['Open', 'Resolved'];
      const types = ['Inventory', 'Collections', 'Credit', 'Field Ops', 'System'];
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const status = statuses[i % statuses.length];
        const assignee = allUsers[i % allUsers.length];
        await client.query(
          `INSERT INTO operational_alerts (
             branch_id, alert_type, severity, title, message, status, assigned_to, resolved_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            branchIds[i % branchIds.length],
            types[i % types.length],
            severities[i % severities.length],
            `Seed alert ${i + 1}`,
            `Operational notice generated for seed dataset item ${i + 1}.`,
            status,
            assignee.id,
            status === 'Resolved' ? new Date() : null,
          ]
        );
        added += 1;
      }
      report.inserted.operational_alerts = added;
    }

    // ------------------------------------------------------------------
    // Customer portal users / links / invitations
    // ------------------------------------------------------------------
    {
      // Ensure enough customer-role users exist, then link + invite
      const linkDeficit = await need(client, 'customer_user_links');
      const inviteDeficit = await need(client, 'customer_portal_invitations');
      const needUsers = Math.max(linkDeficit, inviteDeficit);

      // Unlinked customers
      const unlinkedCustomers = await pickIds(
        client,
        `SELECT c.customer_id, c.branch_id, c.first_name, c.last_name, c.portal_email
         FROM customers c
         WHERE NOT EXISTS (SELECT 1 FROM customer_user_links l WHERE l.customer_id = c.customer_id)
         ORDER BY c.customer_id`
      );

      // Available customer users without links
      let freeCustomerUsers = await pickIds(
        client,
        `SELECT u.id FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE r.slug = 'customer'
           AND NOT EXISTS (SELECT 1 FROM customer_user_links l WHERE l.user_id = u.id)
         ORDER BY u.id`
      );

      // Create more customer users if needed
      let createdUsers = 0;
      while (freeCustomerUsers.length < needUsers) {
        const idx = freeCustomerUsers.length + createdUsers + 1;
        const email = `portal.seed.${idx}@corvex.ph`;
        const exists = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
        let userId;
        if (exists.rows[0]) {
          userId = exists.rows[0].id;
        } else {
          const first = FIRST[idx % FIRST.length];
          const last = LAST[idx % LAST.length];
          const ins = await client.query(
            `INSERT INTO users (
               branch_id, first_name, last_name, role_id, email, password_hash, status,
               full_name, username
             ) VALUES ($1,$2,$3,$4,$5,$6,'Active',$7,$8)
             RETURNING id`,
            [
              branchIds[idx % branchIds.length],
              first,
              last,
              roleMap.customer,
              email,
              SEED_PASSWORD_HASH,
              `${first} ${last}`,
              `portal_seed_${idx}`,
            ]
          );
          userId = ins.rows[0].id;
          createdUsers += 1;
        }
        freeCustomerUsers.push({ id: userId });
      }
      report.inserted.users = (report.inserted.users || 0) + createdUsers;

      let linksAdded = 0;
      for (let i = 0; i < linkDeficit; i += 1) {
        const customer = unlinkedCustomers[i] || customers[i % customers.length];
        const user = freeCustomerUsers[i];
        if (!user) break;
        // Skip if this customer already linked (when reusing)
        const existingCust = await client.query(
          `SELECT 1 FROM customer_user_links WHERE customer_id = $1`,
          [customer.customer_id]
        );
        if (existingCust.rows.length) {
          // still try linking a free user to another customer later — advance
          continue;
        }
        const existingUser = await client.query(
          `SELECT 1 FROM customer_user_links WHERE user_id = $1`,
          [user.id]
        );
        if (existingUser.rows.length) continue;
        await client.query(
          `INSERT INTO customer_user_links (user_id, customer_id) VALUES ($1,$2)`,
          [user.id, customer.customer_id]
        );
        await client.query(
          `UPDATE customers
           SET user_id = COALESCE(user_id, $1),
               portal_status = CASE WHEN portal_status = 'none' THEN 'invited' ELSE portal_status END,
               portal_email = COALESCE(portal_email, $2)
           WHERE customer_id = $3`,
          [user.id, `portal.seed.${customer.customer_id}@corvex.ph`, customer.customer_id]
        );
        linksAdded += 1;
      }
      // If some continues skipped, fill remaining with any unlinked pairs
      if (linksAdded < linkDeficit) {
        const stillUnlinked = await pickIds(
          client,
          `SELECT c.customer_id FROM customers c
           WHERE NOT EXISTS (SELECT 1 FROM customer_user_links l WHERE l.customer_id = c.customer_id)
           ORDER BY c.customer_id`
        );
        freeCustomerUsers = await pickIds(
          client,
          `SELECT u.id FROM users u
           JOIN roles r ON r.role_id = u.role_id
           WHERE r.slug = 'customer'
             AND NOT EXISTS (SELECT 1 FROM customer_user_links l WHERE l.user_id = u.id)
           ORDER BY u.id`
        );
        for (let i = 0; linksAdded < linkDeficit && i < Math.min(stillUnlinked.length, freeCustomerUsers.length); i += 1) {
          await client.query(
            `INSERT INTO customer_user_links (user_id, customer_id) VALUES ($1,$2)`,
            [freeCustomerUsers[i].id, stillUnlinked[i].customer_id]
          );
          linksAdded += 1;
        }
      }
      report.inserted.customer_user_links = linksAdded;

      // Invitations for linked pairs missing invites
      let invitesAdded = 0;
      const pairs = await pickIds(
        client,
        `SELECT l.user_id, l.customer_id
         FROM customer_user_links l
         WHERE NOT EXISTS (
           SELECT 1 FROM customer_portal_invitations i WHERE i.customer_id = l.customer_id
         )
         ORDER BY l.link_id`
      );
      const inviteNeed = await need(client, 'customer_portal_invitations');
      for (let i = 0; i < pairs.length && invitesAdded < inviteNeed; i += 1) {
        const tokenHash = crypto.createHash('sha256').update(`seed-invite-${pairs[i].customer_id}-${i}`).digest('hex');
        const expires = new Date();
        expires.setDate(expires.getDate() + 14);
        await client.query(
          `INSERT INTO customer_portal_invitations (customer_id, user_id, token_hash, expires_at, activated_at)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            pairs[i].customer_id,
            pairs[i].user_id,
            tokenHash,
            expires,
            i % 3 === 0 ? new Date() : null,
          ]
        );
        invitesAdded += 1;
      }
      // If still short, create additional invites for already-invited customers with unique hashes
      // (multiple invites per customer allowed — no unique on customer_id)
      if (invitesAdded < inviteNeed) {
        const anyPairs = await pickIds(
          client,
          `SELECT user_id, customer_id FROM customer_user_links ORDER BY link_id`
        );
        let j = 0;
        while (invitesAdded < inviteNeed && anyPairs.length) {
          const pair = anyPairs[j % anyPairs.length];
          const tokenHash = crypto
            .createHash('sha256')
            .update(`seed-invite-extra-${pair.customer_id}-${invitesAdded}-${Date.now()}`)
            .digest('hex');
          const expires = new Date();
          expires.setDate(expires.getDate() + 7);
          await client.query(
            `INSERT INTO customer_portal_invitations (customer_id, user_id, token_hash, expires_at)
             VALUES ($1,$2,$3,$4)`,
            [pair.customer_id, pair.user_id, tokenHash, expires]
          );
          invitesAdded += 1;
          j += 1;
        }
      }
      report.inserted.customer_portal_invitations = invitesAdded;
    }

    // ------------------------------------------------------------------
    // Notification dedup + system backups
    // ------------------------------------------------------------------
    {
      const deficit = await need(client, 'notification_dedup');
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        const key = `seed:dedup:${i + 1}:${daysAgo(i % 20)}`;
        await client.query(
          `INSERT INTO notification_dedup (dedup_key) VALUES ($1) ON CONFLICT DO NOTHING`,
          [key]
        );
        // ON CONFLICT may no-op; check
        const exists = await client.query(
          `SELECT 1 FROM notification_dedup WHERE dedup_key = $1`,
          [key]
        );
        if (exists.rows.length) added += 1;
      }
      // recount actual insert delta
      report.inserted.notification_dedup = Math.max(0, (await count(client, 'notification_dedup')) - report.before.notification_dedup);
    }

    {
      const deficit = await need(client, 'system_backups');
      const types = ['full', 'schema', 'data'];
      const statuses = ['completed', 'failed', 'running'];
      const creator = (
        await client.query(
          `SELECT u.id FROM users u JOIN roles r ON r.role_id=u.role_id WHERE r.slug='super_admin' LIMIT 1`
        )
      ).rows[0]?.id || allUsers[0]?.id;
      let added = 0;
      for (let i = 0; i < deficit; i += 1) {
        await client.query(
          `INSERT INTO system_backups (backup_type, status, size_bytes, created_by, file_name, created_at)
           VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP - ($6 || ' hours')::interval)`,
          [
            types[i % types.length],
            statuses[i % statuses.length],
            1_000_000 + i * 25_000,
            creator,
            `corvex-backup-seed-${String(i + 1).padStart(3, '0')}.sql`,
            String(i * 3),
          ]
        );
        added += 1;
      }
      report.inserted.system_backups = added;
    }

    // Document hard skips
    report.skipped.roles =
      'RBAC is fixed to 7 business roles (super_admin … customer). Fabricating dozens of roles would break authorization.';
    report.skipped.schema_migrations =
      'Meta table tracking applied migration files; inventing fake migration rows would desync migrate tooling.';

    await client.query('COMMIT');
    console.log('COMMIT OK');

    for (const t of tables) {
      report.after[t] = await count(client, t);
      if (report.inserted[t] == null) report.inserted[t] = 0;
    }

    // Final verification print
    console.log('\n=== FINAL REPORT ===');
    const reached = [];
    const notReached = [];
    for (const t of tables) {
      const before = report.before[t] ?? 0;
      const after = report.after[t] ?? 0;
      const inserted = after - before;
      report.inserted[t] = inserted;
      const line = `${t}: before=${before} inserted=${inserted} after=${after}`;
      console.log(line);
      if (after >= TARGET) reached.push(t);
      else notReached.push({ table: t, after, reason: report.skipped[t] || 'Unknown' });
    }

    console.log('\nReached >= 50:', reached.join(', '));
    console.log('\nDid not reach 50:');
    for (const x of notReached) {
      console.log(` - ${x.table}: ${x.after} — ${x.reason}`);
    }

    // Quick FK sanity samples
    const checks = [
      ['customers→branches', `SELECT COUNT(*)::int n FROM customers c JOIN branches b ON b.id=c.branch_id`],
      ['branch_inventory→products', `SELECT COUNT(*)::int n FROM branch_inventory bi JOIN products p ON p.id=bi.product_id`],
      ['purchase_request_items→requests', `SELECT COUNT(*)::int n FROM purchase_request_items i JOIN purchase_requests r ON r.request_id=i.request_id`],
      ['customer_user_links', `SELECT COUNT(*)::int n FROM customer_user_links l JOIN users u ON u.id=l.user_id JOIN customers c ON c.customer_id=l.customer_id`],
    ];
    console.log('\nIntegrity checks:');
    for (const [name, sql] of checks) {
      const r = await client.query(sql);
      console.log(` OK ${name}: ${r.rows[0].n}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK — populate failed:', err.message);
    console.error(err.stack);
    report.errors.push(err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
