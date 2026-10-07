/**
 * Resend portal activation for a customer (uses DB + SMTP from .env).
 *   node backend/scripts/resend_portal_invite.js <customer_id>
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { resendPortalInvitation, dispatchPortalActivationEmail } from '../lib/customerPortal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const customerId = Number(process.argv[2]);
if (!customerId) {
  console.error('Usage: node backend/scripts/resend_portal_invite.js <customer_id>');
  process.exit(1);
}

const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

const client = await pool.connect();
try {
  const existing = await client.query(
    `SELECT customer_id, branch_id, portal_email, portal_status, contact_person_fname, contact_person_lname
     FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  if (!existing.rows.length) {
    console.error('Customer not found');
    process.exit(1);
  }
  const customer = existing.rows[0];
  await client.query('BEGIN');
  const portalMeta = await resendPortalInvitation(client, {
    customerId,
    portalEmail: customer.portal_email,
  });
  await client.query('COMMIT');
  const emailResult = await dispatchPortalActivationEmail(pool, {
    portalMeta,
    customerFirstName: customer.contact_person_fname,
    salesAgentName: 'Sales Agent',
    branchId: customer.branch_id,
  });
  console.log('Portal email:', portalMeta.portalEmail);
  console.log('Email sent:', Boolean(emailResult?.sent));
  if (emailResult?.error) console.error('Error:', emailResult.error);
  if (!emailResult?.sent && emailResult?.skipped) console.error('Reason:', emailResult.reason);
} finally {
  client.release();
  await pool.end();
}
