# CORVEX Sales — Customer Management Overhaul

Implementable plan for `/sales/customers`, `/sales/customers/new`, `/sales/customers/:id/edit`, and `/sales/customer-detail/:id`.

## 1. Confirmed decisions

1. **Credit correction** — Derived formula. Reseed/backfill `customer_credit_info` so every *seeded/test* customer with `outstanding_balance > 0` has a deterministic limit; recompute `available = limit - outstanding`. Do not touch user-created customers (`customer_code` not in seed patterns) or transaction history (`credit_history`, `collection_payment`, `sales_invoices`).
2. **Proposed-change scope** — Identity + business + address/territory + credit request (requested limit / reason). Excluded (stay BM/OM direct actions): `status`, `account_manager_id`, `assigned_sales_agent_id`, `id_verification_status`, `branch_id`, portal fields.
3. **Customer portal while credit pending** — Customer can sign in, view profile/balance, and submit purchase requests. Credit-sale conversion stays blocked until `customer_credit_info.credit_limit > 0`.

## 2. Root causes found in Phase 1

- `backend/migrations/009_seed_customer_activity.sql:23` inserts `customer_credit_info` only when no row exists; `008_seed_customers.sql` creates customers without credit rows.
- `backend/migrations/013_seed_realistic_transactions.sql:535-550` sets `outstanding_balance` purely from `customer_id % 5` with no limit coupling.
- `backend/scripts/populate_to_fifty.js:710-729` backfills missing credit rows at a flat 40,000 while `customer_activity` balances can exceed that.
- `backend/routes/customers.js:371-391` reports `creditLimit` from `customer_credit_info`, but the detail page (`src/components/sales/SalesCustomers.jsx:328-331`) derives `remaining` as `limit - outstanding` with no guard for a missing/zero row → "₱0.00 limit, non-zero balance".
- `backend/routes/customers.js:1275-1509` lets a Sales Agent `PUT` master fields directly; SA is only blocked from `branch_id`, `account_manager_id`, `status`, `id_verification_status`.
- `backend/routes/customers.js:573-788` returns `paymentHistory`, `recentSales`, and `activity` to every `customerRead` role (SA, collector, BM, OM).
- Existing approval center: `backend/routes/approvals.js` (BM/OM, branch-scoped via `branchFilter`), UI in `src/components/branchManager/ApprovalCenterPage.jsx` with tab allowlist at line 35.
- Existing geospatial: `backend/routes/territories.js` `/geo/reverse` (line 375) and `/geo/suggest-territory` (line 399); form already uses them at `src/components/sales/CustomerRegistrationForm.jsx:459-502`. Schedule hand-off already sends `assignmentId`/`territoryId` (`src/components/sales/SalesAreaSchedule.jsx:687`).

## 3. Phase A — Data integrity & credit logic

**A1. New migration `backend/migrations/075_customer_credit_consistency.sql`** (append to `backend/run_migrations.js` MIGRATIONS list):
- Insert a missing `customer_credit_info` row for every customer that has `customer_activity.outstanding_balance > 0` and no credit row.
- Update only rows meeting *all* of: `outstanding_balance > 0`, `credit_limit = 0`, and seed-pattern `customer_code` (`C-%`, `C-SEED-%`, or `customer_id` present in `008/009/013` seed sets). Formula:
  - `target = GREATEST(10000, LEAST(100000, CEIL(outstanding / 5000.0) * 5000))`
  - `credit_limit = GREATEST(target, outstanding)` (guarantees non-negative available)
- Add a `CHECK`-style guard note (do not add a DB constraint — historical rows may legitimately vary) and create an index if absent.
- Backfill `approved_by` from the branch manager when null; leave `approved_date` null when unknown.

**A2. Verification script `backend/scripts/verify_credit_consistency.js`** (read-only):
- Report rows where `available <> credit_limit - outstanding`, `credit_limit = 0 AND outstanding > 0`, and orphan credit rows.
- Print a deterministic table (no `RANDOM()`).

**A3. API consistency:**
- `backend/routes/customers.js` GET `/` and GET `/:id`: compute and return `available_credit = GREATEST(0, credit_limit - outstanding)` and `credit_limit_effective`; keep raw fields.
- Add `ORDER BY` guard so `credit_limit` sort uses `COALESCE(...,0)` (already does).

**A4. Seed-script hygiene (no behavior change for genuine records):**
- `populate_to_fifty.js`: change the flat `40000` credit insert to the same derived formula.
- `seed_secondary_branches.js`: change `Math.max(balance * 2, 50000)` to the derived formula for consistency with A1.

## 4. Phase B — Customer detail page (`/sales/customer-detail/:id`)

**B1. Convert to tabs** in `src/components/sales/SalesCustomers.jsx` (`CustomerDetailPage`):
- Tabs: `Overview`, `Business Information`, `Address & Territory`, `Credit Information`.
- Reuse existing `DetailRowsTable`, `StatusBadge`, `LeafletMap`, `EmptyState`. Keep URL back-context (`?from=customers|schedule|log-sale`).
- `Overview`: identity, contact, alternate/secondary contact, account status, ID/KYC status.
- `Business Information`: `customer_type`, `business_name`, `registration_profile_json` (business type/category/store type, years of operation, revenue, expenses, obligations, supplier references, evidence photo count).
- `Address & Territory`: structured address parts, composed address, map pin, territory name, assigned SA/collector.
- `Credit Information`: `credit_limit`, `outstanding_balance`, `available_credit` (from API), payment standing, last payment/sale, open invoice count. No individual payment rows.

**B2. RBAC on the detail page (Sales Agent):**
- Hide: "View Payment History" button, `Recent Activity` section (recent sales + payments/collections tables), individual payment transaction details.
- Show: limit, outstanding, available.
- Hide the "Request Credit Review" button when `credit_limit > 0` and no open CI; keep it when eligible.

**B3. Backend enforcement (not just UI):**
- Add `backend/middleware` guard helper `canViewCustomerFinancialDetails(roleSlug)`:
  - Full (payments + recent sales + activity): `super_admin`, `operating_manager`, `branch_manager`, `collector`.
  - Summary only (limit/outstanding/available/standing): `sales_staff`.
- In `backend/routes/customers.js` GET `/:id`:
  - Always return `creditInfo` summary fields (`credit_limit`, `outstanding_balance`, `available_credit`, `approved_by_name`, `approved_date`).
  - Return `paymentHistory: []`, `recentSales: []`, and omit `activity.last_*` detail fields for `sales_staff`.
  - Keep `unpaidInvoiceCount` and `hasOverdueInvoice` (non-sensitive standing) for SA.
- Confirm collectors keep full access (they are in `customerRead` and now in the full-details set).

## 5. Phase C — Branch Manager approval workflow (Proposed Changes)

**C1. New table `customer_change_requests`** (in migration 075, after the credit fix):
- Columns: `request_id`, `customer_id`, `branch_id`, `requested_by`, `status` (`Pending`/`Approved`/`Rejected`), `change_type` (`Profile`/`Credit Request`), `proposed_json JSONB`, `original_json JSONB`, `reason`, `decision_remarks`, `decided_by`, `decided_at`, `created_at`, `updated_at`.
- Unique partial index: one `Pending` request per `(customer_id, change_type)` — `CREATE UNIQUE INDEX ... ON customer_change_requests (customer_id, change_type) WHERE status = 'Pending'`.
- Audit trail columns mirror `credit_investigations` conventions.

**C2. New lib `backend/lib/customerChangeRequests.js`:**
- `FIELD_GROUPS` — map of allowed fields per `change_type` (identity/business/address/territory/credit-request only; explicit exclude list).
- `buildProposedPatch(body)` — whitelist + normalize (reuse `cleanPart`, `composeAddress`, `parseOptionalCoord`, ID type/civil status validation from `customers.js`).
- `createChangeRequest(client, {...})` — 409 if a pending request exists for the same `(customer_id, change_type)`; snapshot `original_json` from current `customers` row + `customer_credit_info`.
- `applyApprovedChange(client, requestId, reviewerId)` — transactionally `UPDATE customers SET ...` and/or `UPDATE customer_credit_info SET credit_limit = ...` from `proposed_json`; write `writeAuditFromReq` with `AUDIT_STATUS.APPROVED`.
- `rejectChangeRequest(...)` — require `decision_remarks`; write `AUDIT_STATUS.REJECTED`.

**C3. API changes:**
- `backend/routes/customers.js`:
  - New `POST /:id/change-requests` (SA + BM/OM) — body `{ change_type, reason, proposed }`. Returns 409 with existing request id if duplicate.
  - New `GET /:id/change-requests` — list for this customer (branch-scoped).
  - Modify `PUT /:id`: if `req.currentUser.roleSlug === 'sales_staff'`, do **not** write master fields. Instead create a `Pending` `customer_change_requests` row (Profile or Credit Request) and return `{ success: true, pending: true, message: 'Submitted for Branch Manager approval.' }` with 202. BM/OM keep direct `PUT`.
  - Keep existing SA blocks for `id_verification_status` / `branch_id` / `account_manager_id` / `status`.
- `backend/routes/approvals.js`:
  - `GET /customer-change-requests` (branch-scoped, `Pending` first).
  - `GET /customer-change-requests/:id` (original vs proposed diff).
  - `PATCH /customer-change-requests/:id` `{ status: 'Approved'|'Rejected', decision_remarks }`.
  - Include pending customer-change count in `GET /center-summary`.

**C4. Approval Center UI (`src/components/branchManager/ApprovalCenterPage.jsx`):**
- Add `customer-changes` to `tabFromSearch()` allowlist and the tab list.
- New tab table: customer, type, requested by, submitted, original → proposed summary, Approve/Reject (reuse `ReasonDialog`).
- Add `src/api/approvalsService.js` functions for the three new endpoints.

**C5. SA edit flow (`src/components/sales/CustomerRegistrationForm.jsx`):**
- In edit mode for `sales_staff`, change the submit button to "Submit for Approval"; show a read-only "Pending BM review" banner when a pending request exists; do not call `PUT /customers/:id` for master fields (call the new endpoint).
- Keep direct `PUT` for BM/OM edit mode.

## 6. Phase D — Enhanced registration form (`/sales/customers/new`)

**D1. Identity verification section:**
- Government ID type (existing list), ID number, and a secure file upload for the ID image.
- Reuse the existing `normalizeIdPhoto` base64 path (`backend/routes/customers.js:47-58`) — no new infra. Add a second upload for a business document (stored in `registration_profile_json.business_docs` as base64 or URL, capped count/size like `evidence_photos`).
- Add a reusable `DocumentUploadField` component mirroring `src/components/shared/ProductImagePicker.jsx` validation.

**D2. Conditional classification:**
- Keep `customer_type` select (`Individual` / `Business`).
- **Business Owner**: Business Name, Business Type/Category, Years of Operation, Estimated Monthly Revenue, Estimated Monthly Expenses, Existing Obligations, Business Docs.
- **Employed Individual**: Employer Name, Position, Duration (months/years), Employment Status, Monthly Income.
- Store employer fields in `registration_profile_json.employment` (new keys: `employer_name`, `position`, `duration_months`, `employment_status`, `monthly_income`).
- Add server-side validation in `POST /customers` for the active branch of fields.

**D3. Credit logic:**
- Remove the manual "Active" checkbox (no such checkbox exists for credit; the "Apply for credit" checkbox stays but is re-labeled "Submit for credit investigation" and never sets a limit).
- Explicit UI note: "Credit eligibility is decided by the Branch Manager after investigation."

## 7. Phase E — Address & territory automation

**E1. Auto-population (already partly present):**
- On pin settle / GPS: call `/territories/geo/reverse` then fill region/province/city/barangay/postal; call `/territories/geo/suggest-territory`.
- Add a "Use my current location" GPS button (already present) and a manual search fallback (PSGC selects already exist; add a text search filter above each select for long lists).

**E2. Contextual territory assignment:**
- Detect source from query params (`assignmentId`, `territoryId`) — already read at `CustomerRegistrationForm.jsx:177-187`.
- **Via Schedule**: when `assignmentId`/`territoryId` present, lock the territory select (`disabled`), show the assignment area name, and show a warning banner when `suggestTerritoryForLocation.classification === 'outside'` for the locked territory.
- **Via Management** (`/sales/customers`): pre-select the suggested territory and allow manual change; require `territory_override_note` when classification is `outside` (validation already exists at line 322).

**E3. Backend guard:**
- In `POST /customers`, when `source_assignment_id` is present, verify the assignment belongs to the requesting SA and that `territory_id` matches the assignment's `territory_id`; reject mismatches with 400.

## 8. Phase F — Customer portal provisioning

**F1. Trigger:**
- In `POST /customers`, when `portal_email` is provided and SMTP is configured, create the invitation (existing `createPortalInvitation` + `dispatchPortalActivationEmail` at `backend/routes/customers.js:1105-1134`).
- Currently `portalRequested = !isSalesAgent && wantsPortalAccount(create_portal_account)` — change to: SA may request a portal invite when `portal_email` is present and `create_portal_account` is true, using the same token flow (no default password).

**F2. Security:**
- Token: keep `crypto.randomBytes(32)` + SHA-256 hash (already secure).
- Enforce unique email (already checked).
- Link is 1:1 via `customers.user_id` (already enforced by `getLinkedCustomer`).

**F3. Access control while pending:**
- `backend/routes/customerPortal.js`: `/me`, `/products`, `/payments`, `/receipts`, `/statements/summary`, and `POST /purchase-requests` stay available regardless of `credit_limit`.
- Add a guard in `POST /purchase-requests`: if the request would convert to a credit sale (any line with `pay_type = 'installment'` or `term_months > 0` — pass-through today; add explicit `payment_terms` to the request body) and `credit_limit <= 0`, reject with 403 "Credit purchases are unavailable until your credit limit is approved."
- Cash purchase requests remain allowed.

## 9. Phase G — Verification & standards

- **Design system**: reuse `panel`, `content-panel`, `DetailRowsTable`, `StatusBadge`, `EmptyState`, `LoadingState`, `Pagination`, `RowActionMenu`, `LeafletMap`, `segmented-control` — no new CSS.
- **Security**: all new endpoints go through `requireAuth`, `requireBranchScope`, and the role guards; SA writes are routed through the approval workflow; collectors/BM/OM keep full detail access.
- **Math**: add `npm run check:credit` (wrapping `verify_credit_consistency.js`) and assert `available = limit - outstanding` for every row.
- **Stability**: no changes to inventory, warehouse, super-admin, or unrelated roles; no changes to `credit_history` / `collection_payment` / `sales_invoices` data.
- **Tests**: extend `backend/scripts/test_customer_management.js` with (a) SA `PUT` creates pending request, (b) duplicate pending request returns 409, (c) BM approve writes customer + credit row, (d) SA detail omits payment history, (e) collector detail includes it.

## 10. Execution order

1. Migration 075 + `run_migrations.js` entry.
2. `verify_credit_consistency.js` + `check:credit` script.
3. `backend/lib/customerChangeRequests.js`.
4. `customers.js` (GET RBAC + POST/PUT change-request endpoints).
5. `approvals.js` (three endpoints + center-summary count).
6. `src/api/approvalsService.js` + Approval Center tab.
7. `CustomerRegistrationForm.jsx` (tabs already in detail page; form edits for D/E).
8. `SalesCustomers.jsx` detail tabs + RBAC hiding.
9. `customerPortal.js` credit gate + `customers.js` portal invite tweak.
10. Tests + `npm test` + `npm run check:schema` + `npm run check:credit`.

## 11. Risks / open items

- Existing genuine user-created customers must not be reseeded. The migration's seed-pattern filter is the safeguard; verify counts before/after.
- Adding a unique partial index on `(customer_id, change_type) WHERE status='Pending'` requires PostgreSQL 9.5+ (target is PG14+).
- The "no default passwords" rule is already satisfied; the portal invite flow sets an unusable placeholder hash until activation.