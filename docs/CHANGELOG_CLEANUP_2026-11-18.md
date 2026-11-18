# Cleanup changelog — 2026-11-18

Branch: `cleanup/2026-11-18`  
Rollback: `git checkout Bacaron` (or prior SHA). Local quarantine: `_archive/` + stash `wip-before-cleanup-2026-11-18`.

## Changes

| Area | What changed |
|---|---|
| Quarantine | Moved 25 one-off `scripts/*` transformers, 4 older SA-reset backups, `note..txt`, and `backend/archive/python_stub` into `_archive/` with `MANIFEST.md` |
| Gitignore | Ignore `backups/`, `_archive/**` (keep `MANIFEST.md`), `.kilo/`, `.kiro/`, `*.bak`, `note..txt` |
| Env docs | `.env.example` now documents `DB_*` + `AUTH_SECRET` (matches API) |
| Formatters | UI imports use `src/utils/formatters.js` instead of mock re-exports |
| Seed policy | Clarified `SEED_PASSWORD` is demo-only |
| Reports SQL | `/api/reports/operating-manager` uses bound date/branch params via `backend/lib/sqlSafety.js` |
| Dependencies | `axios` bumped `1.18.1` → `1.21.1` |
| Docs | `CONTRIBUTING.md`, this changelog, `docs/AUDIT_DUPLICATES_2026-11-18.md` |
| Audit script | `scripts/audit_duplicates_readonly.mjs` (read-only) |

## Metrics (local)

- Formal tests: **28 pass** (was 25; +3 sqlSafety)
- `npm run build`: success
- DB audit (read-only): phone dup groups **1**, email **0**, id_number **0**, name **1** — **no merges performed**

## Remaining decisions

1. Approve/reject suggested customer merge masters in `docs/AUDIT_DUPLICATES_2026-11-18.md`.
2. Restore WIP: `git stash pop` (stash message `wip-before-cleanup-2026-11-18`).
3. Deferred: migration number collisions `051/052/053/060`, god-file splits, mock-data removal.
