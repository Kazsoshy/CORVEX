# CORVEX Part 2 — Requirement Traceability Matrix

**Audit date:** 2026-10-20  
**Method:** Static code inspection + Node execution of `computeSawScores`  
**Manuscript:** ACM Manuscript Paper - CORVEX.docx.pdf (36 pp)  
**Codebase:** `C:\Users\ASUS\CORVEX`

Status legend: **IV** = Implemented and Verified (runtime) · **IS** = Implemented — Statically Verified · **PI** = Partially Implemented · **UI** = UI Only / Placeholder · **NI** = Not Implemented · **CM** = Contradicts Manuscript · **UV** = Unable to Verify

---

## Specific objectives

| ID | Manuscript Requirement | Ref | Expected Behavior | Evidence | Files | Status | Gap | Action |
|---|---|---|---|---|---|---|---|---|
| REQ-OBJ-02 | Leaflet + SAW prioritized daily collection + route viz | §1.3.2.1 | SAW list + map routes for collectors | SAW pipeline + Leaflet + OSRM (not ORS) | `sawCollection.js`, `collector.js`, `LeafletMap.jsx` | PI | ORS→OSRM; no Nominatim | Document OSRM or integrate ORS |
| REQ-OBJ-03 | Offline Field Portal + auto-sync | §1.3.2.2 | Record offline; sync when online | Schema only; UI toggles say not connected | `001_initial_schema.sql` offline_sync_queue; `SalesPageBody.jsx` | NI | No IndexedDB/SW/queue API | Implement offline sync (P0) |
| REQ-OBJ-04 | PostgreSQL Inventory Centralization | §1.3.2.3 | Multi-branch accurate stock | Central rollup, transfers, oversell lock | `branchInventoryStock.js`, `inventory.js` | IS | Dashboard pendingRestocks=0 | Minor fix |
| REQ-OBJ-05 | Centralized payment monitoring for authorized mgmt | §1.3.2.4 | OM verify company-wide payments | Collections + credit history exist; access broader than OM-only; sales don’t raise balances | `collector.js`, `reports.js`, `auth.js` ROLE_SETS | PI | Auth boundary + sales→balance gap | Fix balance updates + tighten roles |
| REQ-OBJ-06 | Inventory & Sales Dashboard descriptive analytics | §1.3.2.5 | Live analytics from DB | Strong SQL reports; some OM/Admin charts mock | `reports.js`, `OperatingManagerPageBody.jsx`, mock data | PI | Mock comparison/trends | Replace mocks with APIs |

---

## Functional requirements (FR-01…39)

| ID | Requirement | Ref | Expected | Evidence | Files | Status | Gap | Action |
|---|---|---|---|---|---|---|---|---|
| REQ-FR-01 | Authenticate username/password | T4 p.8 | Login gate | bcrypt + HMAC session | `routes/auth.js`, `middleware/auth.js` | IS | — | — |
| REQ-FR-02 | Secure sign out | T4 | Clear session | Client clear + dialog | `authService.js`, `LogoutConfirmDialog.jsx` | IS | No server token revoke | Optional revoke list |
| REQ-FR-03 | Deny invalid credentials | T4 | Reject bad login | 401 paths + rate limit | `routes/auth.js` | IS | — | — |
| REQ-FR-04 | OM create accounts; customer own data only | T4 | Account create + isolation | users CRUD; customerPortal scoped | `users.js`, `customerPortal.js` | IS | Role labels differ | Align naming |
| REQ-FR-05 | OM update accounts | T4 | Update users | PUT users | `users.js` | IS | — | — |
| REQ-FR-06 | Activate/deactivate | T4 | Soft disable | Inactive status | `users.js`, login check | IS | — | — |
| REQ-FR-07 | Assign RBAC by role | T4 | Permissions enforce | Hardcoded ROLE_SETS; DB permissions unused by middleware | `auth.js`, `roles.js` | PI | Matrix not enforced | Enforce or document slug RBAC |
| REQ-FR-08 | View profile | T4 | GET profile | `/api/auth/me` | `auth.js` | IS | — | — |
| REQ-FR-09 | Update profile/password | T4 | PUT profile | `/api/auth/me` | `auth.js` | IS | Password reset UI placeholder | Wire reset or keep admin-only |
| REQ-FR-10 | Retrieve SAW inputs | T4 | Fetch criteria | SQL source rows | `sawCollectionData.js` | IS | — | — |
| REQ-FR-11 | Normalize criteria | T4 | 0–1 benefit/cost | Max balance/days; min/dist | `sawCollection.js` computeSawScores | IS | All-zero days not renormalized (REQ-ALG-SAW-08) | Renormalize weights |
| REQ-FR-12 | Weighted preference score | T4 | 0.4/0.3/0.3 | WEIGHT_* constants | `sawCollection.js:6-8` | IV | Sample Node test passed | Keep regression tests |
| REQ-FR-13 | Rank by score | T4 | Desc + customer_id | sort + rank | `sawCollection.js:91-95` | IV | — | — |
| REQ-FR-14 | Daily prioritized schedule | T4 | Assign visits from SAW | BM assign + field_visits | `branchManager.js`, `sawCollectionData.js` | IS | — | — |
| REQ-FR-15 | Sales locations/territories | T4 | Map territories | Leaflet layers + territories | `branchLeafletLayers.js`, territories routes | IS | — | — |
| REQ-FR-16 | Display schedules field portal | T4 | Collector/sales today | Collector/Sales pages + APIs | `CollectorPageBody.jsx`, `SalesPageBody.jsx` | IS | Online only | Offline later |
| REQ-FR-17 | OpenRouteService routes | T4 | ORS recommended routes | **OSRM** instead | `backend/lib/osrm.js`, `collector.js` | CM | Technology substitution | Update MS or switch to ORS |
| REQ-FR-18 | Record collections | T4 | Collection txn | Payment + balance update | `collector.js` ~794+ | IS | Not offline | Offline P0 |
| REQ-FR-19 | Record sales | T4 | Sales txn | Invoice create + stock | `sales.js` | IS | No balance increase; not offline | Integrate balance |
| REQ-FR-20 | Field activity reports | T4 | Submit reports | collector/sales endpoints | `collector.js` | IS | sync_status cosmetic | Offline sync |
| REQ-FR-21 | Digital receipts | T4 | Receipt on collection | digital_receipts insert | `collector.js` | IS | — | — |
| REQ-FR-22 | Add inventory | T4 | Warehouse add | restocks / stock paths | `inventory.js` | IS | — | — |
| REQ-FR-23 | Update inventory | T4 | Update stock | upsertBranchInventoryStock | `branchInventoryStock.js` | IS | — | — |
| REQ-FR-24 | Auto sync inventory across branches | T4 | Consistent central view | alignCentralInventory | `branchInventoryStock.js` | IS | Derived rollup not separate warehouse | Document model |
| REQ-FR-25 | Display availability all branches | T4 | Cross-branch view | GET /inventory/central | `inventory.js`, `CentralInventoryPanel.jsx` | IS | — | — |
| REQ-FR-26 | Record payment histories | T4 | Persist payments | collection_payment + credit_history | `collector.js` | IS | Sales credit rows missing | On sale confirm |
| REQ-FR-27 | Consolidated payment history all branches | T4 | Cross-branch display | reports credit-history; role set broad | `reports.js`, `auth.js` | PI / CM vs Scope | Not OM-only | Restrict + clarify MS |
| REQ-FR-28 | Customer locations on map | T4 | Markers | Leaflet markers | `LeafletMap.jsx`, leaflet pages | IS | — | — |
| REQ-FR-29 | Recommended collection routes | T4 | Route display | OSRM collector; BM/OM straight polylines | `osrm.js`, `branchLeafletLayers.js` | PI | BM/OM not road-routed | Optional OSRM for BM |
| REQ-FR-30 | Sales territories & coverage | T4 | Territory viz | Org/Branch leaflet | `OrgLeafletPage.jsx` | IS | — | — |
| REQ-FR-31 | Collection performance summaries | T4 | Dashboard metrics | reports + BM analytics | `reports.js`, `branchManager.js` | PI | Some mock OM charts | Replace mocks |
| REQ-FR-32 | Sales performance summaries | T4 | Sales KPIs | reports sales | `reports.js` | PI | Same mock issue | Replace mocks |
| REQ-FR-33 | Inventory status across branches | T4 | Inventory KPIs | inventory dashboard + reports | `inventory.js` | IS | pendingRestocks=0 | Fix query |
| REQ-FR-34 | Delinquent customer reports | T4 | Delinquency | `/reports/delinquency` uses last_collection heuristic ≠ due_date overdue notifs | `reports.js`, `operationalNotifications.js` | PI | Inconsistent definition | Align to due_date |
| REQ-FR-35 | Insights incl. salaries/wages/opex | T4 | Payroll/opex analytics | No implementation; LIM excludes accounting | — | NI / CM vs LIM | Remove from FR or revise LIM |
| REQ-FR-36 | Notify daily schedules | T4 | Schedule notifs | notifyTodaysSchedules | `operationalNotifications.js` | IS | — | — |
| REQ-FR-37 | Inventory threshold notifs | T4 | Stock alerts | notifyStockThreshold / digest | same | IS | — | — |
| REQ-FR-38 | Notify OM overdues | T4 | Overdue digest | notifyOverdueAccounts | same | IS | — | — |
| REQ-FR-39 | Operational dashboard updates | T4 | Inbox updates | notifications API + inbox UI | `NotificationsInbox.jsx` | IS | In-app only | OK if MS doesn’t require SMS |

---

## Algorithm / mapping / offline / tech (selected)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| REQ-ALG-SAW-02 | Weights 40/30/30 | IV | Confirmed in code + sample run |
| REQ-ALG-SAW-05 | Haversine branch→customer cost | IS | Matches MS algorithm section |
| REQ-ALG-SAW-06 | ORS after ranking only | CM | OSRM used instead |
| REQ-ALG-SAW-08 | Exclude days criterion if all zero | PI | days_norm=0 but weight not renormalized |
| REQ-MAP-03 | Nominatim | NI | Repo search empty |
| REQ-MAP-04 | OpenRouteService | CM | OSRM |
| REQ-MAP-06 | No live GPS tracking | IS | Matches limitation (UI GPS prefs are cosmetic) |
| REQ-MAP-09 | PostGIS | NI | DECIMAL coords |
| REQ-OFF-01…05 | Offline portal + queue | NI | Table unused |
| REQ-TECH-03 | Python SAW | CM | Node implementation; FastAPI stub |
| REQ-NFR-07 | 15-min idle timeout | IS | IDLE_TTL_MS=15min |
| REQ-NFR-06 | Password encryption | IS | bcrypt |
| REQ-NFR-01/02 | 3s / 5s performance | UV | No load tests run |
| REQ-ROLE naming | Branch Head / Warehouse Personnel | CM | Code: branch_manager / inventory_staff |

---

## Extra features in code (not required by six-role ACM core, or beyond scope)

- Super Admin role and admin UI surfaces
- Credit investigations + Approval Center
- Customer purchase requests
- Email portal invitations (nodemailer)
- Territory multi-layer analytics overlays
- jsPDF credit-history downloads
- OSRM trip optimization for collectors
