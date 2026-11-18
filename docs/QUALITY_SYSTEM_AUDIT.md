# CORVEX Quality System — Repository Audit Inventory

**Date:** 2026-11-18  
**Branch context:** `cleanup/2026-11-18`  
**Mode:** Read-only inventory for governance setup. **No code deleted in this audit.**

**Primary scope sources:**  
[`docs/audit_extracts/PART1_MANUSCRIPT_REQUIREMENTS_CATALOG.md`](audit_extracts/PART1_MANUSCRIPT_REQUIREMENTS_CATALOG.md),  
[`docs/audit_extracts/PART2_REQUIREMENT_TRACEABILITY_MATRIX.md`](audit_extracts/PART2_REQUIREMENT_TRACEABILITY_MATRIX.md)

---

## 1. Stack and tooling (as found)

| Layer                 | Technology                                                 | Location                                               |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Frontend              | React 18, Vite, Tailwind, Leaflet, Recharts, Framer Motion | `src/`, `index.html`                                   |
| Backend               | Node.js ESM, Express 5                                     | `backend/server.js`, `backend/routes/`                 |
| Database              | PostgreSQL via `pg`; migrations + `ensureSchema`           | `backend/migrations/`, `backend/lib/ensureSchema.js`   |
| Auth                  | bcrypt + HMAC session (`AUTH_SECRET`)                      | `backend/middleware/auth.js`, `backend/routes/auth.js` |
| Tests                 | `node --test` (not Vitest)                                 | `backend/tests/` (5 files)                             |
| Lint/format           | **None configured** prior to quality-system work           | —                                                      |
| CI                    | **No** `.github/workflows` prior to quality-system work    | —                                                      |
| Durable check scripts | schema, credit, suppliers, territories, duplicate audit    | `scripts/`, `backend/scripts/`                         |

**Not present:** C# / .NET, TypeScript, ESLint, Prettier, GitHub Actions (pre-task).

---

## 2. Frontend inventory

### 2.1 Component areas (`src/components/`)

| Area                | Approx. files | Role / purpose                                                            |
| ------------------- | ------------: | ------------------------------------------------------------------------- |
| `shared/`           |            22 | Cross-role UI (navbar, notifications, credit history, toasts, pagination) |
| `landing/`          |            12 | Marketing / public landing                                                |
| `branchManager/`    |            10 | Branch Head / BM operations, dispatch, approvals, customers               |
| `sales/`            |            10 | Sales Agent portal                                                        |
| `operatingManager/` |             7 | OM dashboards, policies, SAW results, org map                             |
| `collector/`        |             5 | Collector field portal                                                    |
| `warehouse/`        |             5 | Inventory staff document forms / body                                     |
| `admin/`            |             3 | User/branch admin (also nested under OM routes)                           |
| `territories/`      |             2 | Territory management UI                                                   |
| `inventory/`        |             2 | Central / branch inventory views                                          |
| `auth/`             |             2 | Login                                                                     |
| `common/`           |             1 | Shared map (`LeafletMap.jsx`)                                             |
| `customer/`         |             1 | Customer self-service                                                     |
| `superAdmin/`       |             1 | Super Admin shell (**not** one of the six manuscript roles)               |

### 2.2 Other frontend surfaces

| Path                        | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `src/api/`                  | 23 Axios service modules wrapping REST (`apiClient.js` base) |
| `src/rolePages/`            | Role → page registry                                         |
| `src/utils/`                | Routes helpers, formatters, geo, permissions, standing       |
| `src/offline/`              | Device queue / prefs for offline field ops                   |
| `src/data/*MockData.js`     | Prototype/demo datasets; some still used for charts/helpers  |
| `src/settings/`             | Preferences provider                                         |
| `src/theme/`, `src/styles*` | Visual tokens and CSS                                        |

### 2.3 Shared UI (reuse first)

Prefer extending: `TopNavbar`, `NotificationsInbox`/`Popover`, `CreditHistoryPages`, `CustomerProfilePanel`, `StatsGrid`, `Pagination`, `Toast`, `EmptyState`/`LoadingState`, `LeafletMap` (`common/`).

---

## 3. Backend inventory

### 3.1 Routes (`backend/routes/` — 26)

`admin`, `approvals`, `auth`, `branches`, `branchManager`, `collector`, `customerPortal`, `customers`, `dashboard`, `digitalReceipts`, `inventory`, `notifications`, `operationalAlerts`, `permissions`, `productCategories`, `products`, `reports`, `roles`, `sales`, `sawResults`, `security`, `suppliers`, `sync`, `system`, `territories`, `users`

### 3.2 Domain libs (`backend/lib/`)

Business logic lives in `lib/` (SAW, inventory stock, credit, offline sync, security monitor, OSRM, mail, jobs, etc.). Routes should call libs rather than duplicating SQL/business rules.

### 3.3 Auth / RBAC

- `ROLE_SETS` in [`backend/middleware/auth.js`](../backend/middleware/auth.js) — primary enforcement today.
- DB permissions catalog exists; middleware note indicates incomplete migration to catalog-only RBAC.
- Unscoped org roles include `operating_manager` and `super_admin`.

### 3.4 Migrations

- ~83 SQL files under `backend/migrations/`.
- Applied via explicit list in [`backend/run_migrations.js`](../backend/run_migrations.js).
- **Duplicate numeric prefixes (not necessarily duplicate content):** `051`, `052`, `053`, `060` (2 files each).
- Parallel path: [`backend/lib/ensureSchema.js`](../backend/lib/ensureSchema.js) for runtime schema guarantees.

### 3.5 Tests and scripts

| Kind                     | Location                    | Notes                                          |
| ------------------------ | --------------------------- | ---------------------------------------------- |
| Formal unit tests        | `backend/tests/*.test.js`   | auth, inventory, SAW, sales pricing, sqlSafety |
| Ad-hoc smoke/e2e scripts | `backend/scripts/test_*.js` | Not in `npm test`                              |
| Integrity checkers       | `npm run check:*`           | schema, credit, suppliers, territories         |
| Seed/reset               | `npm run seed:*`, `migrate` | Dev data                                       |

---

## 4. Duplication and similarity (inspected, not auto-merged)

| Suspect                           | Finding                                                                                                    | Classification                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `formatCurrency` / date helpers   | Canonical: `src/utils/formatters.js`; mocks re-export                                                      | **Reuse formatter**; mocks are data sources, not second formatters |
| BM vs OM Leaflet pages            | Different scope (branch vs org); shared layers utils                                                       | **Not duplicates** — related siblings                              |
| Credit / approval flows           | Split across `creditReview`, `creditInvestigation*`, `approvals` routes/UI                                 | **Related modules**, inspect before adding new credit tables       |
| Migration `051/052/053/060` pairs | Distinct filenames/purposes; shared numbers                                                                | **Number collision debt** — do not renumber without migration plan |
| `admin` vs OM nested admin        | Compatibility / merge notes; OM is approval authority                                                      | **Route compatibility**, not two products                          |
| Large page bodies                 | `WarehousePageBody`, `OperatingManagerPageBody`, `BranchManagerPageBody`, `reports.js`, `branchManager.js` | **God-file debt** — split only when authorized                     |
| Mock vs live charts               | Some OM/Admin charts still mock-backed (Part 2)                                                            | **Partial FR gap**, not duplicate endpoints                        |

**Rule for agents:** similarly named ≠ duplicate. Read call sites and data model before classifying.

---

## 5. Out-of-scope / manuscript contradictions (from existing audits)

| Item                                  | Notes                               | Handling                                                                  |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| FR-35 salaries/wages/opex analytics   | Contradicts LIM (no accounting)     | **Out of scope** unless manuscript revised                                |
| Super Admin portal                    | Extra vs six manuscript roles       | Treat as implementation extension; do not expand further without approval |
| ORS → OSRM                            | Technology substitution (Part 2 CM) | Documented drift; do not add second routing stack                         |
| Nominatim / PostGIS claims            | Partial or unused vs manuscript     | Do not invent parallel geo stacks                                         |
| Live GPS tracking                     | Explicitly excluded in LIM          | Do not implement continuous tracking                                      |
| Accounting, payroll, tax, procurement | Explicit LIM                        | Reject as out of scope                                                    |

---

## 6. Identified but not fixed (this task)

- Duplicate migration number prefixes.
- God-file size / mixed concerns.
- Incomplete offline sync vs REQ-OBJ-03 (historical Part 2; verify current `src/offline` + `/api/sync` before claiming NI).
- ROLE_SETS vs DB permission catalog dual model.
- Remaining mock analytics.
- Customer duplicate seed/test phone clusters (see `AUDIT_DUPLICATES_2026-11-18.md`) — **no merge without authorization**.
- npm audit vulnerability backlog (dependency hygiene) — not auto-fixed here.

---

## 7. Inventory conclusion

CORVEX already has a coherent three-tier layout (`src/` + `backend/` + PostgreSQL). Quality gaps are **governance and tooling** (no ESLint/CI/scope doc at root), not missing folder structure. Future work must search this inventory before creating new components, APIs, or tables.
