import { sendMail } from './mail.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPortalActivationEmailContent({
  customerFirstName,
  salesAgentName,
  activationUrl,
  expiresHours = 24,
  companyName = 'Corvex',
  supportEmail,
  supportPhone,
}) {
  const greetingName = (customerFirstName || 'Customer').trim() || 'Customer';
  const agent = (salesAgentName || 'your Sales Agent').trim();
  const hours = Number(expiresHours) || 24;

  const text = `Hello ${greetingName},

Your customer account has been registered by your Sales Agent${agent !== 'your Sales Agent' ? ` (${agent})` : ''}.

You can now activate your account to access your customer portal.

The portal allows you to:

• View your purchases
• View invoices
• Check your outstanding balance
• View payment history
• Submit new purchase requests

Activate your account (link expires in ${hours} hours):
${activationUrl}

If you did not expect this email, please contact us${supportEmail ? ` at ${supportEmail}` : ''}${supportPhone ? ` or ${supportPhone}` : ''}.

— ${companyName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.55;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hello ${escapeHtml(greetingName)},</p>
  <p>Your customer account has been registered by your Sales Agent${agent !== 'your Sales Agent' ? ` <strong>${escapeHtml(agent)}</strong>` : ''}.</p>
  <p>You can now activate your account to access your customer portal.</p>
  <p>The portal allows you to:</p>
  <ul>
    <li>View your purchases</li>
    <li>View invoices</li>
    <li>Check your outstanding balance</li>
    <li>View payment history</li>
    <li>Submit new purchase requests</li>
  </ul>
  <p style="margin:28px 0;">
    <a href="${escapeHtml(activationUrl)}" style="display:inline-block;background:#093850;color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:8px;">ACTIVATE MY ACCOUNT</a>
  </p>
  <p style="font-size:0.9rem;color:#64748b;">This activation link will expire after ${hours} hours.</p>
  <p style="font-size:0.9rem;color:#64748b;">If you did not expect this email, please contact us${supportEmail ? ` at <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>` : ''}${supportPhone ? ` or ${escapeHtml(supportPhone)}` : ''}.</p>
  <p style="margin-top:32px;font-size:0.85rem;color:#94a3b8;">— ${escapeHtml(companyName)}</p>
</body>
</html>`;

  const agentLabel = agent !== 'your Sales Agent' ? agent : 'Your Sales Agent';
  const subject = `${agentLabel} invited you — activate your ${companyName} customer portal`;

  return { subject, text, html };
}

export async function sendPortalActivationEmail(options) {
  const { to, salesAgentEmail, ...rest } = options;
  if (!to) {
    return { sent: false, skipped: true, reason: 'missing_recipient' };
  }
  const content = buildPortalActivationEmailContent(rest);
  return sendMail({
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    replyTo: salesAgentEmail || undefined,
  });
}
