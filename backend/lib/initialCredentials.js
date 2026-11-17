import crypto from 'crypto';

// Ambiguous characters (0/O, 1/l/I) removed so the password can be read aloud or typed from a screen.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(charset) {
  return charset[crypto.randomInt(charset.length)];
}

/** Cryptographically random temporary password with every character class present. */
export function generateTemporaryPassword(length = 14) {
  const size = Math.max(12, Number(length) || 14);
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
