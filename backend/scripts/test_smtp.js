/**
 * Quick Gmail/SMTP check. Usage from project root:
 *   node backend/scripts/test_smtp.js you@gmail.com
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMailConfigured, sendMail } from '../lib/mail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const to = process.argv[2] || process.env.SMTP_USER;
if (!to) {
  console.error('Usage: node backend/scripts/test_smtp.js recipient@email.com');
  process.exit(1);
}

if (!isMailConfigured()) {
  console.error('SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
  process.exit(1);
}

const result = await sendMail({
  to,
  subject: 'Corvex SMTP test',
  text: 'If you received this, portal activation emails will work.',
  html: '<p>If you received this, portal activation emails will work.</p>',
});

if (result.sent) {
  console.log(`Test email sent to ${to}`);
  process.exit(0);
}

console.error('Send failed:', result.error || result.reason || 'unknown');
process.exit(1);
