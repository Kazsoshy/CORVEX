import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generatePortalToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashPortalToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function buildActivationUrl(token) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/activate-account?token=${encodeURIComponent(token)}`;
}

export async function getCustomerRoleId(client) {
  const result = await client.query(`SELECT role_id FROM roles WHERE slug = 'customer' LIMIT 1`);
  if (!result.rows.length) {
    throw new Error('Customer role is not configured in the database.');
  }
  return result.rows[0].role_id;
}

export async function createPortalInvitation(client, {
  customerId,
  branchId,
  portalEmail,
  contactFirstName,
  contactLastName,
}) {
  const email = String(portalEmail || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid portal email is required.');
  }

  const existingUser = await client.query(`SELECT id, status FROM users WHERE LOWER(email) = $1`, [email]);
  if (existingUser.rows.length) {
    throw new Error('This email is already registered in the system.');
  }

  const roleId = await getCustomerRoleId(client);
  const placeholderPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
  const firstName = (contactFirstName || 'Customer').trim().slice(0, 50);
  const lastName = (contactLastName || 'Account').trim().slice(0, 50);

  const userResult = await client.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role_id, branch_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'Invited')
     RETURNING id`,
    [firstName, lastName, email, placeholderPassword, roleId, branchId]
  );
  const userId = userResult.rows[0].id;

  await client.query(
    `UPDATE customers
     SET user_id = $1, portal_email = $2, portal_status = 'invited'
     WHERE customer_id = $3`,
    [userId, email, customerId]
  );

  const token = generatePortalToken();
  const tokenHash = hashPortalToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await client.query(
    `INSERT INTO customer_portal_invitations (customer_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [customerId, userId, tokenHash, expiresAt]
  );

  return {
    userId,
    portalEmail: email,
    activationToken: token,
    activationUrl: buildActivationUrl(token),
    expiresAt,
  };
}

export async function resendPortalInvitation(client, { customerId, portalEmail }) {
  const email = String(portalEmail || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid portal email is required.');
  }

  const customerResult = await client.query(
    `SELECT customer_id, branch_id, user_id, portal_status, contact_person_fname, contact_person_lname
     FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  if (!customerResult.rows.length) {
    throw new Error('Customer not found.');
  }
  const customer = customerResult.rows[0];

  if (customer.portal_status === 'active') {
    throw new Error('Portal account is already active for this customer.');
  }

  if (!customer.user_id) {
    return createPortalInvitation(client, {
      customerId,
      branchId: customer.branch_id,
      portalEmail: email,
      contactFirstName: customer.contact_person_fname,
      contactLastName: customer.contact_person_lname,
    });
  }

  const emailOwner = await client.query(
    `SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2`,
    [email, customer.user_id]
  );
  if (emailOwner.rows.length) {
    throw new Error('This email is already registered in the system.');
  }

  await client.query(
    `UPDATE users SET email = $1, status = 'Invited', updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [email, customer.user_id]
  );
  await client.query(
    `UPDATE customers SET portal_email = $1, portal_status = 'invited', updated_at = CURRENT_TIMESTAMP WHERE customer_id = $2`,
    [email, customerId]
  );

  const token = generatePortalToken();
  const tokenHash = hashPortalToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await client.query(
    `INSERT INTO customer_portal_invitations (customer_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [customerId, customer.user_id, tokenHash, expiresAt]
  );

  return {
    userId: customer.user_id,
    portalEmail: email,
    activationToken: token,
    activationUrl: buildActivationUrl(token),
    expiresAt,
  };
}

export async function activatePortalAccount(pool, { token, password }) {
  const tokenHash = hashPortalToken(token);
  const inviteResult = await pool.query(
    `SELECT i.invitation_id, i.customer_id, i.user_id, i.expires_at, i.activated_at,
            c.portal_status, u.email, u.status AS user_status
     FROM customer_portal_invitations i
     JOIN customers c ON c.customer_id = i.customer_id
     JOIN users u ON u.id = i.user_id
     WHERE i.token_hash = $1`,
    [tokenHash]
  );

  if (!inviteResult.rows.length) {
    return { ok: false, status: 404, message: 'Invalid or expired activation link.' };
  }

  const invite = inviteResult.rows[0];
  if (invite.activated_at) {
    return { ok: false, status: 400, message: 'This account has already been activated. Please log in.' };
  }
  if (new Date(invite.expires_at) < new Date()) {
    return { ok: false, status: 400, message: 'This activation link has expired. Ask your sales agent to resend an invitation.' };
  }

  if (!password || String(password).length < 8) {
    return { ok: false, status: 400, message: 'Password must be at least 8 characters.' };
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET password_hash = $1, status = 'Active', updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [passwordHash, invite.user_id]
    );
    await client.query(
      `UPDATE customers SET portal_status = 'active', updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1`,
      [invite.customer_id]
    );
    await client.query(
      `UPDATE customer_portal_invitations SET activated_at = CURRENT_TIMESTAMP WHERE invitation_id = $1`,
      [invite.invitation_id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    ok: true,
    email: invite.email,
    customerId: invite.customer_id,
  };
}
