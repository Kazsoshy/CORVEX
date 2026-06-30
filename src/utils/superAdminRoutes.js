const ROUTES = [
  { pattern: /^\/super-admin\/dashboard$/,   pageType: 'dashboard' },
  { pattern: /^\/super-admin\/roles$/,       pageType: 'roles' },
  { pattern: /^\/super-admin\/settings$/,    pageType: 'settings' },
  { pattern: /^\/super-admin\/backup$/,      pageType: 'backup' },
  { pattern: /^\/super-admin\/monitoring$/,  pageType: 'monitoring' },
  { pattern: /^\/super-admin\/audit-logs$/,  pageType: 'auditLogs' },
  { pattern: /^\/super-admin\/notifications$/,pageType: 'notifications' },
  { pattern: /^\/super-admin\/profile$/,     pageType: 'profile' },
];

const TITLES = {
  dashboard:     'Super Admin Dashboard',
  roles:         'Role & Permission Management',
  settings:      'System Settings',
  backup:        'Backup & Restore',
  monitoring:    'Database & Server Monitoring',
  auditLogs:     'Audit Logs',
  notifications: 'Notifications',
  profile:       'Profile',
};

export function resolveSuperAdminPage(pathname) {
  for (const route of ROUTES) {
    const m = pathname.match(route.pattern);
    if (!m) continue;
    const pageType = route.pageType;
    return {
      pageType,
      params: {},
      title: TITLES[pageType] ?? 'Super Admin',
      breadcrumbs: [{ label: 'Dashboard', to: '/super-admin/dashboard' }, ...(pageType !== 'dashboard' ? [{ label: TITLES[pageType], to: `/super-admin/${pageType === 'auditLogs' ? 'audit-logs' : pageType}` }] : [])],
    };
  }
  return null;
}

export function isSuperAdminNavActive(fullPath, navTo) {
  const pathname = fullPath.split('?')[0];
  return pathname === navTo || (navTo !== '/super-admin/dashboard' && pathname.startsWith(navTo));
}
