# Requirements: Admin & Super Admin Roles

## Overview
Extend the CORVEX role hierarchy by adding two new roles — **Admin** and **Super Admin** — above the existing Operating Manager. This expands the system from the current 6 roles (Collector, Sales, Warehouse, Branch Manager, Operating Manager, Customer) to 8 roles, adding 12 new pages (Pages 35–46 from the system outline).

---

## Role Hierarchy (Updated)

```
Super Admin
└── Admin
    └── Operating Manager
        └── Branch Manager
            ├── Collector
            ├── Sales Agent
            └── Warehouse Staff
        └── Customer (managed, not direct report)
```

---

## Requirements

### REQ-1: Admin Role & Dashboard (Page 35)

**As an Admin**, I need a home dashboard that gives me a full operational overview so I can manage daily administration across branches.

#### Acceptance Criteria
- Dashboard displays branch overview cards (one per branch, showing name, health score, and status)
- Dashboard shows user statistics: Active Users, Disabled Users, New Users (this month)
- Dashboard shows count of pending account approvals
- Dashboard shows inventory overview summarizing stock health across all branches
- Dashboard shows system notifications feed
- Dashboard includes quick-link cards navigating to: User Management, Branch Management, Inventory Management, Reports, Audit Logs

---

### REQ-2: User Management Page (Page 36)

**As an Admin**, I need to view and manage all system users so I can control access and maintain accurate user records.

#### Acceptance Criteria
- Page shows a searchable, filterable list of all users
- Users can be filtered by role (all roles except Super Admin)
- Users can be filtered by branch
- Users can be filtered by status (Active / Inactive)
- Each row shows: Name, Email, Role, Assigned Branch, Status, Last Login
- "Add User" button opens the Add User form
- Each row has: Edit, Disable, Reset Password actions
- Disable User triggers a confirmation dialog before applying
- Reset Password shows a confirmation before sending

---

### REQ-3: Add / Edit User Form (Page 37)

**As an Admin**, I need a form to create and edit user accounts so I can onboard new staff or update existing records.

#### Acceptance Criteria
- Form fields: Full Name, Email, Contact Number, Role (dropdown), Assigned Branch (dropdown), Username, Temporary Password, Status (Active/Inactive)
- Role dropdown excludes Super Admin from options
- Save button returns to User Management page with a success toast
- Cancel button returns to User Management page without saving
- Edit form pre-fills all fields with the existing user's data

---

### REQ-4: Branch Management Page (Page 38)

**As an Admin**, I need to view and manage all branches so I can maintain branch records and staffing.

#### Acceptance Criteria
- Page shows a list of all branches with: Branch Name, Branch Manager, Employee Count, Active Collectors, Active Sales Agents, Warehouse Staff Count, Branch Status
- "Add Branch" button opens an Add Branch form
- Each row has actions: View Branch (→ Branch Details), Edit Branch, Assign Manager, Disable Branch
- Disable Branch shows a confirmation before applying

---

### REQ-5: Inventory Management Page — Admin (Page 39)

**As an Admin**, I need an inventory overview across all branches so I can monitor stock and approve transfer/restock requests.

#### Acceptance Criteria
- Page shows all products across all branches with search capability
- Page shows pending Transfer Requests with Approve/Reject actions
- Page shows pending Restock Requests
- Page shows Inventory Discrepancies flagged by branches
- Export Inventory button generates a PDF or Excel export
- Approving or rejecting a transfer shows a confirmation toast

---

### REQ-6: System Reports Page (Page 40)

**As an Admin**, I need access to system-wide reports so I can analyze performance across all branches and roles.

#### Acceptance Criteria
- Page contains tabbed or sectioned reports: Collection Reports, Sales Reports, Inventory Reports, Branch Performance, Employee Performance, GIS Analytics
- Each section has a date range filter
- Each section has Export PDF and Export Excel buttons
- Reports display using charts (bar, line, area) consistent with the existing design system

---

### REQ-7: Audit Log Page — Admin (Page 41)

**As an Admin**, I need a searchable audit log so I can trace every important action taken in the system.

#### Acceptance Criteria
- Table columns: Timestamp, User, Action, Module, IP Address, Status
- Logs are filterable by Module, User, Date Range, and Status
- Each row has a "View Details" action showing full log entry
- Export Logs button exports the filtered log as PDF or Excel

---

### REQ-8: Super Admin Role & Dashboard (Page 42)

**As a Super Admin**, I need a system-health dashboard so I can monitor infrastructure, security, and overall system status.

#### Acceptance Criteria
- Dashboard shows: Total System Users, Total Branches, Active Sessions count
- Dashboard shows: Database Status indicator (Healthy / Warning / Critical)
- Dashboard shows: System Health score and Server Performance metrics (CPU %, Memory %, Storage %)
- Dashboard shows: Recent Activities feed (last 10 system-level actions)
- Dashboard shows: Security Alerts (e.g. failed logins, suspicious sessions)
- Quick links navigate to: System Settings, Role & Permission Management, Backup & Restore, Audit Logs, Database Monitoring

---

### REQ-9: Role & Permission Management Page (Page 43)

**As a Super Admin**, I need to manage what each role can do so I can enforce least-privilege access across the system.

#### Acceptance Criteria
- Page lists all 8 roles: Super Admin, Admin, Operating Manager, Branch Manager, Warehouse Staff, Sales Agent, Collector, Customer
- For each role, permissions can be toggled: View, Create, Edit, Delete, Approve, Export, Manage Users, Manage Branches
- Save Permissions button saves changes with a success toast
- Edit Role opens an inline edit panel for that role's permissions
- Super Admin permissions cannot be edited (read-only row)

---

### REQ-10: System Settings Page (Page 44)

**As a Super Admin**, I need a settings page so I can configure system-wide options.

#### Acceptance Criteria
- Settings sections: Company Information (name, address, logo upload), Email Settings (SMTP host, port, sender), SMS/OTP Settings, GIS API Key, Backup Schedule, Notification Settings
- Save Settings button saves changes with a success toast
- Restore Defaults button shows a confirmation dialog before resetting

---

### REQ-11: Backup & Restore Page (Page 45)

**As a Super Admin**, I need to manage backups so I can recover the system in the event of data loss.

#### Acceptance Criteria
- Page shows Manual Backup button that triggers an immediate backup with a success toast
- Page shows Scheduled Backups configuration (frequency, time)
- Page shows Backup History table: Backup ID, Date, Size, Status, with Download Backup and Restore actions
- Restore action shows a confirmation dialog warning about data replacement before proceeding

---

### REQ-12: Database & Server Monitoring Page (Page 46)

**As a Super Admin**, I need real-time monitoring of system infrastructure so I can identify and respond to performance issues.

#### Acceptance Criteria
- Page shows live-style metric cards: Database Status, Server CPU Usage (%), Memory Usage (%), Storage Usage (%), API Response Time (ms), Active Users
- Page shows an Error Logs table with recent system errors
- Refresh button reloads all metrics with a loading state
- Download Logs button exports the error log

---

## Non-Functional Requirements

- Both new roles follow the existing sidebar layout and color theme
- Admin uses the same charcoal sidebar (`#0f172a`) and blue accent as other roles
- Super Admin uses the same design system — no new design language needed
- All mock data for Admin and Super Admin is co-located in new files: `src/data/adminMockData.js` and `src/data/superAdminMockData.js`
- New role pages are registered in `src/rolePages/admin.js` and `src/rolePages/superAdmin.js`
- New route resolvers are added in `src/utils/adminRoutes.js` and `src/utils/superAdminRoutes.js`
- Both roles appear in the login page role selector
- Recharts is used for all charts, consistent with the existing Operating Manager and Branch Manager implementations
