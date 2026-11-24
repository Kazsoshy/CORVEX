import crypto from 'crypto';
import { isMailConfigured, sendMail } from './mail.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmailFormat(email) {
  return EMAIL_RE.test(normalizeEmail(email));
}

function authSecret() {
  return process.env.AUTH_SECRET || 'corvex-dev-auth-secret';
}

function hashOtpCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function signEmailVerificationToken(email) {
  const normalized = normalizeEmail(email);
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ email: normalized, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyEmailVerificationToken(token, expectedEmail) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'invalid_token' };
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: 'invalid_token' };
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid_token' };
  }
  const email = normalizeEmail(parsed?.email);
  if (!email || email !== normalizeEmail(expectedEmail)) {
    return { ok: false, reason: 'email_mismatch' };
  }
  if (!Number.isFinite(Number(parsed?.exp)) || Number(parsed.exp) < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, email };
}

function buildOtpEmailContent(code) {
  const minutes = Math.round(OTP_TTL_MS / 60000);
  const companyName = process.env.COMPANY_NAME || 'Corvex';
  const text = `Your ${companyName} email verification code is ${code}.

It expires in ${minutes} minutes. If you did not request this, you can ignore this message.

— ${companyName}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.55;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <p>Your <strong>${companyName}</strong> email verification code is:</p>
  <p style="font-size:1.75rem;font-weight:700;letter-spacing:0.2em;">${code}</p>
  <p style="font-size:0.9rem;color:#64748b;">This code expires in ${minutes} minutes.</p>
  <p style="font-size:0.9rem;color:#64748b;">If you did not request this, you can ignore this message.</p>
</body>
</html>`;
  return {
    subject: `${companyName} email verification code`,
    text,
    html,
  };
}

/**
 * Create OTP challenge and send via SMTP.
 * @returns {{ sent: boolean, skipped?: boolean, cooldownSeconds?: number, error?: string }}
 */
export async function sendEmailOtpChallenge(pool, { email, userId }) {
  const normalized = normalizeEmail(email);
  if (!isValidEmailFormat(normalized)) {
    const err = new Error('A valid email address is required.');
    err.status = 400;
    throw err;
  }
  if (!isMailConfigured()) {
    const err = new Error(
      'Email verification requires SMTP. Ask your administrator to set SMTP in .env and restart the API.'
    );
    err.status = 503;
    throw err;
  }

  const recent = await pool.query(
    `SELECT id, created_at
     FROM customer_email_otp_challenges
     WHERE email_normalized = $1
       AND created_by_user_id IS NOT DISTINCT FROM $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalized, userId ?? null]
  );
  if (recent.rows[0]) {
    const ageMs = Date.now() - new Date(recent.rows[0].created_at).getTime();
    if (ageMs < RESEND_COOLDOWN_MS) {
      const cooldownSeconds = Math.ceil((RESEND_COOLDOWN_MS - ageMs) / 1000);
      const err = new Error(`Please wait ${cooldownSeconds}s before requesting another code.`);
      err.status = 429;
      err.cooldownSeconds = cooldownSeconds;
      throw err;
    }
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await pool.query(
    `INSERT INTO customer_email_otp_challenges
      (email_normalized, code_hash, expires_at, created_by_user_id)
     VALUES ($1, $2, $3, $4)`,
    [normalized, codeHash, expiresAt, userId ?? null]
  );

  const content = buildOtpEmailContent(code);
  const mailResult = await sendMail({
    to: normalized,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  if (!mailResult.sent) {
    const err = new Error(mailResult.error || 'Failed to send verification email.');
    err.status = mailResult.skipped ? 503 : 502;
    throw err;
  }

  return { sent: true, email: normalized, expires_in_seconds: Math.round(OTP_TTL_MS / 1000) };
}

/**
 * Verify OTP and return a short-lived create token.
 */
export async function verifyEmailOtpChallenge(pool, { email, code, userId }) {
  const normalized = normalizeEmail(email);
  const codeDigits = String(code || '').trim();
  if (!isValidEmailFormat(normalized)) {
    const err = new Error('A valid email address is required.');
    err.status = 400;
    throw err;
  }
  if (!/^\d{6}$/.test(codeDigits)) {
    const err = new Error('Enter the 6-digit verification code.');
    err.status = 400;
    throw err;
  }

  const result = await pool.query(
    `SELECT id, code_hash, expires_at, attempt_count, consumed_at, created_by_user_id
     FROM customer_email_otp_challenges
     WHERE email_normalized = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalized]
  );
  const row = result.rows[0];
  if (!row) {
    const err = new Error('No verification code found for this email. Request a new code.');
    err.status = 400;
    throw err;
  }
  if (row.consumed_at) {
    const err = new Error('That verification code was already used. Request a new code.');
    err.status = 400;
    throw err;
  }
  if (userId != null && row.created_by_user_id != null && Number(row.created_by_user_id) !== Number(userId)) {
    const err = new Error('This verification code belongs to another session. Request a new code.');
    err.status = 403;
    throw err;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const err = new Error('Verification code expired. Request a new code.');
    err.status = 400;
    throw err;
  }
  if (Number(row.attempt_count) >= MAX_ATTEMPTS) {
    const err = new Error('Too many incorrect attempts. Request a new code.');
    err.status = 400;
    throw err;
  }

  const expectedHash = hashOtpCode(codeDigits);
  const ok = crypto.timingSafeEqual(
    Buffer.from(String(row.code_hash)),
    Buffer.from(expectedHash)
  );
  if (!ok) {
    await pool.query(
      `UPDATE customer_email_otp_challenges
       SET attempt_count = attempt_count + 1
       WHERE id = $1`,
      [row.id]
    );
    const err = new Error('Incorrect verification code.');
    err.status = 400;
    throw err;
  }

  await pool.query(
    `UPDATE customer_email_otp_challenges
     SET consumed_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [row.id]
  );

  return {
    email: normalized,
    email_verification_token: signEmailVerificationToken(normalized),
    expires_in_seconds: Math.round(TOKEN_TTL_MS / 1000),
  };
}
