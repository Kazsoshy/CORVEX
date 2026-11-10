# CORVEX Enterprise System

**CORVEX: A Mapping-Integrated Field Operations and Inventory Centralization System for Multi-Branch Enterprises**

CORVEX is a multi-branch Enterprise Information System (EIS) developed for **Bethuel-Herminihildo (BH) Marketing**, addressing field operational scheduling, cross-branch inventory centralization, payment verification, and descriptive analytics across branches in **Davao City**, **General Santos City**, and **Davao Oriental**.

---

## 1. System Architecture

The system is structured as a modern, decoupled three-tier enterprise web application:

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                     │
│  React 18 + Vite + Tailwind CSS + Leaflet.js Maps + IndexedDB│
│  7 Role Portals: Operating Manager, Branch Head, Collector,  │
│  Sales Agent, Warehouse Personnel, Customer, Super Admin    │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / REST API + Offline Queue
┌──────────────────────────────▼──────────────────────────────┐
│                      APPLICATION LAYER                      │
│  Node.js (ES Modules) + Express 5.2                         │
│  - SAW Priority Engine (40% Balance, 30% Overdue, 30% Dist) │
│  - OSRM Road Routing & Traveling Sequence Generator         │
│  - Real-time Threat Inspector (SQLi, Traversal, XSS, Brute) │
│  - Background Operational Sweeps & Multi-Branch Auditing    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Node-postgres Connection Pool
┌──────────────────────────────▼──────────────────────────────┐
│                        DATABASE LAYER                       │
│  PostgreSQL with 60 Automated Schema Migrations             │
│  - Inter-branch inventory isolation with central rollups    │
│  - Customer credit history, investigations & digital receipts│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Capabilities

1. **Map-Based Field Operations & SAW Collection Prioritization**:
   - Computes daily visit priority using **Simple Additive Weighting (SAW)**:
     - 40% Outstanding Balance (Benefit criterion)
     - 30% Days Overdue (Benefit criterion)
     - 30% Haversine Distance from Branch Depot (Cost criterion)
   - Visualizes customer pins and turn-by-turn road routes using **Leaflet.js**, **OpenStreetMap**, and **OSRM**.
2. **Offline-Capable Field Operations**:
   - Collectors and sales agents can record payments, sales visits, and field reports without active cellular connectivity using client **IndexedDB**.
   - Automatically synchronizes queued transactions upon network reconnection to `/api/sync/queue`.
3. **Multi-Branch Inventory Centralization**:
   - Unified cross-branch visibility preventing overselling and phantom inventory.
   - Enforces non-negative stock constraints (`043_branch_inventory_nonnegative.sql`), stock transfer approvals, physical count sessions, and restock receipts.
4. **Controlled Payment Verification & Credit Governance**:
   - Role-scoped customer payment history, delinquency tracking, credit line investigations, and approval center workflows.
5. **Real-Time Request Threat Inspection**:
   - Active inspection layer detecting SQL injection patterns, path traversal, and abusive rate limits, with temporary 15-minute IP quarantines.

---

## 3. User Roles

| Role | Access Scope & Primary Capabilities |
|---|---|
| **Operating Manager** | Company-wide operational overview, cross-branch analytics, credit investigation approvals, and central user/branch governance. |
| **Branch Head (Manager)** | Branch-level supervision, daily field personnel schedule dispatching, branch inventory oversight, and field activity monitoring. |
| **Collector** | Mobile/field interface with SAW-prioritized daily collection assignments, road navigation, digital receipt issuance, and offline payment logging. |
| **Sales Agent** | Territory customer canvassing, sales order recording, catalog browsing, field activity reporting, and offline sales logging. |
| **Warehouse Personnel** | Stock movements, inter-branch transfer fulfillment, stock count reconciliations, and low-stock alerts. |
| **Customer** | Secure self-service portal to review personal account balance, invoice history, and submit purchase requests. |
| **Super Admin** | System health diagnostics, RBAC permission catalog management, security threat logs, and audit trail reviews. |

---

## 4. Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v14.0 or higher
- **npm** or **pnpm**

### Environment Configuration
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```
Ensure your database credentials in `.env` match your local PostgreSQL instance:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=corvex
DB_USER=postgres
DB_PASSWORD=your_postgres_password
AUTH_SECRET=your_random_32_character_secret
PORT=5000
```

### Database Setup & Migrations
Run the automated migration runner (applies all 60 migrations and base seeds):
```bash
npm run migrate
```
*(Optional) Seed sample branch and SAW collection datasets:*
```bash
npm run seed:saw-davao
npm run seed:secondary-branches
npm run seed:demo-customer
```

### Running the System
Start both the Express API server and the Vite development server:

**Terminal 1 (Backend API):**
```bash
npm run dev:server
```
*API runs at http://localhost:5000*

**Terminal 2 (Frontend Client):**
```bash
npm run dev
```
*Vite dev server runs at http://localhost:5173*

---

## 5. Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts Vite frontend dev server with hot module replacement (HMR). |
| `npm run dev:server` | Starts Express backend in watch mode (`node --watch backend/server.js`). |
| `npm run migrate` | Executes pending SQL migrations in `backend/migrations/`. |
| `npm run seed:saw-davao` | Seeds realistic collection and geo-coordinate test data for Davao City. |
| `npm run seed:secondary-branches` | Seeds data for General Santos City and Davao Oriental branches. |
| `npm run seed:demo-customer` | Seeds customer test credentials for the customer self-service portal. |
| `npm run seed:reset-passwords` | Resets all default role passwords in the database to initial seed values. |
| `npm run check:schema` | Validates PostgreSQL table schemas against expected application columns. |
| `npm test` | Runs the automated test suite (Vitest). |
| `npm run build` | Compiles the production frontend bundle into `dist/`. |
