export const superAdminRole = {
  key: 'superAdmin',
  label: 'Super Admin',
  homePath: '/super-admin',
  entryPath: '/super-admin/dashboard',
  loginPath: '/super-admin',
  accent: 'Full system control, security, and infrastructure',
  navPages: [
    { label: 'Dashboard',              to: '/super-admin/dashboard' },
    { label: 'Role & Permissions',     to: '/super-admin/roles' },
    { label: 'System Settings',        to: '/super-admin/settings' },
    { label: 'Backup & Restore',       to: '/super-admin/backup' },
    { label: 'Database Monitoring',    to: '/super-admin/monitoring' },
    { label: 'Audit Logs',             to: '/super-admin/audit-logs' },
    { label: 'Notifications',          to: '/super-admin/notifications' },
    { label: 'Profile',                to: '/super-admin/profile' },
  ],
  routes: {},
};
