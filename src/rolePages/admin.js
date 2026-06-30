export const adminRole = {
  key: 'admin',
  label: 'Admin',
  homePath: '/admin',
  entryPath: '/admin/dashboard',
  loginPath: '/admin',
  accent: 'User management, branches, inventory, and system reports',
  navPages: [
    { label: 'Dashboard',           to: '/admin/dashboard' },
    { label: 'User Management',     to: '/admin/users' },
    { label: 'Branch Management',   to: '/admin/branches' },
    { label: 'Inventory Management',to: '/admin/inventory' },
    { label: 'System Reports',      to: '/admin/reports' },
    { label: 'Audit Logs',          to: '/admin/audit-logs' },
    { label: 'Notifications',       to: '/admin/notifications' },
    { label: 'Profile',             to: '/admin/profile' },
  ],
  routes: {},
};
