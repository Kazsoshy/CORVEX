# Migration review checklist

Complete this checklist **before** proposing or committing a new SQL migration or schema change.

## 1. Search first

- [ ] Searched `backend/migrations/` for related tables/columns
- [ ] Checked `backend/lib/ensureSchema.js` for runtime guarantees already covering the need
- [ ] Confirmed no existing column/FK/index satisfies the requirement
- [ ] Confirmed this is not a second customer-identity / balance / payment ledger table

## 2. Justify

- [ ] Tied to an approved FR/module in `docs/PROJECT_SCOPE.md` (cite ID)
- [ ] Documented purpose in the migration header comment
- [ ] Chose **unique** `NNN_` prefix (do not reuse `051`, `052`, `053`, `060`, or any existing number)
- [ ] Added file to `backend/run_migrations.js` `MIGRATIONS` list if required by runner

## 3. Safety

- [ ] No `DROP TABLE` / `TRUNCATE` / unrestricted `DELETE` without explicit human authorization
- [ ] If destructive SQL is authorized, file starts with: `-- CORVEX-DESTRUCTIVE-AUTHORIZED: <ticket/reason>`
- [ ] Backward-compatible or paired with application deploy notes
- [ ] Does not invent requirements outside manuscript scope

## 4. Verify

- [ ] `npm run check:migrations` passes
- [ ] Local migrate smoke (dev only) when changing applied schema
- [ ] No production execution without separate approval

**Agents:** if any box is unchecked, stop and ask the user rather than inventing a parallel schema.
