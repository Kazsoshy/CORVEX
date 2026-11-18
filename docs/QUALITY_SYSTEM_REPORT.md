# CORVEX Quality System — Implementation Report

**Date:** 2026-11-18  
**Branch:** `cleanup/2026-11-18`  
**Goal:** Repository-wide development quality, architecture consistency, and scope guardrails — **not** a product feature.

---

## 1. Repository audit findings

See [`QUALITY_SYSTEM_AUDIT.md`](QUALITY_SYSTEM_AUDIT.md).

- Stack: React/Vite + Express + PostgreSQL; no C#/.NET.
- ~14 UI role areas, 23 API services, 26 routes, 83 migrations, shared UI under `src/components/shared/`.
- Pre-task gaps: no ESLint/Prettier/CI; CONTRIBUTING only; scope lived in `docs/audit_extracts/` only.

## 2. Existing duplicate implementations identified

| Item                                             | Status                                                      |
| ------------------------------------------------ | ----------------------------------------------------------- |
| Migration prefixes `051/052/053/060`             | **Identified but not fixed** (warned by `check:migrations`) |
| Formatter vs mock re-exports                     | Mostly addressed earlier; mocks remain data sources         |
| BM vs OM leaflet / credit modules                | Related siblings — **not** auto-duplicates                  |
| God-files (`WarehousePageBody`, `reports.js`, …) | **Identified but not fixed**                                |
| Customer phone/name clusters                     | See `AUDIT_DUPLICATES_2026-11-18.md` — **no merges**        |

## 3. Code quality tools configured

| Tool              | Config                                                            | Role                                                    |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| ESLint 9 flat     | [`eslint.config.js`](../eslint.config.js)                         | React, hooks, unused imports; legacy hooks noise = warn |
| Prettier          | [`.prettierrc`](../.prettierrc)                                   | Single formatter for governance/tooling paths           |
| jscpd             | [`.jscpd.json`](../.jscpd.json)                                   | Copy/paste **report only** (CI continue-on-error)       |
| Migration hygiene | [`scripts/check_migrations.mjs`](../scripts/check_migrations.mjs) | New prefix collisions + unauthorized DROP/TRUNCATE fail |

## 4. Configuration / docs created or updated

| Path                                  | Action                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| `AGENTS.md`                           | **Created** — Rules 1–6 + mandatory workflow                       |
| `.cursor/rules/corvex-governance.mdc` | **Created** — always-on Cursor reinforcement                       |
| `CONTRIBUTING.md`                     | **Updated** — links to AGENTS/scope/architecture                   |
| `docs/PROJECT_SCOPE.md`               | **Created** — manuscript-only boundary                             |
| `docs/ARCHITECTURE.md`                | **Created** — as-built map                                         |
| `docs/MIGRATION_REVIEW.md`            | **Created** — schema change checklist                              |
| `docs/QUALITY_SYSTEM_AUDIT.md`        | **Created** — inventory                                            |
| `docs/QUALITY_SYSTEM_REPORT.md`       | **Created** — this report                                          |
| `.github/workflows/quality.yml`       | **Created** — PR/push quality job                                  |
| `package.json` scripts                | **Updated** — lint, format, check:migrations, check:dupes, quality |
| `.gitignore`                          | **Updated** — `reports/`, `.eslintcache`                           |

## 5. Database protection mechanisms

- `npm run check:migrations` — unique prefixes (known debt = warn); destructive SQL needs `-- CORVEX-DESTRUCTIVE-AUTHORIZED:`
- `docs/MIGRATION_REVIEW.md` — required agent checklist
- AGENTS Rule 3 — no parallel customer/balance tables; no silent destructive ops
- Existing `npm run check:schema` / `check:credit` remain local/DB-dependent (not forced in CI without secrets)

## 6. Project scope documentation

[`PROJECT_SCOPE.md`](PROJECT_SCOPE.md) distilled from PART1: objectives, six roles, modules, workflows, FR/NFR summaries, exclusions. FR-35 opex called **out of scope** per LIM. Technology drift (OSRM vs ORS) documented, not forked.

## 7. Automated checks and commands

| Command                    | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `npm run lint`             | ESLint (errors fail; high max-warnings for legacy)    |
| `npm run format:check`     | Prettier on governance/tooling paths                  |
| `npm run format`           | Write those paths                                     |
| `npm run check:dupes`      | jscpd report → `reports/jscpd/`                       |
| `npm run check:migrations` | Migration hygiene                                     |
| `npm test`                 | Backend unit tests                                    |
| `npm run build`            | Vite production build                                 |
| `npm run quality`          | lint + format:check + check:migrations + test + build |

CI: `.github/workflows/quality.yml` (dupes advisory).

## 8. Test results (verified this run)

| Check                            | Result                                      |
| -------------------------------- | ------------------------------------------- |
| ESLint errors (`eslint --quiet`) | **0**                                       |
| `check:migrations`               | **OK** (4 known-debt warnings)              |
| `npm test`                       | **28 pass / 0 fail**                        |
| `npm run build`                  | Run as part of final `quality` verification |
| `format:check`                   | Governance paths after Prettier write       |

## 9. Technical debt not addressed

- Renumbering migration collisions
- Splitting god-files
- Elevating all ESLint warnings to errors
- Full-repo Prettier reformat
- ROLE_SETS vs permission catalog unification
- Mock analytics replacement
- npm audit vulnerability remediation
- Customer duplicate merges

## 10. Recommendations for future improvements

1. Authorize migration renumber plan when deploy-safe.
2. Gradually fix `react-hooks/*` warnings in touched files only.
3. Expand Prettier scope file-by-file with feature PRs.
4. Add DB service + secrets to CI before enabling `check:schema` in Actions.
5. Keep agents on the 10-step workflow in `AGENTS.md`.

---

## Status legend for this delivery

| Label                               | Meaning                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Implemented and verified**        | Governance docs, ESLint/Prettier/jscpd, migration check, CI workflow, npm scripts, tests green for errors |
| **Identified but not fixed**        | Section 9 debt; duplicate migration numbers; lookalike code left intact                                   |
| **Recommended but not implemented** | Section 10 items                                                                                          |
