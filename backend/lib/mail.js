import nodemailer from 'nodemailer';

export function isMailConfigured() {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
  );
}

function smtpPassword() {
  return String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transport = {
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPassword(),
    },
  };
  if (!secure && port === 587) {
    transport.requireTLS = true;
  }
  return nodemailer.createTransport(transport);
}

/**
 * Send an email. When SMTP is not configured, logs to console (dev) and returns sent: false.
 */
export async function sendMail({ to, subject, text, html, replyTo }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@corvex.local';
  if (!isMailConfigured()) {
    console.log('[Mail] SMTP not configured — email not sent.');
    console.log('[Mail] From:', from);
    console.log('[Mail] To:', to);
    console.log('[Mail] Subject:', subject);
    if (text) console.log('[Mail] Body:\n', text);
    return { sent: false, skipped: true, reason: 'smtp_not_configured' };
  }

  const transporter = createTransport();
  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || process.env.SUPPORT_EMAIL || undefined,
    });
    console.log(`[Mail] Sent to ${to}: ${subject}`);
    return { sent: true };
  } catch (err) {
    console.error('[Mail] Send failed:', err.message);
    return { sent: false, error: err.message };
  }
}
