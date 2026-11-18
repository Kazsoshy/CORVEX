# CORVEX — As-built architecture

This document describes the **current** system shape. It is not a redesign proposal.

## Overview

```
React (Vite)  --HTTPS/REST-->  Express API  --pg pool-->  PostgreSQL
     |                              |
  IndexedDB queue                 lib/ domain services
  Leaflet / OSRM client             migrations + ensureSchema
```

## Directory map

| Path                         | Responsibility                                                    |
| ---------------------------- | ----------------------------------------------------------------- |
| `src/`                       | Presentation: role portals, shared UI, API clients, offline queue |
| `src/components/<role>/`     | Role-specific screens                                             |
| `src/components/shared/`     | Reusable UI across roles                                          |
| `src/api/`                   | Frontend HTTP services (`apiClient.js` + domain services)         |
| `src/utils/`                 | Pure helpers (formatters, routes, geo, standing)                  |
| `src/offline/`               | Field offline queue / prefs                                       |
| `backend/server.js`          | Express app bootstrap, CORS, pool, sweeps                         |
| `backend/routes/`            | HTTP route modules                                                |
| `backend/lib/`               | Business logic (SAW, inventory, credit, security, mail, OSRM, …)  |
| `backend/middleware/auth.js` | Sessions, `ROLE_SETS`, branch scope                               |
| `backend/migrations/`        | Ordered SQL migrations                                            |
| `backend/tests/`             | Formal `node --test` suites                                       |
| `scripts/`                   | Durable repo checks only                                          |
| `docs/`                      | Scope, architecture, audits, deploy notes                         |

## Auth and authorization

- Login issues HMAC-signed session tokens (`AUTH_SECRET`).
- Route guards: `requireAuth`, `requireRole`, `requireAssignedBranch`, `isUnscoped`.
- Primary policy today: hardcoded `ROLE_SETS` (DB permission catalog exists but is not the sole enforcer).

Manuscript roles: Operating Manager, Branch Head, Collector, Sales Agent, Warehouse Personnel, Customer.  
Code aliases: `branch_manager`, `sales_staff`, `inventory_staff`; extra shell: Super Admin — see scope doc.

## Data and migrations

- Schema evolves via `backend/migrations/*.sql` listed in `run_migrations.js`.
- `ensureSchema.js` may patch critical structures at boot — check both before adding columns.
- Branch-scoped operational data; OM (and some unscoped roles) may query cross-branch.

## Maps and field ops

- Leaflet + OSM for visualization.
- Routing uses **OSRM** (`backend/lib/osrm.js`) — manuscript mentions OpenRouteService (documented substitution).
- SAW weights: 40% balance / 30% overdue / 30% distance (`backend/lib` SAW modules).

## Offline

- Client queue under `src/offline/`; server sync via `backend/routes/sync.js` + `backend/lib/offlineSync.js`.

## UI conventions

- Tailwind + existing CSS (`styles.css`, role pages).
- Display money/dates/phones via `src/utils/formatters.js`.
- Prefer shared components over new one-off chrome.

## Quality gates

See root `AGENTS.md` and `npm run quality`.
