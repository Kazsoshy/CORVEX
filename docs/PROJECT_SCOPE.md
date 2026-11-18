# CORVEX — Approved project scope

**Source rule:** Only requirements present in the manuscript catalog. Do not treat optional ideas, competitor features, or agent suggestions as approved.

**Primary source:** [`audit_extracts/PART1_MANUSCRIPT_REQUIREMENTS_CATALOG.md`](audit_extracts/PART1_MANUSCRIPT_REQUIREMENTS_CATALOG.md)  
**Compliance notes:** [`audit_extracts/PART2_REQUIREMENT_TRACEABILITY_MATRIX.md`](audit_extracts/PART2_REQUIREMENT_TRACEABILITY_MATRIX.md)

**Title:** CORVEX: A Mapping-Integrated Field Operations and Inventory Centralization System for Multi-Branch Enterprises  
**Client context:** Bethuel-Herminihildo (BH) Marketing — Davao City, General Santos City, Davao Oriental.

---

## 1. Approved system objectives

| ID         | Objective                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-OBJ-01 | Centralized EIS with map-based visualization to improve field operations, inventory management, customer payment monitoring, and operational decision-making for BH Marketing. |
| REQ-OBJ-02 | Map-based field operations with Leaflet + **SAW** prioritized daily collection list and route visualization for collectors.                                                    |
| REQ-OBJ-03 | Offline-capable Field Portal (React) for collectors/sales agents with digital recording and auto-sync when online.                                                             |
| REQ-OBJ-04 | Inventory Centralization (PostgreSQL) for accurate multi-branch stock.                                                                                                         |
| REQ-OBJ-05 | Centralized customer payment monitoring for **authorized management** credit verification/decisions.                                                                           |
| REQ-OBJ-06 | Inventory and Sales Dashboard with **descriptive analytics** (collection, sales, inventory, payments, credit, branch records).                                                 |

---

## 2. Approved user roles

Manuscript six roles:

| ID          | Role                | Essence                                                                                          |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| REQ-ROLE-01 | Operating Manager   | Enterprise-wide monitoring, payment verification, users/branches, credit investigation approvals |
| REQ-ROLE-02 | Branch Head         | Branch supervision, field personnel, branch inventory/reports                                    |
| REQ-ROLE-03 | Collector           | SAW assignments, collections, receipts, maps/routes, sync                                        |
| REQ-ROLE-04 | Sales Agent         | Territory canvassing, sales recording, FARs, sync                                                |
| REQ-ROLE-05 | Warehouse Personnel | Stock movements, transfers, availability, restock history                                        |
| REQ-ROLE-06 | Customer            | Own balance and payment history only                                                             |

**Implementation aliases (not new approved roles):** code may use Branch Manager (`branch_manager`), Inventory Staff (`inventory_staff`), Sales Staff (`sales_staff`).  
**Super Admin:** present in code; **not** one of the six manuscript roles — do not expand without authorization.

---

## 3. Approved modules

1. Map-based field operations + SAW collection prioritization + sales territory scheduling
2. Offline-capable field transaction module
3. Inventory centralization + customer payment verification
4. Management dashboard with descriptive analytics

Deployment intent: BH Marketing branches listed above; open-source stack on existing hardware (REQ-SCOPE-03/04).

---

## 4. Approved business workflows

- Authenticate / sign out / profile; OM account lifecycle and RBAC assignment (FR-01…09)
- SAW retrieve → normalize → score → rank → daily collector schedule (FR-10…14)
- Field portal: schedules, routes, record collection/sales, FARs, digital receipts (FR-16…21)
- Inventory add/update, cross-branch sync/visibility (FR-22…25)
- Payment history and consolidated verification for authorized management (FR-26…27)
- Maps: customer locations, routes, territories (FR-28…30)
- Descriptive dashboards: collection, sales, inventory, delinquency (FR-31…34)
- Operational notifications (FR-36…39)

SAW weights (approved): **40% outstanding balance**, **30% days overdue**, **30% Haversine distance** (branch→customer). Sales agents do **not** use SAW.

---

## 5. Approved functional requirements (summary)

| IDs      | Area                                                      |
| -------- | --------------------------------------------------------- |
| FR-01…03 | Authentication                                            |
| FR-04…07 | User account management / RBAC                            |
| FR-08…09 | Profile                                                   |
| FR-10…15 | SAW / territories display                                 |
| FR-16…21 | Field portal transactions and receipts                    |
| FR-22…25 | Inventory centralization                                  |
| FR-26…27 | Payment history / consolidated verification               |
| FR-28…30 | Mapping displays                                          |
| FR-31…34 | Descriptive performance / inventory / delinquency reports |
| FR-36…39 | Notifications                                             |

Full prose: PART1 §9. Cite IDs in designs and PRs.

---

## 6. Approved non-functional requirements

| ID        | Shall…                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| NFR-01    | Dashboard/modules load within ~3s under normal network                                                                       |
| NFR-02    | SAW prioritization within ~5s after processing records                                                                       |
| NFR-03    | Incomplete in manuscript — do not invent a metric                                                                            |
| NFR-04…07 | Auth required; RBAC; hashed passwords; 15-minute idle timeout                                                                |
| NFR-08…09 | Usable UI; clear validation/errors                                                                                           |
| NFR-10…13 | Record integrity; no inconsistent multi-branch inventory/payments; no duplicate inventory/payment records on concurrent sync |
| NFR-14    | Modular maintainability                                                                                                      |
| NFR-15…16 | Chrome/Edge/Firefox; responsive desktop/mobile for field/management roles                                                    |
| NFR-17    | Scale branches/customers/inventory/users without major degradation                                                           |

---

## 7. Explicit exclusions and limitations

| ID                   | Exclusion                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-LIM-01           | No accounting transactions, payroll, procurement, taxation, or financial auditing                                                                                                                                                            |
| REQ-LIM-02           | No advanced GIS spatial analysis, continuous GPS tracking, or live location monitoring                                                                                                                                                       |
| REQ-LIM-05 / Table 1 | No commercial enterprise suites, proprietary mapping, paid analytics platforms as required stack                                                                                                                                             |
| Table 1              | No DSD execution platform, general warehouse routing product, standalone CRM/lead platform; no real-time traffic-aware routing; territories **manually** defined; no external/open public API product; restocking/procurement outside system |
| REQ-FR-35            | Manuscript asks salaries/wages/opex insights but LIM excludes accounting → **treat FR-35 as out of scope** until manuscript is formally revised                                                                                              |
| —                    | Do not add unapproved external integrations, extra approval pyramids, or new enterprise modules “for completeness”                                                                                                                           |

**Technology drift (document, don’t fork):** manuscript lists OpenRouteService, Nominatim, PostGIS, Python SAW; implementation primarily uses **Node SAW + OSRM + Leaflet/OSM**. Do not introduce a second parallel stack without approval.

---

## 8. How agents should use this document

- In scope + missing → implement minimally after search-before-create.
- In scope + exists → reuse/extend.
- Out of scope → report suggestion only.
- Unclear → ask; never invent FRs.
