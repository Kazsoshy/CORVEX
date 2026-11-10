/**
 * Controlled verification of the CORVEX malware signature scanner.
 * Uses the industry-standard EICAR test string (not live malware).
 *
 * Run: node backend/scripts/test_security_scanner.js
 */
import { EICAR_SIGNATURE, scanBuffer } from '../lib/security/malwareScanner.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('PASS:', msg);
  }
}

const clean = scanBuffer(Buffer.from('hello corvex product photo'));
assert(clean.clean === true, 'Clean buffer reports clean');

const eicar = scanBuffer(Buffer.from(EICAR_SIGNATURE, 'utf8'), { fileName: 'eicar.com' });
assert(eicar.clean === false, 'EICAR test file is detected');
assert(eicar.findings.some((f) => f.family === 'Virus' || f.signatureId === 'eicar'), 'EICAR classified as Virus');

const pe = Buffer.alloc(128, 0);
pe[0] = 0x4d;
pe[1] = 0x5a;
Buffer.from('This program cannot be run in DOS mode').copy(pe, 16);
const peScan = scanBuffer(pe, { fileName: 'photo.jpg', mime: 'image/jpeg' });
assert(peScan.clean === false, 'PE disguised as image is detected');
assert(peScan.findings.some((f) => /Trojan|disguised/i.test(f.family + f.label)), 'PE finding classified');

const sqliSafe = scanBuffer(Buffer.from("Customer O'Brien invoice note"));
assert(sqliSafe.clean === true, 'Benign apostrophe text is not malware');

if (process.exitCode) {
  console.error('\nSecurity scanner verification failed.');
} else {
  console.log('\nSecurity scanner verification passed (EICAR + heuristics).');
}
