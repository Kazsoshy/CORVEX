// ── Admin & Super Admin mock data ─────────────────────────────────────────────

export const ADMIN_PROFILE = {
  name: 'Patricia Reyes',
  employeeId: 'ADM-1001',
  email: 'patricia.reyes@corvex.ph',
  phone: '+63 917 555 1100',
  avatarInitials: 'PR',
  role: 'Admin',
};

export const SUPER_ADMIN_PROFILE = {
  name: 'Marcus Santos',
  employeeId: 'SA-0001',
  email: 'marcus.santos@corvex.ph',
  phone: '+63 917 555 0001',
  avatarInitials: 'MS',
  role: 'Super Admin',
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const USERS = [
  { id: 'u1',  name: 'Elena Mercado',     email: 'elena.mercado@corvex.ph',     role: 'Operating Manager', branch: 'All Branches',          status: 'Active',   lastLogin: '2026-06-30 08:14 AM' },
  { id: 'u2',  name: 'Roberto Villanueva',email: 'roberto.villanueva@corvex.ph', role: 'Branch Manager',    branch: 'Quezon City Main',      status: 'Active',   lastLogin: '2026-06-30 07:52 AM' },
  { id: 'u3',  name: 'Maria Dela Cruz',   email: 'maria.dc@corvex.ph',          role: 'Collector',         branch: 'Quezon City Main',      status: 'Active',   lastLogin: '2026-06-30 07:30 AM' },
  { id: 'u4',  name: 'John Dela Cruz',    email: 'john.dc@corvex.ph',           role: 'Collector',         branch: 'Quezon City Main',      status: 'Active',   lastLogin: '2026-06-30 07:31 AM' },
  { id: 'u5',  name: 'Pedro Garcia',      email: 'pedro.g@corvex.ph',           role: 'Collector',         branch: 'Quezon City Main',      status: 'Active',   lastLogin: '2026-06-30 07:29 AM' },
  { id: 'u6',  name: 'Carlos Mendoza',    email: 'carlos.m@corvex.ph',          role: 'Sales Agent',       branch: 'Quezon City Main',      status: 'Active',   lastLogin: '2026-06-30 08:00 AM' },
  { id: 'u7',  name: 'Jane Smith',        email: 'jane.s@corvex.ph',            role: 'Sales Agent',       branch: 'Quezon City Main',      status: 'Active',   lastLogin: '2026-06-29 05:12 PM' },
  { id: 'u8',  name: 'Robert Lee',        email: 'robert.l@corvex.ph',          role: 'Sales Agent',       branch: 'North Branch',          status: 'Active',   lastLogin: '2026-06-30 08:05 AM' },
  { id: 'u9',  name: 'Ana Torres',        email: 'ana.t@corvex.ph',             role: 'Warehouse Staff',   branch: 'Quezon City Main',      status: 'Active',   lastLogin: '2026-06-30 06:50 AM' },
  { id: 'u10', name: 'Ben Cruz',          email: 'ben.c@corvex.ph',             role: 'Warehouse Staff',   branch: 'North Branch',          status: 'Inactive', lastLogin: '2026-06-20 02:00 PM' },
  { id: 'u11', name: 'Liza Santos',       email: 'liza.s@corvex.ph',            role: 'Customer',          branch: 'Davao City',            status: 'Active',   lastLogin: '2026-06-28 10:00 AM' },
  { id: 'u12', name: 'Miguel Flores',     email: 'miguel.f@corvex.ph',          role: 'Branch Manager',    branch: 'North Branch',          status: 'Active',   lastLogin: '2026-06-30 07:45 AM' },
];

export const USER_STATS = {
  total: USERS.length,
  active: USERS.filter((u) => u.status === 'Active').length,
  inactive: USERS.filter((u) => u.status === 'Inactive').length,
  newThisMonth: 3,
  pendingApprovals: 2,
};

// ── Branches ──────────────────────────────────────────────────────────────────
export const ADMIN_BRANCHES = [
  {
    id: 'b1', name: 'Quezon City Main', manager: 'Roberto Villanueva',
    employees: 24, collectors: 5, salesAgents: 4, warehouseStaff: 3,
    status: 'Active', city: 'Quezon City', region: 'NCR',
  },
  {
    id: 'b2', name: 'North Branch', manager: 'Miguel Flores',
    employees: 18, collectors: 4, salesAgents: 3, warehouseStaff: 2,
    status: 'Active', city: 'Caloocan', region: 'NCR',
  },
  {
    id: 'b3', name: 'South Branch', manager: 'Grace Tan',
    employees: 21, collectors: 5, salesAgents: 4, warehouseStaff: 2,
    status: 'Active', city: 'Las Piñas', region: 'NCR',
  },
  {
    id: 'b4', name: 'Davao City', manager: 'Rico Buena',
    employees: 28, collectors: 7, salesAgents: 5, warehouseStaff: 4,
    status: 'Active', city: 'Davao City', region: 'Region XI',
  },
];

// ── Inventory overview across branches ───────────────────────────────────────
export const ADMIN_INVENTORY = [
  { id: 'p1', name: 'Beverage Pack A',   sku: 'BEV-001', branch: 'Quezon City Main', quantity: 240, status: 'Sufficient',    lastUpdated: '2026-06-29' },
  { id: 'p2', name: 'Snack Box B',       sku: 'SNK-002', branch: 'North Branch',     quantity: 18,  status: 'Low Stock',     lastUpdated: '2026-06-29' },
  { id: 'p3', name: 'Candy Mix C',       sku: 'CND-003', branch: 'Quezon City Main', quantity: 0,   status: 'Out of Stock',  lastUpdated: '2026-06-28' },
  { id: 'p4', name: 'Instant Noodles D', sku: 'NDL-004', branch: 'South Branch',     quantity: 88,  status: 'Sufficient',    lastUpdated: '2026-06-30' },
  { id: 'p5', name: 'Coffee Mix E',      sku: 'CFE-005', branch: 'Davao City',       quantity: 12,  status: 'Low Stock',     lastUpdated: '2026-06-28' },
  { id: 'p6', name: 'Water Bottle 500ml',sku: 'WTR-006', branch: 'North Branch',     quantity: 320, status: 'Sufficient',    lastUpdated: '2026-06-30' },
];

export const TRANSFER_REQUESTS = [
  { id: 't1', product: 'Snack Box B',  from: 'Davao City', to: 'North Branch',     qty: 50, requestedBy: 'Miguel Flores', date: '2026-06-29', status: 'Pending' },
  { id: 't2', product: 'Candy Mix C',  from: 'South Branch', to: 'Quezon City Main',qty: 30, requestedBy: 'Roberto Villanueva', date: '2026-06-28', status: 'Pending' },
  { id: 't3', product: 'Coffee Mix E', from: 'Quezon City Main', to: 'Davao City',  qty: 40, requestedBy: 'Rico Buena',    date: '2026-06-27', status: 'Approved' },
];

export const RESTOCK_REQUESTS = [
  { id: 'r1', product: 'Candy Mix C',   branch: 'Quezon City Main', qty: 100, requestedBy: 'Roberto Villanueva', date: '2026-06-29', status: 'Pending' },
  { id: 'r2', product: 'Coffee Mix E',  branch: 'Davao City',       qty: 60,  requestedBy: 'Rico Buena',         date: '2026-06-28', status: 'Approved' },
];

// ── Audit Logs ────────────────────────────────────────────────────────────────
export const AUDIT_LOGS = [
  { id: 'al1',  timestamp: '2026-06-30 08:32 AM', user: 'Patricia Reyes',     action: 'User Created',       module: 'User Management',     ip: '192.168.1.10', status: 'Success' },
  { id: 'al2',  timestamp: '2026-06-30 08:15 AM', user: 'Marcus Santos',      action: 'Permission Updated', module: 'Role Management',     ip: '192.168.1.2',  status: 'Success' },
  { id: 'al3',  timestamp: '2026-06-30 08:00 AM', user: 'Elena Mercado',      action: 'Report Exported',    module: 'Reports',             ip: '192.168.1.20', status: 'Success' },
  { id: 'al4',  timestamp: '2026-06-29 04:45 PM', user: 'Roberto Villanueva', action: 'CI Approved',        module: 'Credit Investigation',ip: '192.168.1.22', status: 'Success' },
  { id: 'al5',  timestamp: '2026-06-29 03:10 PM', user: 'Patricia Reyes',     action: 'Branch Updated',     module: 'Branch Management',   ip: '192.168.1.10', status: 'Success' },
  { id: 'al6',  timestamp: '2026-06-29 11:00 AM', user: 'Marcus Santos',      action: 'Backup Created',     module: 'System',              ip: '192.168.1.2',  status: 'Success' },
  { id: 'al7',  timestamp: '2026-06-29 10:22 AM', user: 'Ben Cruz',           action: 'Login Failed',       module: 'Auth',                ip: '192.168.1.55', status: 'Failed' },
  { id: 'al8',  timestamp: '2026-06-28 09:14 AM', user: 'Patricia Reyes',     action: 'User Disabled',      module: 'User Management',     ip: '192.168.1.10', status: 'Success' },
  { id: 'al9',  timestamp: '2026-06-28 08:00 AM', user: 'Marcus Santos',      action: 'System Settings Updated', module: 'System Settings', ip: '192.168.1.2', status: 'Success' },
  { id: 'al10', timestamp: '2026-06-27 05:30 PM', user: 'Elena Mercado',      action: 'GIS Layer Accessed', module: 'GIS',                 ip: '192.168.1.20', status: 'Success' },
];

// ── System Reports chart data ─────────────────────────────────────────────────
export const SYSTEM_MONTHLY_COLLECTIONS = [
  { month: 'Jan', total: 14000000 }, { month: 'Feb', total: 14550000 },
  { month: 'Mar', total: 15040000 }, { month: 'Apr', total: 15240000 },
  { month: 'May', total: 15630000 }, { month: 'Jun', total: 16550000 },
];
export const SYSTEM_MONTHLY_SALES = [
  { month: 'Jan', total: 12160000 }, { month: 'Feb', total: 12620000 },
  { month: 'Mar', total: 12920000 }, { month: 'Apr', total: 13060000 },
  { month: 'May', total: 13520000 }, { month: 'Jun', total: 14160000 },
];
export const BRANCH_PERFORMANCE_CHART = [
  { branch: 'Main',  performance: 92, risk: 18 },
  { branch: 'North', performance: 87, risk: 28 },
  { branch: 'South', performance: 78, risk: 42 },
  { branch: 'Davao', performance: 96, risk: 12 },
];
export const USER_GROWTH = [
  { month: 'Jan', users: 38 }, { month: 'Feb', users: 40 },
  { month: 'Mar', users: 42 }, { month: 'Apr', users: 43 },
  { month: 'May', users: 45 }, { month: 'Jun', users: 47 },
];

// ── Super Admin: system health ────────────────────────────────────────────────
export const SYSTEM_HEALTH = {
  dbStatus: 'Online',
  serverCpu: 34,
  memoryUsage: 61,
  storageUsage: 47,
  apiResponseMs: 112,
  activeSessions: 18,
  totalBranches: 4,
  totalUsers: 47,
  uptime: '99.98%',
  lastBackup: '2026-06-30 02:00 AM',
};

export const SECURITY_ALERTS = [
  { id: 's1', type: 'Failed Login Attempt', user: 'ben.c@corvex.ph',    ip: '192.168.1.55', time: '2026-06-29 10:22 AM', severity: 'Warning' },
  { id: 's2', type: 'Unusual Access Time',  user: 'elena.mercado@corvex.ph', ip: '192.168.1.20', time: '2026-06-28 11:45 PM', severity: 'Informational' },
];

export const SERVER_METRICS = [
  { time: '00:00', cpu: 18, mem: 55 }, { time: '04:00', cpu: 12, mem: 52 },
  { time: '08:00', cpu: 38, mem: 62 }, { time: '10:00', cpu: 52, mem: 67 },
  { time: '12:00', cpu: 61, mem: 70 }, { time: '14:00', cpu: 58, mem: 68 },
  { time: '16:00', cpu: 44, mem: 65 }, { time: '18:00', cpu: 34, mem: 61 },
  { time: '20:00', cpu: 22, mem: 57 }, { time: '22:00', cpu: 16, mem: 54 },
];

// ── Role & Permission matrix ──────────────────────────────────────────────────
export const ROLES_PERMISSIONS = [
  {
    role: 'Super Admin',
    permissions: { view: true,  create: true,  edit: true,  delete: true,  approve: true,  export: true,  manageUsers: true,  manageBranches: true },
  },
  {
    role: 'Admin',
    permissions: { view: true,  create: true,  edit: true,  delete: false, approve: true,  export: true,  manageUsers: true,  manageBranches: true },
  },
  {
    role: 'Operating Manager',
    permissions: { view: true,  create: false, edit: false, delete: false, approve: false, export: true,  manageUsers: false, manageBranches: false },
  },
  {
    role: 'Branch Manager',
    permissions: { view: true,  create: true,  edit: true,  delete: false, approve: true,  export: true,  manageUsers: false, manageBranches: false },
  },
  {
    role: 'Warehouse Staff',
    permissions: { view: true,  create: true,  edit: true,  delete: false, approve: false, export: false, manageUsers: false, manageBranches: false },
  },
  {
    role: 'Sales Agent',
    permissions: { view: true,  create: true,  edit: false, delete: false, approve: false, export: false, manageUsers: false, manageBranches: false },
  },
  {
    role: 'Collector',
    permissions: { view: true,  create: true,  edit: false, delete: false, approve: false, export: false, manageUsers: false, manageBranches: false },
  },
  {
    role: 'Customer',
    permissions: { view: true,  create: false, edit: false, delete: false, approve: false, export: false, manageUsers: false, manageBranches: false },
  },
];

// ── Backup history ────────────────────────────────────────────────────────────
export const BACKUP_HISTORY = [
  { id: 'bk1', type: 'Scheduled', date: '2026-06-30 02:00 AM', size: '284 MB', status: 'Success',  by: 'System' },
  { id: 'bk2', type: 'Manual',    date: '2026-06-29 06:00 AM', size: '281 MB', status: 'Success',  by: 'Marcus Santos' },
  { id: 'bk3', type: 'Scheduled', date: '2026-06-29 02:00 AM', size: '280 MB', status: 'Success',  by: 'System' },
  { id: 'bk4', type: 'Scheduled', date: '2026-06-28 02:00 AM', size: '278 MB', status: 'Success',  by: 'System' },
  { id: 'bk5', type: 'Manual',    date: '2026-06-25 03:30 PM', size: '272 MB', status: 'Success',  by: 'Marcus Santos' },
];

export const SYSTEM_SETTINGS = {
  companyName: 'CORVEX Operations',
  companyEmail: 'ops@corvex.ph',
  smsEnabled: true,
  otpEnabled: true,
  gisApiKey: 'CORVEX-GIS-****-****-1234',
  backupSchedule: 'Daily at 02:00 AM',
  notificationsEmail: true,
  notificationsSms: true,
};

export function getUserById(id) { return USERS.find((u) => u.id === id) ?? null; }
export function getBranchById(id) { return ADMIN_BRANCHES.find((b) => b.id === id) ?? null; }
