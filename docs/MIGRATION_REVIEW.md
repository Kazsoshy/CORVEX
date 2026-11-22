# Migration review checklist

Complete this checklist **before** proposing or committing a new SQL migration or schema change.

## Current change: `083_branch_transfer_receiving_first.sql`

### 1. Search first

- [x] Searched `backend/migrations/` for related tables/columns (`080_identity_verify_branch_transfer.sql`)
- [x] Checked `backend/lib/ensureSchema.js` for runtime guarantees already covering the need
- [x] Confirmed no existing column/FK/index satisfies the requirement (location + Receiving BM fields missing)
- [x] Confirmed this is not a second customer-identity / balance / payment ledger table (extends `customer_branch_transfers` only)

### 2. Justify

- [x] Tied to approved field/customer workflows in `docs/PROJECT_SCOPE.md` (FR-16…21 field portal; RBAC FR-04…07) — cross-branch customer ownership revise
- [x] Documented purpose in the migration header comment
- [x] Chose **unique** `083_` prefix (do not reuse `051`, `052`, `053`, `060`, or any existing number)
- [x] Added file to `backend/run_migrations.js` `MIGRATIONS` list

### 3. Safety

- [x] No `DROP TABLE` / `TRUNCATE` / unrestricted `DELETE` without explicit human authorization
- [x] If destructive SQL is authorized, file starts with: `-- CORVEX-DESTRUCTIVE-AUTHORIZED: <ticket/reason>` — N/A (constraint/index rebuild only)
- [x] Backward-compatible or paired with application deploy notes (status widen; legacy rows remapped)
- [x] Does not invent requirements outside manuscript scope

### 4. Verify

- [x] `npm run check:migrations` passes (authorized index/CHECK rebuild only)
- [x] Local migrate smoke (dev only) when changing applied schema
- [x] No production execution without separate approval

**Agents:** if any box is unchecked, stop and ask the user rather than inventing a parallel schema.

---

## Template (future migrations)

### 1. Search first

- [ ] Searched `backend/migrations/` for related tables/columns
- [ ] Checked `backend/lib/ensureSchema.js` for runtime guarantees already covering the need
- [ ] Confirmed no existing column/FK/index satisfies the requirement
- [ ] Confirmed this is not a second customer-identity / balance / payment ledger table

### 2. Justify

- [ ] Tied to an approved FR/module in `docs/PROJECT_SCOPE.md` (cite ID)
- [ ] Documented purpose in the migration header comment
- [ ] Chose **unique** `NNN_` prefix (do not reuse `051`, `052`, `053`, `060`, or any existing number)
- [ ] Added file to `backend/run_migrations.js` `MIGRATIONS` list if required by runner

### 3. Safety

- [ ] No `DROP TABLE` / `TRUNCATE` / unrestricted `DELETE` without explicit human authorization
- [ ] If destructive SQL is authorized, file starts with: `-- CORVEX-DESTRUCTIVE-AUTHORIZED: <ticket/reason>`
- [ ] Backward-compatible or paired with application deploy notes
- [ ] Does not invent requirements outside manuscript scope

### 4. Verify

- [ ] `npm run check:migrations` passes
- [ ] Local migrate smoke (dev only) when changing applied schema
- [ ] No production execution without separate approval
