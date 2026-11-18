/**
 * Migration hygiene: unique NNN_ prefixes; destructive SQL requires authorization marker.
 *
 * - New duplicate prefixes → exit 1
 * - Known historical collisions (051, 052, 053, 060) → warn only (documented debt)
 * - DROP/TRUNCATE without authorization marker → exit 1
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'backend', 'migrations');

const DESTRUCTIVE_RE = /\b(DROP\s+TABLE|TRUNCATE\s+TABLE|\bTRUNCATE\b)/i;
const AUTH_MARKER = 'CORVEX-DESTRUCTIVE-AUTHORIZED:';

/** Known historical collisions — warn only; do not add more. */
const KNOWN_COLLISIONS = new Set(['051', '052', '053', '060']);

function main() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const byPrefix = new Map();
  const errors = [];
  const warnings = [];

  for (const file of files) {
    const match = /^(\d+)[_-]/.exec(file);
    if (!match) {
      warnings.push(`Unnumbered migration file: ${file}`);
      continue;
    }
    const prefix = match[1];
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(file);

    const full = path.join(migrationsDir, file);
    const text = fs.readFileSync(full, 'utf8');
    const header = text.slice(0, 1200);
    const authorized = header.includes(AUTH_MARKER);

    if (DESTRUCTIVE_RE.test(text) && !authorized) {
      errors.push(`${file}: contains DROP/TRUNCATE without header marker \`-- ${AUTH_MARKER} <reason>\``);
    }
  }

  for (const [prefix, list] of [...byPrefix.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (list.length <= 1) continue;
    const msg = `Duplicate migration prefix ${prefix}: ${list.join(', ')}`;
    if (KNOWN_COLLISIONS.has(prefix) && list.length === 2) {
      warnings.push(`${msg} [KNOWN DEBT — renumber only with approved plan; do not add more]`);
    } else {
      errors.push(msg);
    }
  }

  for (const w of warnings) console.log(`WARN: ${w}`);
  if (errors.length) {
    console.log('check_migrations FAILED:');
    for (const e of errors) console.log(`  - ${e}`);
    console.log('\nSee docs/MIGRATION_REVIEW.md');
    process.exit(1);
  }

  console.log(
    `check_migrations OK — ${files.length} SQL files; ${warnings.length} warning(s); no new prefix collisions.`,
  );
  process.exit(0);
}

main();
