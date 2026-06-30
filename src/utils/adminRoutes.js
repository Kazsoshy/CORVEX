const ROUTES = [
  { pattern: /^\/admin\/dashboard$/,        pageType: 'dashboard' },
  { pattern: /^\/admin\/users$/,            pageType: 'userList' },
  { pattern: /^\/admin\/users\/add$/,       pageType: 'userForm', params: [] },
  { pattern: /^\/admin\/users\/([^/]+)$/,   pageType: 'userForm', params: ['userId'] },
  { pattern: /^\/admin\/branches$/,         pageType: 'branchList' },
  { pattern: /^\/admin\/branches\/([^/]+)$/, pageType: 'branchDetail', params: ['branchId'] },
  { pattern: /^\/admin\/inventory$/,        pageType: 'inventory' },
  { pattern: /^\/admin\/reports$/,          pageType: 'reports' },
  { pattern: /^\/admin\/audit-logs$/,       pageType: 'auditLogs' },
  { pattern: /^\/admin\/notifications$/,    pageType: 'notifications' },
  { pattern: /^\/admin\/profile$/,          pageType: 'profile' },
];

const TITLES = {
  dashboard:   'Admin Dashboard',
  userList:    'User Management',
  userForm:    'Add / Edit User',
  branchList:  'Branch Management',
  branchDetail:'Branch Details',
  inventory:   'Inventory Management',
  reports:     'System Reports',
  auditLogs:   'Audit Logs',
  notifications:'Notifications',
  profile:     'Profile',
};

export function resolveAdminPage(pathname) {
  for (const route of ROUTES) {
    const m = pathname.match(route.pattern);
    if (!m) continue;
    const params = {};
    route.params?.forEach((name, i) => { params[name] = m[i + 1]; });
    const pageType = route.pageType;
    return {
      pageType,
      params,
      title: TITLES[pageType] ?? 'Admin',
      breadcrumbs: buildCrumbs(pageType, params),
    };
  }
  return null;
}

function buildCrumbs(pageType, params) {
  const base = [{ label: 'Dashboard', to: '/admin/dashboard' }];
  switch (pageType) {
    case 'dashboard':    return base;
    case 'userList':     return [...base, { label: 'User Management', to: '/admin/users' }];
    case 'userForm':     return [...base, { label: 'User Management', to: '/admin/users' }, { label: 'Add / Edit User', to: '/admin/users/add' }];
    case 'branchList':   return [...base, { label: 'Branch Management', to: '/admin/branches' }];
    case 'branchDetail': return [...base, { label: 'Branch Management', to: '/admin/branches' }, { label: 'Branch Details', to: `/admin/branches/${params.branchId}` }];
    case 'inventory':    return [...base, { label: 'Inventory Management', to: '/admin/inventory' }];
    case 'reports':      return [...base, { label: 'System Reports', to: '/admin/reports' }];
    case 'auditLogs':    return [...base, { label: 'Audit Logs', to: '/admin/audit-logs' }];
    default:             return base;
  }
}

export function isAdminNavActive(fullPath, navTo) {
  const pathname = fullPath.split('?')[0];
  if (navTo === '/admin/dashboard') return pathname === '/admin/dashboard';
  if (navTo === '/admin/users')     return pathname.startsWith('/admin/users');
  if (navTo === '/admin/branches')  return pathname.startsWith('/admin/branches');
  if (navTo === '/admin/inventory') return pathname.startsWith('/admin/inventory');
  if (navTo === '/admin/reports')   return pathname.startsWith('/admin/reports');
  return pathname === navTo;
}
