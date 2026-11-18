# CORVEX — Agent and Developer Instructions

**Guiding principle:** Understand what already exists. Reuse what works. Extend what is necessary. Create only what is missing. Never exceed the approved project scope.

Read before coding:

1. [`docs/PROJECT_SCOPE.md`](docs/PROJECT_SCOPE.md) — approved capstone boundary
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — as-built structure
3. [`docs/QUALITY_SYSTEM_AUDIT.md`](docs/QUALITY_SYSTEM_AUDIT.md) — inventory of existing modules
4. [`CONTRIBUTING.md`](CONTRIBUTING.md) — env, folders, migration hygiene
5. [`docs/MIGRATION_REVIEW.md`](docs/MIGRATION_REVIEW.md) — before any schema change

Authoritative requirements extraction (do not invent FRs):  
[`docs/audit_extracts/PART1_MANUSCRIPT_REQUIREMENTS_CATALOG.md`](docs/audit_extracts/PART1_MANUSCRIPT_REQUIREMENTS_CATALOG.md)

---

## Rule 1: Search Before Creating

Before creating any new component, function, hook, API, service, entity, table, column, or migration:

1. Search the repository (paths under `src/`, `backend/`, `docs/`).
2. Identify whether a similar implementation already exists.
3. Inspect its functionality and dependencies.
4. Determine whether it can be reused or extended.
5. Create something new only when an actual approved requirement cannot be fulfilled by the existing implementation.

Never create another implementation merely because it is easier than understanding the existing one.

**CORVEX anchors (reuse first):**

- Formatters: `src/utils/formatters.js`
- Shared UI: `src/components/shared/`, `src/components/common/LeafletMap.jsx`
- API client: `src/api/apiClient.js` + existing `*Service.js`
- Auth / RBAC: `backend/middleware/auth.js` (`ROLE_SETS`, `requireAuth`, `requireRole`)
- Domain logic: `backend/lib/*` (do not re-implement SAW, inventory stock, credit, OSRM in routes)
- Customer identity: `backend/lib/customerDuplicateLookup.js` before new customer identity tables/columns

---

## Rule 2: No Unnecessary Duplication

Prevent unnecessary duplication of React components, hooks, utilities, API endpoints/services, backend services, business rules, database tables/relationships, validation, config, and dependencies.

Maintain a single source of truth. Similarly named files are **not** automatically duplicates — inspect responsibilities and call sites first (see audit doc).

Do **not** auto-delete code that merely looks similar (e.g. jscpd hits). Report and seek approval.

---

## Rule 3: Database Protection

Before proposing database changes:

1. Inspect existing schema (migrations + live DB via `npm run check:schema` when available).
2. Inspect entities and relationships.
3. Review `backend/migrations/` and `backend/run_migrations.js`.
4. Check whether the field or relationship already exists (`ensureSchema.js` may already guarantee it).
5. Prefer extending existing structures.

Never create a new table without a justified business requirement tied to approved scope.  
Never fork customer identities, balances, or transaction histories into parallel tables.  
Never run destructive migrations (`DROP` / `TRUNCATE` / mass `DELETE`) or delete production-like data without **explicit human authorization**.  
Complete [`docs/MIGRATION_REVIEW.md`](docs/MIGRATION_REVIEW.md). Use a **unique** `NNN_` migration prefix (collisions `051/052/053/060` are known debt — do not add more collisions).

---

## Rule 4: Architecture Consistency

Follow the established CORVEX layout:

- Frontend: `src/` (Vite React)
- Backend: `backend/` (Express ESM)
- SQL: `backend/migrations/`
- Durable scripts only: `scripts/check_*`

Preserve naming conventions, service/API organization, auth patterns, Tailwind/UI patterns, and existing error-handling style. Do not introduce a competing architecture (new monorepo layout, alternate state library, second HTTP client, second ORM) without demonstrated need **and** explicit approval.

---

## Rule 5: Scope Protection

Use [`docs/PROJECT_SCOPE.md`](docs/PROJECT_SCOPE.md) as the primary implementation boundary.

Before implementing, ask:

- Is it required by the approved project scope?
- Is it necessary for an existing approved subsystem?
- Does it support an existing business workflow?
- Is it merely an optional enhancement?

Do **not** automatically introduce unrequested modules, dashboards, analytics, external integrations, extra user roles, automation, approval levels, or unrelated enterprise features.

If outside scope: **report as out-of-scope suggestion** — do not implement.  
If requirements are unclear: **state the uncertainty** — do not invent business requirements.  
FR-35 (salaries/opex) contradicts manuscript limitations → treat as **out of scope**.

---

## Rule 6: Protect Existing Functionality

Before modifying a component or workflow:

1. Identify dependents (imports, routes, roles).
2. Understand current behavior.
3. Note which roles use it.
4. Identify side effects.
5. Preserve working behavior unless the task explicitly changes it.

Do not modify unrelated modules for convenience. Do not fix unrelated legacy debt unless authorized. Distinguish **pre-existing** issues from **newly introduced** ones in reports.

---

## Mandatory workflow for every AI / agent task

1. Read project scope.
2. Read architecture documentation.
3. Inspect the existing implementation (search + open files).
4. Search for reusable components, services, APIs, and DB structures.
5. Identify affected files and dependencies.
6. Explain the proposed changes (plan or short design note).
7. Implement only what is necessary.
8. Run appropriate quality checks (`npm run lint`, `npm run check:migrations`, `npm test`, `npm run build` as relevant).
9. Test affected workflows.
10. Report what changed and what remains unresolved.

Do not perform broad refactoring during an unrelated feature task.

---

## Quality commands

| Command                    | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `npm run lint`             | ESLint                                     |
| `npm run format:check`     | Prettier check                             |
| `npm run check:dupes`      | Copy/paste report (jscpd) — review only    |
| `npm run check:migrations` | Migration number / destructive SQL hygiene |
| `npm test`                 | Backend unit tests                         |
| `npm run build`            | Frontend production build                  |
| `npm run quality`          | Aggregate gate for CI-like local runs      |

---

## Hard bans

- No redesign of CORVEX “while here”.
- No new product features unless the user task requests them **and** they are in scope.
- No silent destructive DB operations.
- No fabricating FRs or treating optional ideas as approved.
- No second formatting stack competing with Prettier.
