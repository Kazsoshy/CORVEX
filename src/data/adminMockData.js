// Furniture retail — Operating Manager & Super Admin data (3 Davao branches)

export const ADMIN_PROFILE = {
  name: 'Patricia Reyes',
  employeeId: 'ADM-1001',
  email: 'patricia.reyes@corvex.ph',
  phone: '+63 917 555 1100',
  avatarInitials: 'PR',
  role: 'Operating Manager',
};

export const SUPER_ADMIN_PROFILE = {
  name: 'Marcus Santos',
  employeeId: 'SA-0001',
  email: 'marcus.santos@corvex.ph',
  phone: '+63 917 555 0001',
  avatarInitials: 'MS',
  role: 'Super Admin',
};

export const USERS = [
  { id: 'u1',  name: 'Elena Mercado',      email: 'elena.mercado@corvex.ph',      role: 'Operating Manager', branch: 'All Branches',        status: 'Active',   lastLogin: '2026-06-30 08:14 AM' },
  { id: 'u2',  name: 'Roberto Villanueva', email: 'roberto.villanueva@corvex.ph',  role: 'Operating Manager', branch: 'Davao City',          status: 'Active',   lastLogin: '2026-06-30 07:52 AM' },
  { id: 'u3',  name: 'Miguel Flores',      email: 'miguel.f@corvex.ph',           role: 'Operating Manager', branch: 'General Santos',      status: 'Active',   lastLogin: '2026-06-30 07:45 AM' },
  { id: 'u4',  name: 'Grace Tan',          email: 'grace.t@corvex.ph',            role: 'Operating Manager', branch: 'Davao Oriental',      status: 'Active',   lastLogin: '2026-06-30 07:50 AM' },
  { id: 'u5',  name: 'Maria Dela Cruz',    email: 'maria.dc@corvex.ph',           role: 'Collector',         branch: 'Davao City',          status: 'Active',   lastLogin: '2026-06-30 07:30 AM' },
  { id: 'u6',  name: 'John Dela Cruz',     email: 'john.dc@corvex.ph',            role: 'Collector',         branch: 'Davao City',          status: 'Active',   lastLogin: '2026-06-30 07:31 AM' },
  { id: 'u7',  name: 'Pedro Garcia',       email: 'pedro.g@corvex.ph',            role: 'Collector',         branch: 'Davao City',          status: 'Active',   lastLogin: '2026-06-30 07:29 AM' },
  { id: 'u8',  name: 'Carlos Mendoza',     email: 'carlos.m@corvex.ph',           role: 'Sales Agent',       branch: 'General Santos',      status: 'Active',   lastLogin: '2026-06-30 08:00 AM' },
  { id: 'u9',  name: 'Jane Smith',         email: 'jane.s@corvex.ph',             role: 'Sales Agent',       branch: 'Davao City',          status: 'Active',   lastLogin: '2026-06-29 05:12 PM' },
  { id: 'u10', name: 'Robert Lee',         email: 'robert.l@corvex.ph',           role: 'Sales Agent',       branch: 'Davao Oriental',      status: 'Active',   lastLogin: '2026-06-30 08:05 AM' },
  { id: 'u11', name: 'Ana Reyes',          email: 'ana.r@corvex.ph',              role: 'Warehouse Staff',   branch: 'Davao Oriental',      status: 'Active',   lastLogin: '2026-06-30 06:50 AM' },
  { id: 'u12', name: 'Ben Cruz',           email: 'ben.c@corvex.ph',              role: 'Warehouse Staff',   branch: 'General Santos',      status: 'Inactive', lastLogin: '2026-06-20 02:00 PM' },
  { id: 'u13', name: 'Liza Santos',        email: 'liza.s@corvex.ph',             role: 'Customer',          branch: 'Davao City',          status: 'Active',   lastLogin: '2026-06-28 10:00 AM' },
];

export const USER_STATS = {
  total: USERS.length,
  active: USERS.filter((u) => u.status === 'Active').length,
  inactive: USERS.filter((u) => u.status === 'Inactive').length,
  newThisMonth: 2,
  pendingApprovals: 1,
};

export const ADMIN_BRANCHES = [
  { id: 'b1', name: 'Davao City',    manager: 'Roberto Villanueva', employees: 22, collectors: 5, salesAgents: 4, warehouseStaff: 3, status: 'Active', city: 'Davao City',    region: 'Region XI' },
  { id: 'b2', name: 'General Santos',manager: 'Miguel Flores',      employees: 18, collectors: 6, salesAgents: 5, warehouseStaff: 2, status: 'Active', city: 'General Santos',region: 'Region XII' },
  { id: 'b3', name: 'Davao Oriental', manager: 'Grace Tan',          employees: 14, collectors: 4, salesAgents: 3, warehouseStaff: 2, status: 'Active', city: 'Mati City',     region: 'Region XI' },
];

export const ADMIN_INVENTORY = [
  { id: 'p1',  name: '3-Seater Fabric Sofa (Beige)',          sku: 'SOF-3FB-001', branch: 'Davao Oriental', quantity: 22, status: 'Sufficient',   lastUpdated: '2026-06-25' },
  { id: 'p2',  name: '6-Seater Dining Table Set (Narra)',     sku: 'DNG-6NT-002', branch: 'Davao Oriental', quantity: 5,  status: 'Low Stock',     lastUpdated: '2026-06-25' },
  { id: 'p3',  name: 'Ergonomic Office Chair (Black Mesh)',   sku: 'CHR-EOB-003', branch: 'Davao Oriental', quantity: 0,  status: 'Out of Stock',  lastUpdated: '2026-06-23' },
  { id: 'p4',  name: 'Queen Size Bed Frame (Walnut Veneer)',  sku: 'BED-QWV-004', branch: 'General Santos', quantity: 4,  status: 'Critical Stock',lastUpdated: '2026-06-24' },
  { id: 'p5',  name: '3-Door Wardrobe (White Gloss)',          sku: 'WRD-3DG-005', branch: 'Davao City',     quantity: 18, status: 'Sufficient',   lastUpdated: '2026-06-24' },
  { id: 'p6',  name: 'Coffee Table (Tempered Glass & Steel)',  sku: 'CTB-TGS-006', branch: 'Davao Oriental', quantity: 30, status: 'Sufficient',   lastUpdated: '2026-06-25' },
  { id: 'p7',  name: 'TV Stand with Cabinet (Oak)',            sku: 'TVS-CAB-007', branch: 'Davao City',     quantity: 12, status: 'Sufficient',   lastUpdated: '2026-06-24' },
  { id: 'p8',  name: '5-Shelf Bookcase (Natural Wood)',        sku: 'BSH-5NW-008', branch: 'General Santos', quantity: 9,  status: 'Sufficient',   lastUpdated: '2026-06-24' },
  { id: 'p9',  name: 'Orthopedic Queen Mattress (8-inch)',     sku: 'MAT-OQ8-009', branch: 'Davao Oriental', quantity: 7,  status: 'Sufficient',   lastUpdated: '2026-06-23' },
  { id: 'p10', name: 'L-Shape Study Desk (White)',              sku: 'DSK-LWH-010', branch: 'Davao City',     quantity: 3,  status: 'Critical Stock',lastUpdated: '2026-06-24' },
  { id: 'p11', name: 'Outdoor Rattan Set (4-pc)',               sku: 'OUT-RT4-011', branch: 'General Santos', quantity: 6,  status: 'Sufficient',   lastUpdated: '2026-06-25' },
  { id: 'p12', name: '4-Door Storage Cabinet (Melamine)',       sku: 'CAB-4ML-012', branch: 'Davao Oriental', quantity: 14, status: 'Sufficient',   lastUpdated: '2026-06-25' },
];

export const TRANSFER_REQUESTS = [
  { id: 't1', product: '3-Seater Fabric Sofa (Beige)',         from: 'Davao Oriental', to: 'Davao City',     qty: 4, requestedBy: 'Roberto Villanueva', date: '2026-06-25', status: 'Pending'  },
  { id: 't2', product: 'Ergonomic Office Chair (Black Mesh)',   from: 'General Santos', to: 'Davao Oriental', qty: 6, requestedBy: 'Grace Tan',          date: '2026-06-24', status: 'Pending'  },
  { id: 't3', product: 'Coffee Table (Tempered Glass & Steel)', from: 'Davao Oriental', to: 'General Santos', qty: 5, requestedBy: 'Miguel Flores',      date: '2026-06-23', status: 'Approved' },
];

export const RESTOCK_REQUESTS = [
  { id: 'r1', product: 'Ergonomic Office Chair (Black Mesh)',  branch: 'Davao Oriental', qty: 15, requestedBy: 'Grace Tan',    date: '2026-06-25', status: 'Pending'  },
  { id: 'r2', product: 'Queen Size Bed Frame (Walnut Veneer)', branch: 'General Santos', qty: 8,  requestedBy: 'Miguel Flores',date: '2026-06-24', status: 'Approved' },
];

export const AUDIT_LOGS = [
  { id: 'al1',  timestamp: '2026-06-30 08:32 AM', user: 'Patricia Reyes',     action: 'User Created',         module: 'User Management',      ip: '192.168.1.10', status: 'Success' },
  { id: 'al2',  timestamp: '2026-06-30 08:15 AM', user: 'Marcus Santos',      action: 'Permission Updated',   module: 'Role Management',      ip: '192.168.1.2',  status: 'Success' },
  { id: 'al3',  timestamp: '2026-06-30 08:00 AM', user: 'Elena Mercado',      action: 'Report Exported',      module: 'Reports',              ip: '192.168.1.20', status: 'Success' },
  { id: 'al4',  timestamp: '2026-06-29 04:45 PM', user: 'Roberto Villanueva', action: 'CI Approved',          module: 'Credit Investigation', ip: '192.168.1.22', status: 'Success' },
  { id: 'al5',  timestamp: '2026-06-29 03:10 PM', user: 'Patricia Reyes',     action: 'Branch Updated',       module: 'Branch Management',    ip: '192.168.1.10', status: 'Success' },
  { id: 'al6',  timestamp: '2026-06-29 11:00 AM', user: 'Marcus Santos',      action: 'Backup Created',       module: 'System',               ip: '192.168.1.2',  status: 'Success' },
  { id: 'al7',  timestamp: '2026-06-29 10:22 AM', user: 'Ben Cruz',           action: 'Login Failed',         module: 'Auth',                 ip: '192.168.1.55', status: 'Failed'  },
  { id: 'al8',  timestamp: '2026-06-28 09:14 AM', user: 'Patricia Reyes',     action: 'User Disabled',        module: 'User Management',      ip: '192.168.1.10', status: 'Success' },
  { id: 'al9',  timestamp: '2026-06-28 08:00 AM', user: 'Marcus Santos',      action: 'System Settings Updated', module: 'System Settings',   ip: '192.168.1.2',  status: 'Success' },
  { id: 'al10', timestamp: '2026-06-27 05:30 PM', user: 'Elena Mercado',      action: 'Leaflet | OpenStreetMap Layer Accessed',   module: 'Leaflet | OpenStreetMap',                  ip: '192.168.1.20', status: 'Success' },
];

export const SYSTEM_MONTHLY_COLLECTIONS = [
  { month: 'Jan', total: 10200000 }, { month: 'Feb', total: 10600000 },
  { month: 'Mar', total: 10960000 }, { month: 'Apr', total: 11280000 },
  { month: 'May', total: 11660000 }, { month: 'Jun', total: 12040000 },
];

export const SYSTEM_MONTHLY_SALES = [
  { month: 'Jan', total: 8940000 }, { month: 'Feb', total: 9280000 },
  { month: 'Mar', total: 9560000 }, { month: 'Apr', total: 9820000 },
  { month: 'May', total: 10140000 },{ month: 'Jun', total: 10300000 },
];

export const BRANCH_PERFORMANCE_CHART = [
  { branch: 'Davao City',    performance: 86, risk: 22 },
  { branch: 'General Santos',performance: 91, risk: 14 },
  { branch: 'Davao Oriental',performance: 74, risk: 38 },
];

export const USER_GROWTH = [
  { month: 'Jan', users: 38 }, { month: 'Feb', users: 40 },
  { month: 'Mar', users: 41 }, { month: 'Apr', users: 42 },
  { month: 'May', users: 43 }, { month: 'Jun', users: 45 },
];

export const SYSTEM_HEALTH = {
  dbStatus: 'Online',
  serverCpu: 38,
  memoryUsage: 58,
  storageUsage: 44,
  apiResponseMs: 104,
  activeSessions: 14,
  totalBranches: 3,
  totalUsers: 45,
  uptime: '99.96%',
  lastBackup: '2026-06-30 02:00 AM',
};

export const SECURITY_ALERTS = [
  { id: 's1', type: 'Failed Login Attempt', user: 'ben.c@corvex.ph',      ip: '192.168.1.55', time: '2026-06-29 10:22 AM', severity: 'Warning' },
  { id: 's2', type: 'Unusual Access Time',  user: 'elena.mercado@corvex.ph', ip: '192.168.1.20', time: '2026-06-28 11:45 PM', severity: 'Informational' },
];

export const SERVER_METRICS = [
  { time: '00:00', cpu: 14, mem: 48 }, { time: '04:00', cpu: 10, mem: 46 },
  { time: '08:00', cpu: 34, mem: 56 }, { time: '10:00', cpu: 48, mem: 62 },
  { time: '12:00', cpu: 56, mem: 66 }, { time: '14:00', cpu: 52, mem: 64 },
  { time: '16:00', cpu: 42, mem: 60 }, { time: '18:00', cpu: 38, mem: 58 },
  { time: '20:00', cpu: 22, mem: 52 }, { time: '22:00', cpu: 16, mem: 50 },
];

export const ROLES_PERMISSIONS = [
  { role: 'Super Admin',       permissions: { view: true,  create: true,  edit: true,  delete: true,  approve: true,  export: true,  manageUsers: true,  manageBranches: true  } },
  { role: 'Operating Manager', permissions: { view: true,  create: true,  edit: true,  delete: false, approve: true,  export: true,  manageUsers: true, manageBranches: true } },
  { role: 'Warehouse Staff',   permissions: { view: true,  create: true,  edit: true,  delete: false, approve: false, export: false, manageUsers: false, manageBranches: false } },
  { role: 'Sales Agent',       permissions: { view: true,  create: true,  edit: false, delete: false, approve: false, export: false, manageUsers: false, manageBranches: false } },
  { role: 'Collector',         permissions: { view: true,  create: true,  edit: false, delete: false, approve: false, export: false, manageUsers: false, manageBranches: false } },
  { role: 'Customer',          permissions: { view: true,  create: false, edit: false, delete: false, approve: false, export: false, manageUsers: false, manageBranches: false } },
];

export const BACKUP_HISTORY = [
  { id: 'bk1', type: 'Scheduled', date: '2026-06-30 02:00 AM', size: '186 MB', status: 'Success', by: 'System'         },
  { id: 'bk2', type: 'Manual',    date: '2026-06-29 06:00 AM', size: '184 MB', status: 'Success', by: 'Marcus Santos'  },
  { id: 'bk3', type: 'Scheduled', date: '2026-06-29 02:00 AM', size: '183 MB', status: 'Success', by: 'System'         },
  { id: 'bk4', type: 'Scheduled', date: '2026-06-28 02:00 AM', size: '181 MB', status: 'Success', by: 'System'         },
  { id: 'bk5', type: 'Manual',    date: '2026-06-25 03:30 PM', size: '178 MB', status: 'Success', by: 'Marcus Santos'  },
];

export const SYSTEM_SETTINGS = {
  companyName: 'CORVEX Furniture',
  companyEmail: 'ops@corvex.ph',
  smsEnabled: true,
  otpEnabled: true,
  leafletApiKey: 'CORVEX-GIS-****-****-1234',
  backupSchedule: 'Daily at 02:00 AM',
  notificationsEmail: true,
  notificationsSms: true,
};

export function getUserById(id)   { return USERS.find((u) => u.id === id) ?? null; }
export function getBranchById(id) { return ADMIN_BRANCHES.find((b) => b.id === id) ?? null; }
