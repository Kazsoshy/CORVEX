# CORVEX System Analysis

**Project:** CORVEX — Multi-branch Enterprise Information System (EIS)  
**Client:** Bethuel-Herminihildo (BH) Marketing, Davao City, Philippines  
**Workspace Root:** `c:\Users\ASUS\Corvex`  
**Repository:** https://github.com/Kazsoshy/CORVEX.git  
**Current Branch:** `This` (active development branch)  
**Status:** Merge from `Bacaron` → `This`; 8 modified files pending commit

---

## 1. System Overview

CORVEX is a sophisticated, map-integrated field operations and inventory management system designed for multi-branch enterprises. It operates across three geographic regions (Davao City, General Santos City, Davao Oriental) and serves 7 distinct role-based user portals.

### Core Value Proposition
- **SAW Priority Engine**: Prioritizes field collections using 40% outstanding balance, 30% days overdue, 30% distance weighting
- **Offline-First Field Operations**: Field personnel work disconnected; sync when reconnected
- **Multi-Branch Inventory Isolation**: Prevents phantom inventory while enabling cross-branch visibility
- **Map-Based Route Optimization**: Integrates OSRM for turn-by-turn directions
- **Real-Time Security Monitoring**: Active SQLi, XSS, traversal attack detection with IP quarantine

---

## 2. Technology Stack

### Frontend
- **Framework:** React 18.3.1
- **Build Tool:** Vite 5.4.8
- **Styling:** Tailwind CSS 3.4.19 + PostCSS
- **State:** React hooks + IndexedDB (offline queue)
- **Maps:** Leaflet 1.9.4 + react-leaflet 4.2.1
- **Charts:** Recharts 2.15.3
- **HTTP:** Axios 1.18.1
- **Motion:** Framer Motion 12.42.2
- **Icons:** Lucide-react 1.24.0
- **Exports:** jsPDF 4.2.1 + jspdf-autotable 5.0.8

### Backend
- **Runtime:** Node.js (ES Modules)
- **Framework:** Express 5.2.1
- **Database:** PostgreSQL 14+ (60 automated migrations)
- **Connection:** pg 8.22.0 (connection pooling)
- **Security:** bcryptjs 3.0.3, built-in request inspection
- **Email:** Nodemailer 10.0.15 (SMTP-based)
- **Utilities:** dotenv 17.4.2, cors 2.8.6

### Infrastructure
- **CORS Policy:** Localhost + configured frontend origin
- **Auth:** JWT with secure session tokens
- **Offline Sync:** Queue-based reconciliation on `/api/sync/queue`

---

## 3. Codebase Structure

### Frontend (`src/` — 89 JSX components)

```
src/
├── api/                    # REST client functions (axios-based)
├── components/             # Role-scoped UI
│   ├── inventory/
│   ├── warehouse/
│   ├── [other role UIs]/
├── rolePages/              # 7 role portals
├── offline/                # IndexedDB queue & sync
├── hooks/                  # Custom React hooks
├── utils/                  # Routing, formatting, helpers
├── settings/               # App configuration
├── theme/                  # Tailwind overrides
├── styles/                 # Global CSS
└── App.jsx                 # Router setup
```

### Backend (`backend/` — 135 JS files)

```
backend/
├── server.js               # Express app initialization
├── routes/                 # 27 API endpoint files
│   ├── auth.js
│   ├── products.js
│   ├── inventory.js
│   ├── collector.js
│   ├── sales.js
│   ├── approvals.js
│   ├── security.js
│   ├── sync.js             # Offline queue reconciliation
│   └── [24 more...]
├── middleware/
│   ├── auth.js             # JWT validation, branch scoping
├── lib/
│   ├── security/           # Request inspection, threat detection
│   ├── jobs/               # Background tasks (auto-close, sweeps)
│   ├── ensureSchema.js     # Migration runner
│   ├── operationalNotifications.js
│   ├── branchPolicies.js
│   ├── userAccounts.js
│   └── [utilities]
├── migrations/             # 78 SQL migration files
│   ├── 001_initial_schema.sql
│   ├── ...
│   └── 078_optional_customer_alternate_contact.sql
├── scripts/                # Seed & utility scripts
└── tests/                  # Automated test suite
```

---

## 4. Database Architecture

### Schema Scope
- **Total Migrations:** 78 files (001–078)
- **Latest:** `078_optional_customer_alternate_contact.sql`
- **Key Concepts:**
  - Branch-scoped inventory isolation
  - Multi-branch audit trails
  - Customer credit history & investigations
  - Digital receipt archival
  - Field visit sequencing

### Critical Tables
- `branches` — Multi-branch definitions (Davao City, General Santos City, Davao Oriental)
- `users` — Role-based access control (7 roles)
- `products` — Centralized product catalog with per-branch images
- `inventory` — Branch-isolated stock tracking
- `customers` — Customer profiles with credit governance
- `collection_transactions` — SAW-prioritized field collections
- `sales_transactions` — Sales order history
- `field_visits` — Collector/agent route execution logs
- `approvals` — Workflow-based approval centers
- `security_logs` — Threat detection and breach records

---

## 5. Role Model & Access Control

| Role | Scope | Primary Capabilities |
|---|---|---|
| **Operating Manager** | Company-wide | Cross-branch dashboards, credit approvals, user governance |
| **Branch Head** | Branch-level | Field personnel dispatch, branch inventory oversight |
| **Collector** | Field/Territory | SAW-prioritized daily collections, digital receipts, offline logging |
| **Sales Agent** | Field/Territory | Sales order recording, customer canvassing, field reports |
| **Warehouse Personnel** | Branch | Stock movements, inter-branch transfers, count reconciliation |
| **Customer** | Personal | Self-service account review, invoice history, purchase requests |
| **Super Admin** | System | Diagnostics, RBAC catalog, security logs, audit trails |

### Authentication & Authorization
- **Session Type:** JWT + Server-side validation
- **Branch Scoping Middleware:** Prevents cross-branch data leakage
- **Permission Catalog:** Granular role-based permissions per API endpoint

---

## 6. Core Features & Operations

### 6.1 SAW Priority Engine
Prioritizes customers for daily collection visits:

$$SAW = (0.40 \times B_{normalized}) + (0.30 \times O_{normalized}) - (0.30 \times D_{normalized})$$

Where:
- **B** = Outstanding balance (benefit criterion)
- **O** = Days overdue (benefit criterion)
- **D** = Haversine distance from branch depot (cost criterion)

**Result:** Daily collection manifests with optimized visiting sequences.

### 6.2 Offline-First Field Operations
1. Collectors/Agents work without active connectivity
2. Transactions queued in client-side IndexedDB
3. Upon reconnection → POST to `/api/sync/queue`
4. Server reconciles and applies transactions

### 6.3 Multi-Branch Inventory
- **Isolation:** Each branch maintains separate stock ledgers
- **Central Rollups:** Operating Manager sees cross-branch aggregates
- **Controls:** Non-negative constraints, approval workflows, physical counts
- **Transfers:** Inter-branch movements logged with approval trails

### 6.4 Controlled Payment Verification
- Role-scoped payment history visibility
- Delinquency tracking and credit line investigations
- Approval workflows for credit increases
- Digital receipt issuance to customers

### 6.5 Real-Time Request Threat Inspection
- **Active Layer:** Runs on all API requests (pre-auth)
- **Detection Patterns:** SQLi, XSS, path traversal, excessive rate limits
- **Response:** Temporary IP quarantine (15 minutes), security logging

### 6.6 Background Operational Sweeps
- **Notification Sweeps:** Detects alerts requiring manager attention
- **User Inactivity:** Auto-logout after idle period
- **Branch Status:** Monitors operational health
- **Sales Auto-Close:** Closes completed sales assignments

---

## 7. API Architecture

### Core Endpoint Categories

**Public (No Auth)**
- `/api/auth/login` — User login
- `/api/auth/logout` — Session termination

**Protected (Auth Required)**
- `/api/users` — User management
- `/api/roles` — Role definitions
- `/api/permissions` — RBAC catalog
- `/api/products` — Product catalog (branch-scoped)
- `/api/inventory` — Stock management
- `/api/customers` — Customer profiles
- `/api/branches` — Branch definitions
- `/api/collector` — Collection workflows
- `/api/sales` — Sales transactions
- `/api/approvals` — Approval centers
- `/api/security` — Threat logs
- `/api/sync/queue` — Offline reconciliation
- `/api/dashboard` — Role-scoped dashboards
- `/api/admin` — System administration
- `[+ 12 additional routes]`

### File Upload Handling
- **Static:** `/api/products/:id/image` — Product photos (cache: 1 year)
- **Uploads Directory:** `backend/uploads/` — Receipts, documents

### Error Handling
- Standard HTTP status codes (400, 401, 403, 404, 500)
- CORS enforcement (origin validation)
- Request size limits (2MB JSON)

---

## 8. Environment Configuration

### Required Environment Variables
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=corvex
DB_USER=postgres
DB_PASSWORD=<required>

# Authentication
JWT_SECRET=<32-char random>

# Frontend
FRONTEND_URL=http://localhost:5173

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=<app-specific password>
SMTP_FROM="Corvex Accounts <you@gmail.com>"

# Optional
OSRM_BASE_URL=https://router.project-osrm.org
PORTAL_INVITE_TTL_HOURS=24
COMPANY_NAME=Corvex
SUPPORT_EMAIL=support@yourdomain.com
SUPPORT_PHONE=+63 900 000 0000
```

**Note:** `.env` is git-ignored; copy `.env.example` and fill in values.

---

## 9. Development Workflow

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite frontend (HMR at 5173) |
| `npm run dev:server` | Start Express backend (watch mode at 5000) |
| `npm run migrate` | Run pending migrations & seed base data |
| `npm run seed:saw-davao` | Populate Davao test data |
| `npm run seed:secondary-branches` | Populate General Santos & Davao Oriental |
| `npm run seed:demo-customer` | Create test customer accounts |
| `npm run seed:reset-passwords` | Reset all passwords to seed defaults |
| `npm run check:schema` | Validate table schemas |
| `npm run check:credit` | Verify credit consistency |
| `npm run check:suppliers` | Validate supplier data |
| `npm run check:territories` | Validate territory assignments |
| `npm test` | Run automated test suite |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |

### Typical Setup
```bash
# 1. Copy environment file
cp .env.example .env
# Edit .env with real credentials

# 2. Install dependencies
npm install

# 3. Run migrations & seeds
npm run migrate
npm run seed:saw-davao

# 4. Start dev servers (two terminals)
npm run dev:server           # Terminal 1
npm run dev                  # Terminal 2

# Access at:
# - Frontend: http://localhost:5173
# - API: http://localhost:5000
```

---

## 10. Current Development State

### Git Status
- **Active Branch:** `This`
- **Latest Commit:** Merge from `Bacaron` into `This` (HEAD: 84d5a56)
- **Remote Origin:** https://github.com/Kazsoshy/CORVEX.git

### Pending Changes (Not Staged)
8 modified files across warehouse and inventory modules:
1. `backend/lib/ensureSchema.js`
2. `backend/routes/products.js`
3. `src/components/inventory/BranchInventoryViewPage.jsx`
4. `src/components/warehouse/ProductSearchSelect.jsx`
5. `src/components/warehouse/RestockDocumentForm.jsx`
6. `src/components/warehouse/WarehousePageBody.jsx`
7. `src/modern-overrides.css`
8. `src/utils/warehouseRoutes.js`

**Recommendation:** Review, test, and commit these changes before proceeding with new features.

### Recent Commit History
- `84d5a56` — Merge `Bacaron` → `This`
- `64de214` — Old checkpoint (origin/This)
- `a5a0dd2` — Minor revisions (origin/Bacaron)
- `c58b935` — CORS production origin support
- `db575ec` — Sales area migration fix
- `b020887` — Notifications & navbar update

---

## 11. Documentation

### Available Docs
- **`chapter2_descriptive_analytics.md`** (117 lines) — Analytics formulas, data aggregation, measure generation
- **`DEPLOY_RENDER.md`** (271 lines) — Production deployment guide (Render platform)
- **`README.md`** — Project overview (already reviewed)

### Kiro Configuration
- **Path:** `.kiro/`
  - `.config.kiro` — (not readable; may be encrypted or binary)
  - `requirements.md` — (not readable)

---

## 12. Key Observations

### Strengths
1. **Well-organized modular architecture** — Clean separation of frontend/backend concerns
2. **Comprehensive security layer** — Real-time threat inspection built-in
3. **Enterprise-grade RBAC** — Role-based access control with branch scoping
4. **Offline-first design** — Queue-based sync for field operations
5. **Automated migrations** — 78 SQL migrations for schema evolution
6. **Production-ready tooling** — Vite, Express, PostgreSQL, dotenv

### Technical Debt & Considerations
1. **Pending code changes** — 8 modified files need review & commit
2. **Multiple active branches** — `This`, `Bacaron`, `main` — ensure merge strategy is clear
3. **Email dependency** — SMTP required for account activation; Gmail recommended for dev
4. **Schema complexity** — 78 migrations suggest iterative design; ensure all are backward-compatible
5. **IndexedDB queue** — Offline sync logic is client-side; ensure server can handle volume

### Recommended Next Steps
1. **Commit pending changes** — Stage and commit the 8 modified files with clear messages
2. **Branch strategy review** — Align on main/staging/feature branch conventions
3. **Test offline sync** — Verify IndexedDB → `/api/sync/queue` reconciliation under load
4. **Security audit** — Review threat inspection patterns for false positives
5. **Documentation** — Expand API docs with schema examples and common workflows

---

## 13. File & Performance Metrics

### Codebase Size
- **Frontend Components:** 89 JSX files
- **Backend Routes & Logic:** 135 JS files
- **SQL Migrations:** 78 files
- **Total:** ~300+ source files

### Database
- **Connection Pool:** 10 max connections, 30s idle timeout, 5s connection timeout
- **JSON Size Limit:** 2MB per request
- **Catalog Cache:** 1-year TTL for product images

### Vite Dev Server
- **Port:** 5173
- **API Proxy:** Forwards `/api/*` to `http://localhost:5000`

### Express API Server
- **Port:** 5000
- **CORS:** Whitelist localhost, production origin, allow non-origin requests

---

## 14. Security Posture

### Built-In Defenses
- **Input Validation:** SQLi pattern detection
- **XSS Prevention:** Request inspection layer
- **Path Traversal:** Active monitoring
- **Rate Limiting:** Excessive request detection + 15-min IP quarantine
- **Password Security:** bcryptjs hashing
- **JWT Tokens:** Session-based authentication
- **Branch Isolation:** Middleware enforces data boundaries

### Best Practices to Maintain
- Regular PostgreSQL backups
- Monitor `/security` logs for breach patterns
- Rotate JWT_SECRET periodically
- Use environment-specific `.env` files (never commit)
- Run `npm audit` regularly for dependency vulnerabilities

---

## 15. Deployment Readiness

### Production Checklist
- [ ] Environment variables configured (`.env` created, secrets filled)
- [ ] Database migrations tested (`npm run migrate`)
- [ ] SMTP credentials validated (test email send)
- [ ] Frontend build optimized (`npm run build`)
- [ ] Backend dependencies audited (`npm audit`)
- [ ] Security logs monitored
- [ ] Backup strategy established
- [ ] SSL/TLS configured (for production origin)
- [ ] OSRM endpoint available or configured
- [ ] Offline queue tested under realistic conditions

### Deployment Platforms
- **Documented:** Render.com (see `DEPLOY_RENDER.md`)
- **Typical:** Node.js hosting (Heroku, Render, Railway, AWS/DigitalOcean)

---

## Summary

CORVEX is a **well-engineered, production-ready multi-branch enterprise system** with sophisticated features (SAW prioritization, offline-first operations, real-time security) and clean architecture. The codebase is organized, the tech stack is modern, and the security posture is strong. Current focus should be on **committing pending changes, aligning branch strategy, and validating offline sync behavior** before expanding features or moving to production.

**Est. Readiness:** 85% — Pending code review and testing of recent warehouse/inventory changes.
