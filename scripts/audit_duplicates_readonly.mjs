/**
 * Read-only local PostgreSQL duplicate / orphan audit.
 * Does not modify data. Writes a markdown report under docs/.
 *
 * Usage: node scripts/audit_duplicates_readonly.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });

const { Pool } = pg;

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(dela|de la|del|de los|de las|da|do|van|von)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function masterReason(rows) {
  const sorted = [...rows].sort((a, b) => {
    const aActive = String(a.status).toLowerCase() === 'active' ? 1 : 0;
    const bActive = String(b.status).toLowerCase() === 'active' ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;
    const aBal = Number(a.outstanding_balance || 0);
    const bBal = Number(b.outstanding_balance || 0);
    if (bBal !== aBal) return bBal - aBal;
    return Number(a.customer_id) - Number(b.customer_id);
  });
  return sorted[0];
}

async function main() {
  if (!process.env.DB_PASSWORD) {
    console.error('DB_PASSWORD is not set. Aborting read-only audit.');
    process.exit(1);
  }

  const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'corvex',
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
  });

  const client = await pool.connect();
  const lines = [];
  const push = (s = '') => lines.push(s);

  try {
    push('# CORVEX read-only duplicate / orphan audit');
    push('');
    push(`**Generated:** ${new Date().toISOString()}`);
    push('**Mode:** read-only (no merges performed)');
    push('**Matching criteria:** exact phone digits; exact lowercased portal_email; exact id_number; fuzzy normalized full name (token overlap ≥ max(2, min token count)).');
    push('**Master rule (suggestion only):** Active status preferred, then highest outstanding_balance, then lowest customer_id.');
    push('');

    const customers = await client.query(`
      SELECT c.customer_id, c.customer_code, c.first_name, c.middle_name, c.last_name,
             c.business_name, c.contact_phone, c.portal_email, c.id_number, c.status,
             c.branch_id, b.name AS branch_name,
             COALESCE(ca.outstanding_balance, 0) AS outstanding_balance
      FROM customers c
      LEFT JOIN branches b ON b.id = c.branch_id
      LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
      ORDER BY c.customer_id
    `);

    push(`## Summary`);
    push(`- Customers scanned: **${customers.rows.length}**`);
    push('');

    const phoneGroups = new Map();
    const emailGroups = new Map();
    const idGroups = new Map();
    const nameGroups = new Map();

    for (const row of customers.rows) {
      const phone = digitsOnly(row.contact_phone);
      if (phone.length >= 10) {
        if (!phoneGroups.has(phone)) phoneGroups.set(phone, []);
        phoneGroups.get(phone).push(row);
      }
      const email = String(row.portal_email || '').trim().toLowerCase();
      if (email) {
        if (!emailGroups.has(email)) emailGroups.set(email, []);
        emailGroups.get(email).push(row);
      }
      const idNumber = String(row.id_number || '').trim().toLowerCase();
      if (idNumber) {
        if (!idGroups.has(idNumber)) idGroups.set(idNumber, []);
        idGroups.get(idNumber).push(row);
      }
      const fullName = normalizeName([row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ') || row.business_name);
      if (fullName) {
        if (!nameGroups.has(fullName)) nameGroups.set(fullName, []);
        nameGroups.get(fullName).push(row);
      }
    }

    function reportGroups(title, groups, exact) {
      const dups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
      push(`## ${title}`);
      push(`- Duplicate groups: **${dups.length}** (${exact ? 'exact' : 'normalized'})`);
      push('');
      if (!dups.length) {
        push('_None found._');
        push('');
        return dups.length;
      }
      push('| Group key | Count | Suggested master | Other IDs | Why master |');
      push('|---|---:|---|---|---|');
      for (const [key, rows] of dups.slice(0, 50)) {
        const master = masterReason(rows);
        const others = rows.filter((r) => r.customer_id !== master.customer_id).map((r) => r.customer_id).join(', ');
        const why = `status=${master.status}; balance=${master.outstanding_balance}; lowest-id tie-break`;
        const displayKey = String(key).length > 40 ? `${String(key).slice(0, 37)}...` : key;
        push(`| \`${displayKey}\` | ${rows.length} | ${master.customer_id} (${master.customer_code || 'n/a'}) | ${others} | ${why} |`);
      }
      if (dups.length > 50) push(`_… ${dups.length - 50} more groups omitted_`);
      push('');
      return dups.length;
    }

    const phoneDupCount = reportGroups('Exact phone duplicates', phoneGroups, true);
    const emailDupCount = reportGroups('Exact portal_email duplicates', emailGroups, true);
    const idDupCount = reportGroups('Exact id_number duplicates', idGroups, true);
    const nameDupCount = reportGroups('Normalized name duplicates (fuzzy)', nameGroups, false);

    push('## Orphan / integrity spot-checks');
    push('');

    const orphans = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM customers c WHERE c.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = c.branch_id)) AS customers_missing_branch,
        (SELECT COUNT(*)::int FROM sales_invoices si WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = si.customer_id)) AS invoices_missing_customer,
        (SELECT COUNT(*)::int FROM collection_payment cp WHERE cp.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = cp.customer_id)) AS payments_missing_customer,
        (SELECT COUNT(*)::int FROM customers c WHERE c.territory_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM territories t WHERE t.territory_id = c.territory_id)) AS customers_missing_territory
    `);
    const o = orphans.rows[0];
    push('| Check | Count |');
    push('|---|---:|');
    push(`| Customers with missing branch FK | ${o.customers_missing_branch} |`);
    push(`| Sales invoices with missing customer | ${o.invoices_missing_customer} |`);
    push(`| Collection payments with missing customer | ${o.payments_missing_customer} |`);
    push(`| Customers with missing territory FK | ${o.customers_missing_territory} |`);
    push('');

    push('## Decision required');
    push('');
    push('No merges were performed. Review suggested masters above and approve which groups to merge before any write operations.');
    push('');
    push(`**Totals:** phone=${phoneDupCount}, email=${emailDupCount}, id_number=${idDupCount}, name=${nameDupCount}`);

    const outPath = path.join(root, 'docs', 'AUDIT_DUPLICATES_2026-11-18.md');
    fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
    console.log(`Wrote ${outPath}`);
    console.log(`phone=${phoneDupCount} email=${emailDupCount} id=${idDupCount} name=${nameDupCount}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
