# Contributing to CORVEX

**AI / agent development rules:** see root [`AGENTS.md`](AGENTS.md).  
**Approved scope:** [`docs/PROJECT_SCOPE.md`](docs/PROJECT_SCOPE.md).  
**As-built architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Environment

- Copy `.env.example` → `.env`. Use discrete `DB_*` variables and set `AUTH_SECRET` (sessions end on restart if unset).
- `SEED_PASSWORD` in `backend/lib/seedDefaults.js` is for **demo/seed data only** — never for real accounts.

## Folder layout

| Path        | Purpose                                        |
| ----------- | ---------------------------------------------- |
| `src/`      | React + Vite frontend                          |
| `backend/`  | Express API, migrations, libs, route tests     |
| `scripts/`  | Durable check helpers only (`check_*`)         |
| `docs/`     | Deploy notes, audits, design extracts          |
| `public/`   | Static assets                                  |
| `_archive/` | Quarantined clutter (local; see `MANIFEST.md`) |
| `backups/`  | Local JSON dumps only (gitignored)             |

Do not leave scratch notes (`note..txt`), one-off AST/refactor scripts, or DB dumps at the repo root.

## Naming

- JS/JSX modules: `camelCase` files; React components `PascalCase`.
- SQL migrations: `NNN_snake_description.sql` with a **unique** `NNN` prefix. Do not reuse numbers (`051`, `052`, … collisions are deferred debt — ask before renumbering applied migrations).

## Formatters

Import display helpers from `src/utils/formatters.js`, not from `src/data/*MockData.js`.

## Duplicate prevention

- Prefer unique constraints where the domain allows (phone / portal email / id number).
- Use `backend/lib/customerDuplicateLookup.js` before creating customers.
- Re-run read-only audit: `node scripts/audit_duplicates_readonly.mjs`.

## Quarantine policy

Never permanently delete uncertain clutter. Move it under `/_archive` and update `_archive/MANIFEST.md` with original path and reason.

## Commits

One logical change per commit. Run `npm test` and `npm run build` before pushing cleanup or API changes.
