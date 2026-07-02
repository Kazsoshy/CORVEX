import { getBranchById as getOperatingBranchById } from '../data/operatingManagerMockData';
import { getCustomerRecordById } from '../data/operatingManagerMockData';
import { resolveAdminPage } from './adminRoutes';
import { resolveBranchManagerPage } from './branchManagerRoutes';

const ROUTE_DEFINITIONS = [
  { pattern: /^\/operating-manager\/dashboard$/, pageType: 'dashboard' },
  { pattern: /^\/operating-manager\/branch-performance$/, pageType: 'branchPerformance' },
  { pattern: /^\/operating-manager\/branch-performance\/comparison$/, pageType: 'branchComparison' },
  { pattern: /^\/operating-manager\/branch-performance\/branch\/([^/]+)$/, pageType: 'branchDetail', params: ['branchId'] },
  { pattern: /^\/operating-manager\/branch-performance\/trends$/, pageType: 'historicalTrends' },
  { pattern: /^\/operating-manager\/gis$/, pageType: 'gisMap' },
  { pattern: /^\/operating-manager\/gis\/delinquency$/, pageType: 'gisDelinquency' },
  { pattern: /^\/operating-manager\/gis\/profitability$/, pageType: 'gisProfitability' },
  { pattern: /^\/operating-manager\/gis\/territory$/, pageType: 'gisTerritory' },
  { pattern: /^\/operating-manager\/reports$/, pageType: 'reports' },
  { pattern: /^\/operating-manager\/reports\/collections$/, pageType: 'reportCollections' },
  { pattern: /^\/operating-manager\/reports\/sales$/, pageType: 'reportSales' },
  { pattern: /^\/operating-manager\/reports\/inventory$/, pageType: 'reportInventory' },
  { pattern: /^\/operating-manager\/reports\/delinquency$/, pageType: 'reportDelinquency' },
  { pattern: /^\/operating-manager\/reports\/executive-summary$/, pageType: 'reportExecutive' },
  { pattern: /^\/operating-manager\/alerts$/, pageType: 'alerts' },
  { pattern: /^\/operating-manager\/notifications$/, pageType: 'notifications' },
  { pattern: /^\/operating-manager\/profile$/, pageType: 'profile' },
  { pattern: /^\/operating-manager\/customers$/, pageType: 'customers' },
  { pattern: /^\/operating-manager\/customers\/([^/]+)$/, pageType: 'customerDetail', params: ['customerId'] },
  // Legacy redirects support
  { pattern: /^\/operating-manager\/gis-map$/, pageType: 'gisMap' },
  { pattern: /^\/operating-manager\/compare$/, pageType: 'branchComparison' },
];

export function matchOperatingManagerRoute(pathname) {
  for (const route of ROUTE_DEFINITIONS) {
    const match = pathname.match(route.pattern);
    if (!match) continue;
    const params = {};
    route.params?.forEach((name, index) => {
      params[name] = match[index + 1];
    });
    return { pageType: route.pageType, params };
  }
  return null;
}

export function buildOperatingManagerBreadcrumbs(pageType, params = {}) {
  const crumbs = [{ label: 'Executive Dashboard', to: '/operating-manager/dashboard' }];
  const branch = params.branchId ? getOperatingBranchById(params.branchId) : null;
  const branchPerf = [{ label: 'Branch Performance', to: '/operating-manager/branch-performance' }];
  const gis = [{ label: 'GIS Intelligence', to: '/operating-manager/gis' }];
  const reports = [{ label: 'Reports & Analytics', to: '/operating-manager/reports' }];

  switch (pageType) {
    case 'dashboard':
      return [{ label: 'Executive Dashboard', to: '/operating-manager/dashboard' }];
    case 'branchPerformance':
      return [...crumbs, ...branchPerf];
    case 'branchComparison':
      return [...crumbs, ...branchPerf, { label: 'Branch Comparison', to: '/operating-manager/branch-performance/comparison' }];
    case 'branchDetail':
      return [...crumbs, ...branchPerf, { label: branch?.name ?? 'Branch Detail', to: `/operating-manager/branch-performance/branch/${params.branchId}` }];
    case 'historicalTrends':
      return [...crumbs, ...branchPerf, { label: 'Historical Trends', to: '/operating-manager/branch-performance/trends' }];
    case 'gisMap':
      return [...crumbs, ...gis];
    case 'gisDelinquency':
      return [...crumbs, ...gis, { label: 'Delinquency Heatmap', to: '/operating-manager/gis/delinquency' }];
    case 'gisProfitability':
      return [...crumbs, ...gis, { label: 'Profitability Analysis', to: '/operating-manager/gis/profitability' }];
    case 'gisTerritory':
      return [...crumbs, ...gis, { label: 'Territory Analysis', to: '/operating-manager/gis/territory' }];
    case 'reports':
      return [...crumbs, ...reports];
    case 'reportCollections':
      return [...crumbs, ...reports, { label: 'Collection Reports', to: '/operating-manager/reports/collections' }];
    case 'reportSales':
      return [...crumbs, ...reports, { label: 'Sales Reports', to: '/operating-manager/reports/sales' }];
    case 'reportInventory':
      return [...crumbs, ...reports, { label: 'Inventory Reports', to: '/operating-manager/reports/inventory' }];
    case 'reportDelinquency':
      return [...crumbs, ...reports, { label: 'Delinquency Reports', to: '/operating-manager/reports/delinquency' }];
    case 'reportExecutive':
      return [...crumbs, ...reports, { label: 'Executive Summary', to: '/operating-manager/reports/executive-summary' }];
    case 'alerts':
      return [...crumbs, { label: 'Alerts Center', to: '/operating-manager/alerts' }];
    case 'notifications':
      return [...crumbs, { label: 'Notifications', to: '/operating-manager/notifications' }];
    case 'profile':
      return [...crumbs, { label: 'Profile', to: '/operating-manager/profile' }];
    case 'customers':
      return [...crumbs, { label: 'Customer Records', to: '/operating-manager/customers' }];
    case 'customerDetail':
      return [...crumbs, { label: 'Customer Records', to: '/operating-manager/customers' }, { label: getCustomerRecordById(params.customerId)?.clientName ?? 'Customer Detail', to: `/operating-manager/customers/${params.customerId}` }];
    default:
      return crumbs;
  }
}

export function resolveOperatingManagerPage(pathname) {
  if (pathname.startsWith('/operating-manager/admin') || pathname.startsWith('/admin')) {
    const legacyPath = pathname.replace('/operating-manager/admin', '/admin');
    const resolved = resolveAdminPage(legacyPath);
    if (!resolved) return null;

    return {
      ...resolved,
      module: 'admin',
      title: ADMIN_TITLES[resolved.pageType] ?? resolved.title ?? 'Operating Manager',
      breadcrumbs: rewriteBreadcrumbs(resolved.breadcrumbs, '/admin', '/operating-manager/admin'),
      badge: 'Operating manager',
    };
  }

  if (pathname.startsWith('/operating-manager/operations') || pathname.startsWith('/branch-manager')) {
    const legacyPath = pathname.replace('/operating-manager/operations', '/branch-manager');
    const resolved = resolveBranchManagerPage(legacyPath);
    if (!resolved) return null;

    return {
      ...resolved,
      module: 'operations',
      title: OPERATION_TITLES[resolved.pageType] ?? resolved.title ?? 'Operating Manager',
      breadcrumbs: rewriteBreadcrumbs(resolved.breadcrumbs, '/branch-manager', '/operating-manager/operations'),
      badge: 'Operating manager',
    };
  }

  const match = matchOperatingManagerRoute(pathname);
  if (!match) return null;

  const titles = {
    dashboard: 'Executive Dashboard',
    branchPerformance: 'Branch Performance',
    branchComparison: 'Branch Comparison',
    branchDetail: 'Branch Detail',
    historicalTrends: 'Historical Trends',
    gisMap: 'GIS Intelligence',
    gisDelinquency: 'Delinquency Heatmap',
    gisProfitability: 'Profitability Analysis',
    gisTerritory: 'Territory Analysis',
    reports: 'Reports & Analytics',
    reportCollections: 'Collection Reports',
    reportSales: 'Sales Reports',
    reportInventory: 'Inventory Reports',
    reportDelinquency: 'Delinquency Reports',
    reportExecutive: 'Executive Summary',
    alerts: 'Alerts Center',
    notifications: 'Notifications',
    profile: 'Profile',
    customers: 'Customer Records',
    customerDetail: 'Customer Detail',
  };

  return {
    pageType: match.pageType,
    params: match.params,
    breadcrumbs: buildOperatingManagerBreadcrumbs(match.pageType, match.params),
    title: titles[match.pageType] ?? 'Operating Manager',
    badge: 'Operating manager',
    module: 'operating',
  };
}

export function isOperatingManagerNavActive(fullPath, navTo) {
  const pathname = normalizeOperatingManagerPath(fullPath.split('?')[0]);
  if (navTo === '/operating-manager/dashboard') {
    return pathname === '/operating-manager/dashboard';
  }
  if (navTo === '/operating-manager/branch-performance') {
    return pathname.startsWith('/operating-manager/branch-performance') || pathname === '/operating-manager/compare';
  }
  if (navTo === '/operating-manager/gis') {
    return pathname.startsWith('/operating-manager/gis') || pathname === '/operating-manager/gis-map';
  }
  if (navTo === '/operating-manager/reports') {
    return pathname.startsWith('/operating-manager/reports');
  }
  if (navTo === '/operating-manager/alerts') return pathname === '/operating-manager/alerts';
  if (navTo === '/operating-manager/notifications') return pathname === '/operating-manager/notifications';
  if (navTo === '/operating-manager/profile') return pathname === '/operating-manager/profile';
  if (navTo === '/operating-manager/customers') return pathname.startsWith('/operating-manager/customers');
  return pathname === navTo;
}

const ADMIN_TITLES = {
  dashboard: 'Administration Dashboard',
  userList: 'User Management',
  userForm: 'Add / Edit User',
  branchList: 'Branch Management',
  branchDetail: 'Branch Details',
  inventory: 'Inventory Management',
  reports: 'System Reports',
  auditLogs: 'Audit Logs',
  notifications: 'Notifications',
  profile: 'Profile',
};

const OPERATION_TITLES = {
  dashboard: 'Operations Dashboard',
  settings: 'Settings',
  approvalCenter: 'Approval Center',
  auditLog: 'Audit Log',
  fieldOperations: 'Field Operations',
  routePerformance: 'Route Performance',
  collectorRoutes: 'Collector Route Overview',
  collectorDetail: 'Collector Detail',
  salesSchedules: 'Sales Schedule Overview',
  salesAgentDetail: 'Sales Agent Detail',
  ciQueue: 'CI Approval Queue',
  ciDetail: 'CI Detail',
  gisMap: 'GIS & Location Intelligence',
  gisTerritory: 'Territory Map',
  gisDelinquency: 'Delinquency Heatmap',
  gisProfitability: 'Profitability Zones',
  accountLocationDetail: 'Account Location Detail',
  reports: 'Reports & Analytics',
  reportCollection: 'Collection Reports',
  reportSales: 'Sales Reports',
  reportInventory: 'Inventory Reports',
  reportDelinquency: 'Delinquency Reports',
  staffPerformance: 'Staff Performance',
  staffCollectors: 'Collector Performance',
  staffSales: 'Sales Agent Performance',
  staffScorecards: 'Performance Scorecards',
  alerts: 'Alerts & Exceptions',
  notifications: 'Notifications',
  profile: 'Profile',
};

function normalizeOperatingManagerPath(pathname) {
  if (pathname.startsWith('/admin')) return pathname.replace('/admin', '/operating-manager/admin');
  if (pathname.startsWith('/branch-manager')) return pathname.replace('/branch-manager', '/operating-manager/operations');
  return pathname;
}

function rewriteBreadcrumbs(items, fromPrefix, toPrefix) {
  return items?.map((item) => ({
    ...item,
    to: item.to?.startsWith(fromPrefix) ? item.to.replace(fromPrefix, toPrefix) : item.to,
  })) ?? [];
}
