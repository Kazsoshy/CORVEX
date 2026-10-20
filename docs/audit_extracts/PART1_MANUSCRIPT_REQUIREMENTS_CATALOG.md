# CORVEX Part 1 — Manuscript Requirements Catalog

**Audit type:** System-to-Manuscript Compliance Audit — Part 1 (Requirements Extraction)  
**Primary source:** `ACM Manuscript Paper - CORVEX.docx.pdf` (36 pages; identical to Cursor attachment `ACM_Manuscript_Paper_-_CORVEX.docx.pdf`)  
**Secondary source:** `CORVEX ACM - NO FIGURES AND TABLES/ACM Outline Paper - CORVEX.pdf` + `.docx` (18-page outline; overlaps intro–design; lacks full FR/NFR table body, prototypes detail, and all Development/Testing/Results/Conclusion body text)  
**Extraction method:** pdfplumber full-text + python-docx for outline DOCX  
**Rule:** Only claims present in the manuscript(s). Incomplete sections flagged. No invented requirements.

---

## 0. Source inventory

| ID | File | Pages / size | Role |
|---|---|---|---|
| SRC-01 | `C:\Users\ASUS\Downloads\ACM Manuscript Paper - CORVEX.docx.pdf` | 36 pp | **Authoritative full manuscript** |
| SRC-02 | Attachment copy of SRC-01 | 36 pp | Byte/text-identical to SRC-01 |
| SRC-03 | `...\CORVEX ACM - NO FIGURES AND TABLES\ACM Outline Paper - CORVEX.pdf` | 18 pp | Outline / abbreviated |
| SRC-04 | Same folder `.docx` | 519 paras, 0 extractable Word tables | Outline text; role-name variants useful |

**Citation convention:** `§section · p.N` refers to SRC-01 page numbers from pdfplumber.

---

## 1. Project title and description

| ID | Requirement / claim | Verbatim / paraphrase | Ref |
|---|---|---|---|
| REQ-TITLE-01 | Full project title | “CORVEX: A Mapping-Integrated Field Operations and Inventory Centralization System for Multi-Branch Enterprises” | Title · p.1 |
| REQ-DESC-01 | Client organization | System developed for Bethuel-Herminihildo (BH) Marketing, multi-branch distribution enterprise in Davao City, General Santos City, and Davao Oriental. | §1.1–1.2 · p.1–4 |
| REQ-DESC-02 | System form factor | “web-based and mobile-accessible information system” | §1.2 · p.4 |
| REQ-DESC-03 | Core capabilities | Supports map-based field operations, Inventory Centralization, customer payment verification, and business activity monitoring across geographically distributed branches. | §1.2 · p.4 |
| REQ-DESC-04 | Alignment claims | Aligns with UN SDG 9 and University of Mindanao ICT-enabled research thrust/agenda. | §1.2–1.3 · p.4 |
| REQ-DESC-05 | Methodology | Agile SDLC (planning, design, development, testing, deployment, review). | §2 Methods / Fig.1 · p.5–6 |

---

## 2. Problem statement and context

| ID | Claim | Detail | Ref |
|---|---|---|---|
| REQ-PROB-01 | Manual field ops | Collectors organize schedules from receipts/due dates; sales agents use written addresses, sketches, personal familiarity. | §1.1 · p.2 |
| REQ-PROB-02 | Paper-then-encode delay | Collection/sales recorded on paper then submitted for encoding → delayed/incomplete/inconsistent records. | §1.1 · p.2 |
| REQ-PROB-03 | Intermittent connectivity | Field personnel cannot always transmit immediately; must record manually then encode when online. | §1.1 · p.2 |
| REQ-PROB-04 | Independent branch inventory | Each branch maintains inventory independently; cross-branch visibility via phone/SMS/paper → outdated stock, duplicates, overselling. | §1.1 · p.2 |
| REQ-PROB-05 | Uncontrolled payment visibility | No controlled centralized company-wide customer payment history; credit verification requires manual coordination. | §1.1 · p.1–2 |
| REQ-PROB-06 | Non-standard collection priority | Collectors judge outstanding balance, days overdue, distance without standardized method → inconsistent schedules/routes. | §1.1 · p.2 |
| REQ-PROB-07 | Weak map/territory visibility | Collectors/sales agents struggle to identify adjacent customers/routes; Branch Heads/Operating Manager cannot visualize distribution/coverage. | §1.1 · p.2 |
| REQ-PROB-08 | Missing analytics | Without descriptive analytical insights, management struggles to monitor performance, credit exposure, branch issues. | §1.1 · p.3 |
| REQ-PROB-09 | Market gap vs commercial tools | Pepperi/Odoo/Badger Maps do not combine SAW prioritization + Maps API visualization + BH-tailored Inventory Centralization + restricted payment verification + unified dashboard. | Table 1 · p.3 |

---

## 3. Objectives

### 3.1 General objective

| ID | Statement | Ref |
|---|---|---|
| REQ-OBJ-01 | Develop CORVEX … for BH Marketing to improve field operations, inventory management, customer payment monitoring, and operational decision-making through a centralized EIS with map-based visualization. | §1.3.1 · p.4 |

### 3.2 Specific objectives

| ID | Statement (verbatim essence) | Ref |
|---|---|---|
| REQ-OBJ-02 | **1.3.2.1** Develop a map-based field operations module using **Leaflet.js** integrated with **SAW** that generates a prioritized daily collection list and corresponding route visualization for collectors. | §1.3.2.1 · p.4 |
| REQ-OBJ-03 | **1.3.2.2** Develop an **offline-capable Field Portal** using **React.js** so collectors and sales agents digitally record collection, sales, and field activities with **automatic synchronization** once connectivity returns. | §1.3.2.2 · p.4 |
| REQ-OBJ-04 | **1.3.2.3** Develop an **Inventory Centralization** module using **PostgreSQL** to maintain accurate/updated inventory across all branches, reducing delayed updates, duplicates, inaccurate stock, and overselling. | §1.3.2.3 · p.4 |
| REQ-OBJ-05 | **1.3.2.4** Develop a centralized customer payment monitoring module using PostgreSQL enabling **authorized management personnel** to verify company-wide payment records for timely credit verification and credit decisions. | §1.3.2.4 · p.4 |
| REQ-OBJ-06 | **1.3.2.5** Develop an Inventory and Sales Dashboard using React.js and PostgreSQL applying **descriptive analytics** to summarize collection, sales, inventory, customer payment, credit line records, and centralized branch records to support monitoring and decision-making. | §1.3.2.5 · p.4–5 |

---

## 4. Scope and limitations

### 4.1 In scope

| ID | Claim | Ref |
|---|---|---|
| REQ-SCOPE-01 | Four major functional components: (1) map-based field ops + SAW for collectors + sales territory scheduling; (2) offline-capable field transaction module; (3) inventory centralization + customer payment verification (**only Operating Manager** accesses consolidated payment records — see contradictions); (4) management dashboard with descriptive analytics incl. collection, sales, inventory, payment, branch performance, operating expense reports. | §1.4 · p.5 |
| REQ-SCOPE-02 | Six user roles (see REQ-ROLE-*). | §1.4 · p.5 |
| REQ-SCOPE-03 | Deployment intended at BH Marketing branches: Davao City, General Santos City, Davao Oriental; manages records from implementation period onward. | §1.4 · p.5 |
| REQ-SCOPE-04 | Open-source software + existing hardware infrastructure to minimize cost. | §1.4 · p.5 |

### 4.2 Out of scope / limitations

| ID | Claim | Ref |
|---|---|---|
| REQ-LIM-01 | Does **not** include accounting transactions, payroll, procurement management, taxation, or financial auditing. | §1.4 · p.5 |
| REQ-LIM-02 | Mapping limited to visualizing customer locations, territories, and routes from geocoded addresses via Leaflet.js + OpenStreetMap; **no** advanced GIS spatial analysis, continuous GPS tracking, or live location monitoring; uses **stored geographic coordinates**. | §1.4 · p.5 |
| REQ-LIM-03 | Designed specifically for BH Marketing; other orgs may need modifications. | §1.4 · p.5 |
| REQ-LIM-04 | Assumes authorized users provide accurate records, keep addresses updated, and have internet for sync; field module supports offline then sync. | §1.4 · p.5 |
| REQ-LIM-05 | Excludes commercial enterprise software, proprietary mapping services, and paid analytics platforms. | §1.4 · p.5 |
| REQ-LIM-06 | Table 1: no DSD execution, general warehouse routing, standalone CRM/lead platform; no real-time traffic-aware optimization; territories visualized but **manually defined by Branch Heads** (no auto territory-balancing); product table stores name/category/unit price only (no catalog/promo rules); **no external/open API**; restocking from suppliers handled outside system (procurement excluded). | Table 1 · p.3 |

---

## 5. Conceptual framework / IPO model

| ID | Claim | Ref |
|---|---|---|
| REQ-IPO-01 | Conceptual framework adopts **Input–Process–Output (IPO)** model (Figure 3). | §2.3.1 · p.13 |
| REQ-IPO-02 | **Input:** Collectors → payments/collections/commitments/balances/field reports; Sales Agents → sales/visits/prospects/territory activities; Warehouse Personnel → stock receipts/releases/transfers/adjustments/availability; Operating Manager → customers/branches/users/parameters/payment records; plus addresses/branch locations as geographic info. Validated/stored in centralized DB. | §2.3.1.1 · p.13 |
| REQ-IPO-03 | **Process:** SAW prioritization (balance, overdue days, distance); map-based visualization for sales; inventory & payment sync via PostgreSQL+PostGIS; RBAC; Leaflet+OSM visualization; validation for completeness/consistency/integrity. | §2.3.1.2 · p.13 |
| REQ-IPO-04 | **Output:** Prioritized collector schedules; sales map/territory views; synchronized inventory for warehouse; OM Operations Dashboard (collection, sales, inventory, payments, branch performance, trends) via dashboards, maps, reports, tables, charts, digital records. | §2.3.1.3 · p.13 |

---

## 6. System architecture and design claims

| ID | Claim | Ref |
|---|---|---|
| REQ-ARCH-01 | Three-tier architecture: Presentation, Application, Database layers. | §2.3.7 · p.31–32 |
| REQ-ARCH-02 | Supports online and offline field operations. | §2.3.7 · p.32 |
| REQ-ARCH-03 | **Presentation:** React.js Web Dashboard for “administrators, operations managers, and warehouse staff”; React.js Mobile Field Portal for sales agents and collectors; Leaflet+OSM; REST when online. | §2.3.7.1 · p.32 |
| REQ-ARCH-04 | **Application:** AuthZ/AuthN, user management, collection, sales, notifications, descriptive analytics, audit logging, **SAW Decision Support Engine**; Sales Agents do **not** use SAW. | §2.3.7.2 · p.32 |
| REQ-ARCH-05 | **Database:** Centralized PostgreSQL for users, branches, clients, products, branch inventory, transfers, sales, collections, credit history, field visits, SAW results, notifications, audit logs, performance summaries. | §2.3.7.3 · p.32 |
| REQ-ARCH-06 | **External services:** Leaflet.js + OpenStreetMap; browser local storage for offline field portal. | §2.3.7.4 · p.32 |
| REQ-ARCH-07 | Online: secure RESTful requests → business logic (SAW, inventory centralization, mapping, notifications) → PostgreSQL → real-time return. | §2.3.7.5 · p.32 |
| REQ-ARCH-08 | Offline: local storage of collections, sales, visits, digital receipts; auto-upload on reconnect; server validates and updates PostgreSQL. | §2.3.7.6 · p.32 |
| REQ-ARCH-09 | Design phase includes PostgreSQL DB, UI, workflows, RBAC, module interactions; Nominatim + Leaflet/OSM + OpenRouteService for maps/routes. | Phase 2 · p.6 |
| REQ-ARCH-10 | Use Case Diagram (Fig.5), ERD (Fig.6), Data Dictionary (Tables 15–42), Prototypes (Figs.8–16). | §2.3.4–2.3.8 · p.21–34 |

---

## 7. User roles and permissions

### 7.1 Canonical six roles (repeated in purpose/scope)

| ID | Exact role name (primary manuscript wording) | Responsibilities claimed | Ref |
|---|---|---|---|
| REQ-ROLE-01 | **Operating Manager** | Enterprise-wide monitor; dashboards/reports; verify company-wide customer payments; oversee inventory/sales/collections/performance; manage customers/branches/users; approve credit investigation requests. | §1.2, 2.2.1.1 · p.4,7 |
| REQ-ROLE-02 | **Branch Head** | Monitor field personnel; supervise branch ops; verify branch inventory; review branch reports; coordinate with OM; branch-level collection/sales/inventory/payment/staff/field supervision. | §1.2, 2.2.1.2 · p.4,7 |
| REQ-ROLE-03 | **Collector** | Receive SAW-prioritized daily assignments; record collections; update payment info; digital receipts; navigate via mapping; prioritize customers; view locations/routes; authorized payment info; collection history; sync to DB. | §1.2, 2.2.1.3 · p.4,7 |
| REQ-ROLE-04 | **Sales Agent** | Map visualization; canvass in assigned territories; record sales; submit field activity reports; view locations/routes; authorized account info; sync sales records. | §1.2, 2.2.1.4 · p.4,7 |
| REQ-ROLE-05 | **Warehouse Personnel** | Manage inventory records; stock movements/transfers/adjustments; product availability; synchronize inventory across branches; view restock history. | §1.2, 2.2.1.5 · p.4,7 |
| REQ-ROLE-06 | **Customer** | View own outstanding balance and payment history only. | §1.2, 2.2.1.6 · p.4,7 |

### 7.2 Role-name variants / extra labels in manuscript

| ID | Observation | Ref |
|---|---|---|
| REQ-ROLE-07 | §2.2.1 intro lists intended users as “Operating Manager, **Branch Manager**, Customer, Collector, Sales Agent, and **Inventory Staff**” (same section then uses Branch Head / Warehouse Personnel). | §2.2.1 · p.7 |
| REQ-ROLE-08 | Outline DOCX 2.2.1.2 uses “**Branch Manager**”; 2.2.1.5 uses “**Inventory Staff**”. | SRC-04 |
| REQ-ROLE-09 | Architecture mentions “**administrators**” as Web Dashboard users — not listed among the six roles. | §2.3.7.1 · p.32 |
| REQ-ROLE-10 | Prototype warehouse alert “propagates up to the **Branch Manager** and Operating Manager”. | Fig.12 text · p.34 |
| REQ-ROLE-11 | Roles table examples: “Operating Manager, Branch Head, Collector, Sales Agent, and Warehouse Personnel” (Customer role implied elsewhere). | Table 26 · p.25 |
| REQ-ROLE-12 | RBAC via Roles + Permissions + Role Permissions (`granted` flag). | Tables 26–28 · p.25–26 |
| REQ-ROLE-13 | Consolidated payment view restricted to Operating Manager (Table 1 / Scope); Branch Head also described as needing consolidated payment access for credit decisions (problem/context). | Table 1 · p.3; §1.1 · p.2; §1.4 · p.5 |

---

## 8. User requirements (UR)

| ID | Statement | Ref |
|---|---|---|
| REQ-UR-01 | OM needs consolidated collection/sales/inventory/payment/credit/field/staff/branch info; manage customers/branches; approve credit investigation requests. | 2.2.1.1 · p.7 |
| REQ-UR-02 | Branch Head needs branch-level collection/sales/inventory/payment/staff/field info to supervise and identify issues. | 2.2.1.2 · p.7 |
| REQ-UR-03 | Collector needs prioritize customers, locations/routes, authorized payment info, collection history, record collections, sync. | 2.2.1.3 · p.7 |
| REQ-UR-04 | Sales Agent needs customers/prospects in territories, locations/routes, authorized account info, record sales, field activity, sync. | 2.2.1.4 · p.7 |
| REQ-UR-05 | Warehouse Personnel / Inventory Staff needs stock movements/transfers/adjustments, current inventory/restock history, cross-branch availability, synchronized inventory. | 2.2.1.5 · p.7 |
| REQ-UR-06 | Customer needs payment history and outstanding balance. | 2.2.1.6 · p.7 |

---

## 9. Functional requirements (manuscript FR IDs)

| ID | Module | Manuscript FR | Shall… | Ref |
|---|---|---|---|---|
| REQ-FR-01 | User Authentication | FR-01 | Authenticate authorized users with username/password before access. | Table 4 · p.8 |
| REQ-FR-02 | User Authentication | FR-02 | Allow authenticated users to securely sign out. | Table 4 · p.8 |
| REQ-FR-03 | User Authentication | FR-03 | Deny access when invalid login credentials entered. | Table 4 · p.8 |
| REQ-FR-04 | User Account Mgmt | FR-04 | OM create accounts for Branch Heads, Collectors, Sales Agents, Warehouse Personnel; Customer views only own balance/payment history. | Table 4 · p.8 |
| REQ-FR-05 | User Account Mgmt | FR-05 | OM update user account information. | Table 4 · p.8 |
| REQ-FR-06 | User Account Mgmt | FR-06 | OM activate/deactivate user accounts. | Table 4 · p.8 |
| REQ-FR-07 | User Account Mgmt | FR-07 | Assign role-based access permissions by designated role. | Table 4 · p.8 |
| REQ-FR-08 | Profile | FR-08 | Users view personal profile information. | Table 4 · p.8 |
| REQ-FR-09 | Profile | FR-09 | Users update profile and account password. | Table 4 · p.8 |
| REQ-FR-10 | SAW | FR-10 | Retrieve customer records required for SAW computation. | Table 4 · p.8 |
| REQ-FR-11 | SAW | FR-11 | Normalize customer criteria values using SAW. | Table 4 · p.8 |
| REQ-FR-12 | SAW | FR-12 | Calculate weighted preference score of every customer. | Table 4 · p.8 |
| REQ-FR-13 | SAW | FR-13 | Rank customers by computed SAW scores. | Table 4 · p.8 |
| REQ-FR-14 | SAW | FR-14 | Generate daily prioritized collection schedule for Collectors. | Table 4 · p.8 |
| REQ-FR-15 | SAW / Sales map | FR-15 | Display customer locations and assigned service territories to support sales canvassing. | Table 4 · p.8 |
| REQ-FR-16 | Field Portal | FR-16 | Display prioritized collection schedule for Collectors and assigned customer locations/territories for Sales Agents. | Table 4 · p.8 |
| REQ-FR-17 | Field Portal | FR-17 | Display recommended travel routes using OpenRouteService. | Table 4 · p.8 |
| REQ-FR-18 | Field Portal | FR-18 | Allow Collectors to record collection transactions. | Table 4 · p.8 |
| REQ-FR-19 | Field Portal | FR-19 | Allow Sales Agents to record sales transactions. | Table 4 · p.8 |
| REQ-FR-20 | Field Portal | FR-20 | Allow users to submit field activity reports. | Table 4 · p.8 |
| REQ-FR-21 | Field Portal | FR-21 | Generate digital receipts for completed collection transactions. | Table 4 · p.8 |
| REQ-FR-22 | Inventory | FR-22 | Warehouse Personnel add inventory records. | Table 4 · p.9 |
| REQ-FR-23 | Inventory | FR-23 | Warehouse Personnel update inventory records. | Table 4 · p.9 |
| REQ-FR-24 | Inventory | FR-24 | Automatically synchronize inventory transactions and stock quantities across all branches. | Table 4 · p.9 |
| REQ-FR-25 | Inventory | FR-25 | Display current inventory availability for all branches. | Table 4 · p.9 |
| REQ-FR-26 | Credit History | FR-26 | Record customer payment histories. | Table 4 · p.9 |
| REQ-FR-27 | Credit History | FR-27 | Display consolidated customer payment history and outstanding balances across all branches. | Table 4 · p.9 |
| REQ-FR-28 | Map Ops | FR-28 | Display customer locations on interactive map. | Table 4 · p.9 |
| REQ-FR-29 | Map Ops | FR-29 | Display recommended collection routes. | Table 4 · p.9 |
| REQ-FR-30 | Map Ops | FR-30 | Display assigned sales territories and branch coverage. | Table 4 · p.9 |
| REQ-FR-31 | Dashboard | FR-31 | Display collection performance summaries. | Table 4 · p.9 |
| REQ-FR-32 | Dashboard | FR-32 | Display sales performance summaries. | Table 4 · p.9 |
| REQ-FR-33 | Dashboard | FR-33 | Display inventory status across branches. | Table 4 · p.9 |
| REQ-FR-34 | Dashboard | FR-34 | Display delinquent customer reports. | Table 4 · p.9 |
| REQ-FR-35 | Dashboard | FR-35 | Generate operational insights consolidating inventory, sales, collection, customer credit, **salaries and wages, operating expenses**, and branch performance. | Table 4 · p.9 |
| REQ-FR-36 | Notifications | FR-36 | Notify Collectors and Sales Agents of daily assigned schedules. | Table 4 · p.9 |
| REQ-FR-37 | Notifications | FR-37 | Notify Warehouse Personnel when inventory reaches predefined thresholds. | Table 4 · p.9 |
| REQ-FR-38 | Notifications | FR-38 | Notify Operating Manager of overdue customer accounts. | Table 4 · p.9 |
| REQ-FR-39 | Notifications | FR-39 | Notify authorized users of operational updates through the dashboard. | Table 4 · p.9 |

**Note:** SRC-03 outline PDF contains Table 4 header structure but not the complete FR-01…FR-39 prose body found in SRC-01.

---

## 10. Non-functional requirements

Manuscript Table 5 (layout-split IDs reconstructed as NFR-01…NFR-17):

| ID | Category | Manuscript | Shall… | Ref |
|---|---|---|---|---|
| REQ-NFR-01 | Performance | NFR-01 | Load dashboard pages and system modules within **3 seconds** under normal network conditions. | Table 5 · p.9 |
| REQ-NFR-02 | Performance | NFR-02 | Generate SAW customer prioritization within **5 seconds** after processing customer records. | Table 5 · p.9 |
| REQ-NFR-03 | Performance | NFR-03 | “[…] within an acceptable response time under normal network conditions.” (**incomplete sentence in manuscript**) | Table 5 · p.9 |
| REQ-NFR-04 | Security | NFR-04 | Require authenticated username/password before any module access. | Table 5 · p.9 |
| REQ-NFR-05 | Security | NFR-05 | Enforce RBAC so users only access modules for their roles. | Table 5 · p.9 |
| REQ-NFR-06 | Security | NFR-06 | Encrypt user passwords before storing in PostgreSQL. | Table 5 · p.9 |
| REQ-NFR-07 | Security | NFR-07 | Automatically terminate inactive sessions after **15 minutes**. | Table 5 · p.9 |
| REQ-NFR-08 | Usability | NFR-08 | Responsive/intuitive UI; first-time users complete core tasks with minimal guidance. | Table 5 · p.9 |
| REQ-NFR-09 | Usability | NFR-09 | Clear validation messages and user-friendly error notifications. | Table 5 · p.9 |
| REQ-NFR-10 | Reliability | NFR-10 | Maintain accuracy/integrity of operational records during normal operation. | Table 5 · p.9 |
| REQ-NFR-11 | Reliability | NFR-11 | Prevent data inconsistency during Inventory Centralization and customer transaction processing across branches. | Table 5 · p.9 |
| REQ-NFR-12 | Reliability | NFR-12 | Prevent duplicate inventory and customer payment records during concurrent transactions/sync. | Table 5 · p.9 |
| REQ-NFR-13 | Reliability | NFR-13 | Maintain consistent inventory and customer payment records across branches after synchronization. | Table 5 · p.9 |
| REQ-NFR-14 | Maintainability | NFR-14 | Modular components allowing future enhancements without affecting existing functions. | Table 5 · p.9 |
| REQ-NFR-15 | Compatibility | NFR-15 | Operate on Google Chrome, Microsoft Edge, Mozilla Firefox. | Table 5 · p.9 |
| REQ-NFR-16 | Compatibility | NFR-16 | Support desktop and mobile responsive layouts for OM, Branch Head, Collectors, Sales Agents, Warehouse Personnel. | Table 5 · p.9–10 |
| REQ-NFR-17 | Scalability | NFR-17 | Support additional branches, customers, inventory records, and users without significant performance degradation. | Table 5 · p.10 |

ISO 25010 / SUS: **not stated** as evaluation standards in extracted text (no “ISO 25010”, no “System Usability Scale”).

---

## 11. Hardware / software / technology stack

### 11.1 Software (Table 2)

| ID | Technology | Purpose claimed | Ref |
|---|---|---|---|
| REQ-TECH-01 | Visual Studio Code | IDE | Table 2 · p.7–8 |
| REQ-TECH-02 | React.js | Interactive/responsive web UI; Field Portal; dashboards | Table 2; Obj · p.4,7 |
| REQ-TECH-03 | Python | Implement SAW method for customer prioritization | Table 2 · p.7; Tech feasibility · p.10 |
| REQ-TECH-04 | Node.js and Express.js | Backend services and RESTful API | Table 2 · p.7; p.10 |
| REQ-TECH-05 | PostgreSQL | Primary RDBMS for accounts, customers, collections, sales, inventory, credit, branches, logs | Table 2 · p.7 |
| REQ-TECH-06 | PostGIS | Spatial extension: customer coords, branch locations, collection routes, sales territories | Table 2 · p.7–8 |
| REQ-TECH-07 | Leaflet.js | Interactive map visualization | Table 2 · p.8 |
| REQ-TECH-08 | OpenStreetMap | Base map provider | Table 2 · p.8 |
| REQ-TECH-09 | Nominatim | Geocode customer/branch addresses → coordinates | Table 2 · p.8 |
| REQ-TECH-10 | OpenRouteService | Calculate/display recommended travel routes | Table 2 · p.8 |
| REQ-TECH-11 | Recharts | Analytical charts/dashboard visualizations | Table 2 · p.8 |
| REQ-TECH-12 | Git & GitHub | Version control / collaboration | Table 2 · p.8 |
| REQ-TECH-13 | Open-source stack only (licensing cost elimination) | React, Node, Express, Python, PostgreSQL, PostGIS, Leaflet, OSM, Nominatim, ORS | Economic feasibility · p.11 |

### 11.2 Hardware (Table 3)

| ID | Item | Minimum claimed | Ref |
|---|---|---|---|
| REQ-HW-01 | Development computer | Windows 10/11 64-bit; Intel Core i5 11th gen or AMD Ryzen 5+; ≥8 GB RAM; ≥256 GB SSD | Table 3 · p.8 |
| REQ-HW-02 | Mobile device | Android 10+ with internet for collectors/sales agents | Table 3 · p.8 |
| REQ-HW-03 | GPS-enabled smartphone | Obtain current location of collectors/sales agents for route visualization and collection scheduling | Table 3 · p.8 |
| REQ-HW-04 | Internet | Minimum **10 Mbps** download/upload for sync, dashboard, cloud communication | Table 3 · p.8 |

### 11.3 Ops cost stack (deployment claims)

| ID | Claim | Ref |
|---|---|---|---|
| REQ-TECH-14 | Cloud hosting VPS/Cloud Server (~₱2,500/mo), domain, SSL, DB backup/storage, maintenance/support | Table 6 · p.11 |

Firebase: **not claimed**. PWA: **not claimed** as technology (no PWA requirement statement).

---

## 12. Database design claims

| ID | Claim | Ref |
|---|---|---|---|
| REQ-DB-01 | Centralized PostgreSQL + PostGIS for operational + spatial data. | Multiple · p.7–13,32 |
| REQ-DB-02 | Data dictionary tables include at least: Audit Logs, Branches, Customers, Suppliers, Territories, Users, Roles, Permissions, Role Permissions, Sales Invoices, Sales Invoice Items, Field Visits, Collection Payment, Digital Receipts, Credit History, Branch Inventory, Stock Movements, Inventory Transfers, Restocks, SAW Results, Notifications, Field Activity Reports, Offline Sync Queue (Tables 15–42). | §2.3.6 · p.21–31 |
| REQ-DB-03 | SAW input fields: `customer_activity.outstanding_balance`; `sales_invoices.due_date` + status; `customers.latitude/longitude`; `branches.latitude/longitude`. | §2.3.2.1 / Table 8 · p.14 |
| REQ-DB-04 | Eligibility uses `customers.status = Active`, `outstanding_balance > 0`, `account_manager_id` matches Collector, valid coords for customer and branch. | §2.3.2.2 · p.14 |
| REQ-DB-05 | Invoice status enum: Unpaid, Partial, Paid. | Table 29 · p.26 |
| REQ-DB-06 | Inventory transfer statuses include Pending Approval, Submitted, Approved, Completed, Rejected. | Table 37 · p.29 |
| REQ-DB-07 | Stock movement types: Sale Deduction, Restock, Transfer In/Out, Stock Count Adjustment, Damage Write-Off. | Table 36 · p.29 |
| REQ-DB-08 | Offline Sync Queue stores JSON payload, sync_status Pending/Synced/Failed, device_id, table_name, record_reference. | Table 42 · p.31 |
| REQ-DB-09 | Branch inventory has `reorder_level` and status. | Table 35 · p.28 |
| REQ-DB-10 | Product catalog limited to name, category, unit price (Table 1). | Table 1 · p.3 |

---

## 13. Algorithms — SAW

| ID | Claim | Ref |
|---|---|---|---|
| REQ-ALG-SAW-01 | SAW is primary decision-support for collector prioritization (MCDM). | §2.3.2 · p.13 |
| REQ-ALG-SAW-02 | Criteria & weights: **Outstanding Balance 40%**, **Days Overdue 30%**, **Geographic Distance 30%**. | Table 1 · p.3; Table 9 · p.15 |
| REQ-ALG-SAW-03 | Outstanding Balance = benefit criterion (higher → higher priority); source `customer_activity.outstanding_balance`. | §2.3.2 · p.14–16 |
| REQ-ALG-SAW-04 | Days Overdue = benefit; from earliest Unpaid/Partial invoice due_date vs current date; negative → 0; empty due_date unused; Paid excluded. | §2.3.2.2 · p.14–15 |
| REQ-ALG-SAW-05 | Geographic Distance = **cost** criterion; **Haversine** straight-line between **assigned branch** and **customer** coordinates (not road distance). | §2.3.2.2 · p.14–15 |
| REQ-ALG-SAW-06 | OpenRouteService used **after** ranking for route visualization/sequencing; **does not modify SAW score**. | §2.3.2.2 · p.15; Table 1 · p.3 |
| REQ-ALG-SAW-07 | Tie-break: lower `customer_id` → higher priority. | §2.3.2.2 · p.15 |
| REQ-ALG-SAW-08 | If all Days Overdue are zero, exclude that criterion and use remaining. Invalid zero-distance records excluded and recorded. | §2.3.2.2 · p.15 |
| REQ-ALG-SAW-09 | Normalization 0–1; benefit vs cost formulas (Eq. 2–3); preference score Eq. 4 with weights 0.40/0.30/0.30. | §2.3.2.6–2.3.2.7 · p.16–17 |
| REQ-ALG-SAW-10 | Final ranking highest→lowest score; push to Collector Field Portal; then route generation (“Collection Dispatch Engine”). | §2.3.2.8–2.3.2.9 · p.18 |
| REQ-ALG-SAW-11 | Sample matrix/ranking provided (Tables 10–12); e.g. Customer C score 0.958 rank 1. | p.16–18 |
| REQ-ALG-SAW-12 | Descriptive analytics does **not** use SAW scores as input. | §2.3.2.9 · p.18 |
| REQ-ALG-SAW-13 | Sales Agents do **not** use SAW engine. | §2.3.7.2 · p.32; Fig.9 · p.33 |

**Internal tension:** Early problem statement says collectors consider distance from **collector’s current location** (§1.1 · p.2; Phase 2 · p.6), but SAW distance is **branch→customer Haversine** (§2.3.2 · p.14–15). GPS smartphone is still required (REQ-HW-03).

---

## 14. Mapping claims

| ID | Claim | Ref |
|---|---|---|---|
| REQ-MAP-01 | Leaflet.js for interactive maps of customers, territories, activities. | Obj, Table 2, Arch · p.4–8,32 |
| REQ-MAP-02 | OpenStreetMap as base map. | §1.4, Table 2 · p.5,8 |
| REQ-MAP-03 | Nominatim geocodes customer/branch addresses. | Phase 2/3, Table 2 · p.6,8 |
| REQ-MAP-04 | OpenRouteService sequences SAW-ranked list from stored coordinates; recommended travel routes for collectors (and travel routes for sales as FR-17). | Table 1, FR-17 · p.3,8 |
| REQ-MAP-05 | No real-time traffic-aware optimization (unlike Badger Maps comparison). | Table 1 · p.3 |
| REQ-MAP-06 | No continuous GPS tracking / live location monitoring; stored coordinates for planning. | §1.4 · p.5 |
| REQ-MAP-07 | Territories visualized; manually defined by Branch Heads. | Table 1 · p.3 |
| REQ-MAP-08 | OM org-wide Leaflet+OSM map: three branches, coverage, territory boundaries; filters; Delinquency Heatmap, Profitability Analysis, Territory Analysis sub-views. | Fig.14 · p.34 |
| REQ-MAP-09 | PostGIS stores/processes geographic info (customer coords, branch location, routes, territories). | Table 2 · p.7–8 |

---

## 15. Offline capabilities

| ID | Claim | Ref |
|---|---|---|---|
| REQ-OFF-01 | Offline-capable Field Portal (React) for collectors/sales agents. | REQ-OBJ-03 · p.4 |
| REQ-OFF-02 | Record collection/sales/field activities offline; auto-sync when connectivity available. | Obj, Scope · p.4–5 |
| REQ-OFF-03 | Browser/device **local storage** temporarily stores transactions. | §2.3.7.4–6 · p.32 |
| REQ-OFF-04 | Offline sync covers collections, sales activities, customer visits, digital receipts. | §2.3.7.6 · p.32 |
| REQ-OFF-05 | `offline_sync_queue` + field activity `sync_status` Pending/Synced/Failed. | Tables 41–42 · p.31 |
| REQ-OFF-06 | Digital receipts available in offline-capable Field Portal. | Table 33 · p.28 |

---

## 16. Inventory centralization

| ID | Claim | Ref |
|---|---|---|---|
| REQ-INV-01 | Centralized inventory module via PostgreSQL; sync stock across branches. | Obj 1.3.2.3; FR-24 · p.4,9 |
| REQ-INV-02 | Warehouse can add/update inventory; view availability all branches. | FR-22–25 · p.9 |
| REQ-INV-03 | Stock movements, transfers, adjustments, restocks; transfer approval workflow. | Data dict · p.28–30 |
| REQ-INV-04 | Synchronizes via “direct PostgreSQL updates” (not Odoo-style push/pull rules). | Table 1 · p.3 |
| REQ-INV-05 | Reorder thresholds; statuses Sufficient / Low Stock / Critical / Out of Stock; auto-flag at/below reorder; zero stock critical alert to Branch Manager + OM. | Fig.12 · p.33–34 |
| REQ-INV-06 | Inventory analysis via stock-in/out/transfer/adjustment rules; branch comparison. | §2.3.3.2.3 · p.19 |
| REQ-INV-07 | Procurement/purchasing management excluded; supplier restock recording still in data model (Suppliers/Restocks tables). | Table 1 · p.3; Tables 23/38 · p.25,30 |

---

## 17. Payment verification / credit

| ID | Claim | Ref |
|---|---|---|---|
| REQ-PAY-01 | Centralized customer payment monitoring for timely credit verification. | Obj 1.3.2.4 · p.4 |
| REQ-PAY-02 | Scope: “allowing **only the Operating Manager** to access consolidated customer payment records”. | §1.4 · p.5 |
| REQ-PAY-03 | Table 1: “restricts consolidated payment view to Operating Manager.” | Table 1 · p.3 |
| REQ-PAY-04 | Collectors may access “authorized customer payment information” (not full company-wide consolidation). | UR / role · p.4,7 |
| REQ-PAY-05 | Record payment histories; display consolidated history/balances across branches (FR-26/27) — authorization boundary not restated in FR-27. | Table 4 · p.9 |
| REQ-PAY-06 | Collection log: amount, method (cash, check, bank transfer, mobile), proof photo, optional partial; validate vs outstanding; digital receipt; deduct balance in real time. | Fig.11 · p.33 |
| REQ-PAY-07 | Credit history stores previous/payment/remaining balances, Paid/Partial/Overdue. | Table 34 · p.28 |
| REQ-PAY-08 | Account detail: outstanding, days overdue, delinquency, payment history; overdue highlighted red; **blacklisted** flag by branch manager blocks new arrangements without manager approval. | Fig.13 · p.34 |
| REQ-PAY-09 | OM notified of overdue accounts (FR-38). | Table 4 · p.9 |

---

## 18. Dashboard / analytics

| ID | Claim | Ref |
|---|---|---|---|
| REQ-DASH-01 | Inventory and Sales Dashboard with descriptive analytics (Obj 1.3.2.5). | p.4–5 |
| REQ-DASH-02 | FR-31–35: collection/sales/inventory summaries; delinquent reports; insights incl. credit, salaries/wages, operating expenses, branch performance. | Table 4 · p.9 |
| REQ-DASH-03 | Module aggregates by branch/date/product/customer; totals, counts, percentages, comparisons, trends. | §2.3.3 · p.18–19 |
| REQ-DASH-04 | Analyses: Collection (Eq.5), Sales (Eq.6–7 growth), Inventory, Payment/Credit (Eq.8), Branch-level comparison (Table 14 sample). | §2.3.3.2 · p.19–20 |
| REQ-DASH-05 | Executive Dashboard (Fig.4): KPIs, charts, tables, trends for collection/sales/inventory/balances/status. | §2.3.3.3 · p.20 |
| REQ-DASH-06 | Interpretation supports review but “does not automatically determine the action to take”. | §2.3.3.4 · p.21 |
| REQ-DASH-07 | OM dashboard prototype: enterprise KPI cards, branch comparison bar, revenue donut, weekly collection/sales trends, top/bottom branches, live critical alerts; real-time from aggregated data. | Fig.15 · p.34 |
| REQ-DASH-08 | Branch performance tabs: Overview / Comparison / Trends (radar of five KPI dimensions, delinquency trend); branch color codes GS green, Davao City blue, Davao Oriental red. | Fig.16 · p.34 |
| REQ-DASH-09 | Collector Field Portal dashboard: accounts assigned, amounts collected, pending/completed visits, incident reports, route progress bar updating in real time. | Fig.10 · p.33 |
| REQ-DASH-10 | Recharts for analytical visualizations. | Table 2 · p.8 |

---

## 19. Notifications

| ID | Claim | Ref |
|---|---|---|---|
| REQ-NOTIF-01 | FR-36: notify Collectors & Sales Agents of daily assigned schedules. | Table 4 · p.9 |
| REQ-NOTIF-02 | FR-37: notify Warehouse when inventory hits predefined thresholds. | Table 4 · p.9 |
| REQ-NOTIF-03 | FR-38: notify OM of overdue customer accounts. | Table 4 · p.9 |
| REQ-NOTIF-04 | FR-39: notify authorized users of operational updates via dashboard. | Table 4 · p.9 |
| REQ-NOTIF-05 | Notifications table: title, category (inventory alerts, account activities, etc.), message, Read/Unread; covers collection, inventory, sales scheduling, credit verification, transfer, sync events. | Table 40 · p.30 |
| REQ-NOTIF-06 | Dedicated Notification Testing subsection planned (§2.5.11). | §2.5.11 · p.35 |

---

## 20. Module descriptions and workflows

| ID | Module / workflow | Claims | Ref |
|---|---|---|---|
| REQ-MOD-01 | Map-based field operations | Customer locations, territories, routes; SAW for collectors; sales scheduling in designated locations. | Scope · p.5 |
| REQ-MOD-02 | Offline field transaction | Record collection/sales offline + sync. | Scope · p.5 |
| REQ-MOD-03 | Inventory centralization + payment verification | Updated inventory; OM-only consolidated payments (per scope). | Scope · p.5 |
| REQ-MOD-04 | Management / Operations Dashboard | Descriptive analytics consolidation. | Scope · p.5 |
| REQ-MOD-05 | Customer Prioritization / Collection Dispatch Engine | SAW pipeline → priority list → ORS route. | §2.3.2 · p.13–18 |
| REQ-MOD-06 | Descriptive Analytics Module | Separate from SAW; management analysis. | §2.3.3 · p.18–21 |
| REQ-MOD-07 | User authentication & account management | FR-01–07. | Table 4 · p.8 |
| REQ-MOD-08 | Notification Module | FR-36–39. | Table 4 · p.9 |
| REQ-MOD-09 | Collector Today’s Route | SAW list; View account; Map View; Route Summary. | Fig.8 · p.33 |
| REQ-MOD-10 | Sales Agent Today’s Schedule | Visits Pending/Completed/Rescheduled; no SAW. | Fig.9 · p.33 |
| REQ-MOD-11 | Collection Log | Payment capture + receipt + balance update. | Fig.11 · p.33 |
| REQ-MOD-12 | Inventory Transfers approval workflow | submit → approve → complete/reject. | Table 37 · p.29 |
| REQ-MOD-13 | Credit investigation approval | OM approves credit investigation requests. | UR OM · p.7 |
| REQ-MOD-14 | Field visits | Collection visits may be generated from SAW; sales visits from territories/activities; statuses Pending/Completed. | Table 31 · p.27 |

---

## 21. Testing / evaluation procedures

| ID | Claim | Status in manuscript | Ref |
|---|---|---|---|
| REQ-TEST-01 | Phase 4: functional, integration, usability, performance, UAT. | Described at high level | Phase 4 · p.6 |
| REQ-TEST-02 | Validate SAW ranking correctness; map location/route accuracy; inventory centralization; payment verification; dashboard; offline sync. | High-level | Phase 4 · p.6 |
| REQ-TEST-03 | Planned subsections: Hardware Compatibility; Web Browser (NFR); Internet Connectivity; Mobile Browser; Speed Performance; GTmetrix; Data Visualization; User Testing (based on FRs); SAW Testing; Descriptive Analytics Testing; Software Testing; Notification Testing; **2.5.12 missing title**; Alpha; Beta; UAT. | **Headings only — body empty** | §2.5 · p.35 |
| REQ-TEST-04 | Results subsections 3.1–3.9 listed (hardware desktop/mobile, browser, connectivity, mobile browser performance, page speed, software, alpha, beta). | **Headings only — body empty** | §3 · p.35 |
| REQ-TEST-05 | Implementation/Deployment/UAT sections 2.6–2.8 / “2.5 Implementation” numbering anomaly. | **Headings only** | p.35 |
| REQ-TEST-06 | Conclusion & Recommendations 4.1–4.2.3. | **Headings only** | p.35 |
| REQ-TEST-07 | Development §2.4 / Table 43 Sprint. | **Essentially empty** | p.35 |
| REQ-TEST-08 | No ISO 25010 / SUS instrument described in extracted text. | Absent | — |

---

## 22. Expected outputs / benefits

| ID | Claim | Ref |
|---|---|---|---|
| REQ-OUT-01 | Reduce manual processes; improve accuracy/availability of info; strengthen inter-branch coordination; support managerial decisions. | Motivation · p.4 |
| REQ-OUT-02 | Tangible/intangible benefits Table 7: faster SAW schedules; better visit planning; faster inventory verification; reduced cross-branch verification time; less paper; faster credit verification; improved visibility; standardized prioritization; inventory accuracy; fewer oversells; productivity. | Table 7 · p.12 |
| REQ-OUT-03 | Collector prioritized schedules + routes; sales map support; warehouse synced stock; OM dashboard outputs (IPO). | §2.3.1.3 · p.13 |
| REQ-OUT-04 | Prototypes illustrate expected UI behaviors (real-time updates, alerts, heatmaps, etc.). | §2.3.8 · p.33–34 |

---

## 23. Feasibility claims (supporting, not product FRs)

| ID | Claim | Ref |
|---|---|---|---|
| REQ-FEAS-01 | Operationally feasible — digitizes existing roles without major role redesign. | §2.2.4.1 · p.10 |
| REQ-FEAS-02 | Technically feasible with listed open-source stack + existing BH hardware. | §2.2.4.2 · p.10 |
| REQ-FEAS-03 | Economically feasible; est. development ~₱96,500; monthly ops ~₱6,375. | Table 6 · p.11 |
| REQ-FEAS-04 | Schedule feasible within Agile/capstone timeline (Gantt Fig.2). | §2.2.4.4 · p.12 |

---

## 24. Contradictions within the manuscript

| ID | Contradiction | Evidence |
|---|---|---|
| CONTRA-01 | **Branch Head vs Branch Manager** vs **Warehouse Personnel vs Inventory Staff** | Purpose/Roles table vs §2.2.1 intro / DOCX UR wording / Fig.12 alert text |
| CONTRA-02 | **Who may see consolidated payments:** Scope/Table 1 say **only OM**; problem statement says Branch Head + OM need consolidated payment/credit info for credit decisions; FR-27 has no role restriction. | §1.1 p.2; §1.4 p.5; Table 1 p.3; FR-27 p.9 |
| CONTRA-03 | **Distance basis for SAW:** “collector’s current location” (intro/design phase) vs **branch→customer Haversine** (SAW rules). | p.2,6 vs p.14–15 |
| CONTRA-04 | **GPS required** for current location vs limitation **no live GPS tracking** / stored coords; SAW does not use live collector GPS. | Table 3 p.8 vs §1.4 p.5 vs SAW p.14–15 |
| CONTRA-05 | **FR-35 includes salaries/wages & operating expenses** vs **LIM excludes accounting/payroll**. | FR-35 p.9 vs §1.4 p.5 |
| CONTRA-06 | **Procurement excluded** vs **Suppliers + Restocks** tables and warehouse restock workflow. | Table 1 p.3 vs Tables 23/38 |
| CONTRA-07 | Architecture Web Dashboard users include “**administrators**” not in six-role list. | §2.3.7.1 p.32 vs §1.2 p.4 |
| CONTRA-08 | IPO Input says “**four** user groups” (Collector, Sales, Warehouse, OM) — omits Branch Head and Customer as input actors. | §2.3.1.1 p.13 |
| CONTRA-09 | Section numbering: “**2.5 Implementation**” appears after “2.5.15 UAT” then “2.6.1 Frontend…” | p.35 |
| CONTRA-10 | Outline (SRC-03/04) vs full manuscript (SRC-01): outline lacks complete FR/NFR bodies, testing/results/conclusion content, and several prototype/DB eligibility details. | SRC comparison |

---

## 25. Incomplete / missing sections

| ID | Section | Completeness |
|---|---|---|
| INC-01 | §2.4 Development / Table 43 Sprint | Heading only |
| INC-02 | §2.5 Testing (2.5.1–2.5.15) | Headings only; **2.5.12 title missing** |
| INC-03 | §2.6 Implementation / 2.7 Deployment / 2.8 User Acceptance | Headings only; numbering collision with 2.5 |
| INC-04 | §3 Results and Discussion (3.1–3.9) | Headings only — no measured results |
| INC-05 | §4 Conclusion and Recommendation (4.1–4.2.3) | Headings only |
| INC-06 | NFR-03 | Incomplete sentence (“within an acceptable response time…”) — missing measurable target |
| INC-07 | Use Case Diagram (Fig.5) / ERD (Fig.6) / Conceptual Framework (Fig.3) / Architecture (Fig.7) | Figures present in SRC-01 but **textual use-case enumeration not written out** (diagram-only) |
| INC-08 | SRC-03 “NO FIGURES AND TABLES” outline | Stops before Development/Testing/Results/Conclusion; weaker FR/NFR extractability |
| INC-09 | Expected Outputs as a dedicated chapter section | Not a labeled section; benefits scattered (Table 7, IPO outputs, objectives) |
| INC-10 | Explicit ISO 25010 / SUS / formal instrument metrics | Not found in extracted text |

---

## 26. ID index (quick reference)

| Prefix | Count (approx.) | Meaning |
|---|---|---|
| REQ-TITLE / DESC | 6 | Title & description |
| REQ-PROB | 9 | Problem/context |
| REQ-OBJ | 6 | Objectives |
| REQ-SCOPE / LIM | 10 | Scope & limitations |
| REQ-IPO | 4 | Conceptual IPO |
| REQ-ARCH | 10 | Architecture |
| REQ-ROLE | 13 | Roles (incl. variants) |
| REQ-UR | 6 | User requirements |
| REQ-FR | 39 | Functional (maps to manuscript FR-01…39) |
| REQ-NFR | 17 | Non-functional |
| REQ-TECH / HW | 18 | Stack & hardware |
| REQ-DB | 10 | Database claims |
| REQ-ALG-SAW | 13 | SAW algorithm |
| REQ-MAP | 9 | Mapping |
| REQ-OFF | 6 | Offline |
| REQ-INV | 7 | Inventory |
| REQ-PAY | 9 | Payment/credit |
| REQ-DASH | 10 | Dashboard/analytics |
| REQ-NOTIF | 6 | Notifications |
| REQ-MOD | 14 | Modules/workflows |
| REQ-TEST | 8 | Testing claims |
| REQ-OUT | 4 | Expected outputs |
| REQ-FEAS | 4 | Feasibility |
| CONTRA | 10 | Internal contradictions |
| INC | 10 | Incomplete/missing |

---

## 27. Recommended primary source for Part 2 (system compliance)

Use **SRC-01** (`ACM Manuscript Paper - CORVEX.docx.pdf`, 36 pages) as the compliance baseline. Treat SRC-03/04 as secondary for wording variants (especially Branch Manager / Inventory Staff). Treat empty §2.4–§4 headings as **not yet specifying measurable acceptance criteria** beyond Phase 4 high-level testing language and Tables 4–5.
