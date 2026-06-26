import { getCIById, getCollectorById, getMapAccountById, getSalesAgentById } from '../data/branchManagerMockData';

const ROUTE_DEFINITIONS = [
  { pattern: /^\/branch-manager\/dashboard$/, pageType: 'dashboard' },
  { pattern: /^\/branch-manager\/settings$/, pageType: 'settings' },
  { pattern: /^\/branch-manager\/approval-center$/, pageType: 'approvalCenter' },
  { pattern: /^\/branch-manager\/audit-log$/, pageType: 'auditLog' },
  { pattern: /^\/branch-manager\/field-operations$/, pageType: 'fieldOperations' },
  { pattern: /^\/branch-manager\/field-operations\/performance$/, pageType: 'routePerformance' },
  { pattern: /^\/branch-manager\/field-operations\/collectors$/, pageType: 'collectorRoutes' },
  { pattern: /^\/branch-manager\/field-operations\/collectors\/([^/]+)$/, pageType: 'collectorDetail', params: ['collectorId'] },
  { pattern: /^\/branch-manager\/field-operations\/sales$/, pageType: 'salesSchedules' },
  { pattern: /^\/branch-manager\/field-operations\/sales\/([^/]+)$/, pageType: 'salesAgentDetail', params: ['agentId'] },
  { pattern: /^\/branch-manager\/ci-approvals$/, pageType: 'ciQueue' },
  { pattern: /^\/branch-manager\/ci-approvals\/([^/]+)$/, pageType: 'ciDetail', params: ['ciId'] },
  { pattern: /^\/branch-manager\/gis$/, pageType: 'gisMap' },
  { pattern: /^\/branch-manager\/gis\/territory$/, pageType: 'gisTerritory' },
  { pattern: /^\/branch-manager\/gis\/delinquency$/, pageType: 'gisDelinquency' },
  { pattern: /^\/branch-manager\/gis\/profitability$/, pageType: 'gisProfitability' },
  { pattern: /^\/branch-manager\/gis\/account\/([^/]+)$/, pageType: 'accountLocationDetail', params: ['accountId'] },
  { pattern: /^\/branch-manager\/reports$/, pageType: 'reports' },
  { pattern: /^\/branch-manager\/reports\/collection$/, pageType: 'reportCollection' },
  { pattern: /^\/branch-manager\/reports\/sales$/, pageType: 'reportSales' },
  { pattern: /^\/branch-manager\/reports\/inventory$/, pageType: 'reportInventory' },
  { pattern: /^\/branch-manager\/reports\/delinquency$/, pageType: 'reportDelinquency' },
  { pattern: /^\/branch-manager\/staff-performance$/, pageType: 'staffPerformance' },
  { pattern: /^\/branch-manager\/staff-performance\/collectors$/, pageType: 'staffCollectors' },
  { pattern: /^\/branch-manager\/staff-performance\/sales$/, pageType: 'staffSales' },
  { pattern: /^\/branch-manager\/staff-performance\/scorecards$/, pageType: 'staffScorecards' },
  { pattern: /^\/branch-manager\/alerts$/, pageType: 'alerts' },
  { pattern: /^\/branch-manager\/notifications$/, pageType: 'notifications' },
  { pattern: /^\/branch-manager\/profile$/, pageType: 'profile' },
];

export function matchBranchManagerRoute(pathname) {
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

export function buildBranchManagerBreadcrumbs(pageType, params = {}) {
  const crumbs = [{ label: 'Dashboard', to: '/branch-manager/dashboard' }];
  const collector = params.collectorId ? getCollectorById(params.collectorId) : null;
  const agent = params.agentId ? getSalesAgentById(params.agentId) : null;
  const ci = params.ciId ? getCIById(params.ciId) : null;
  const account = params.accountId ? getMapAccountById(params.accountId) : null;

  const fieldOps = [{ label: 'Field Operations', to: '/branch-manager/field-operations' }];
  const ciCrumbs = [{ label: 'Credit Investigation Approvals', to: '/branch-manager/ci-approvals' }];
  const gisCrumbs = [{ label: 'GIS & Location Intelligence', to: '/branch-manager/gis' }];
  const reportsCrumbs = [{ label: 'Reports & Analytics', to: '/branch-manager/reports' }];
  const staffCrumbs = [{ label: 'Staff Performance', to: '/branch-manager/staff-performance' }];

  switch (pageType) {
    case 'dashboard': return [{ label: 'Dashboard', to: '/branch-manager/dashboard' }];
    case 'settings': return [...crumbs, { label: 'Settings', to: '/branch-manager/settings' }];
    case 'approvalCenter': return [...crumbs, { label: 'Approval Center', to: '/branch-manager/approval-center' }];
    case 'auditLog': return [...crumbs, { label: 'Audit Log', to: '/branch-manager/audit-log' }];
    case 'fieldOperations': return [...crumbs, ...fieldOps];
    case 'routePerformance': return [...crumbs, ...fieldOps, { label: 'Route Performance', to: '/branch-manager/field-operations/performance' }];
    case 'collectorRoutes': return [...crumbs, ...fieldOps, { label: 'Collector Route Overview', to: '/branch-manager/field-operations/collectors' }];
    case 'collectorDetail': return [...crumbs, ...fieldOps, { label: 'Collector Route Overview', to: '/branch-manager/field-operations/collectors' }, { label: collector?.name ?? 'Collector Detail', to: `/branch-manager/field-operations/collectors/${params.collectorId}` }];
    case 'salesSchedules': return [...crumbs, ...fieldOps, { label: 'Sales Schedule Overview', to: '/branch-manager/field-operations/sales' }];
    case 'salesAgentDetail': return [...crumbs, ...fieldOps, { label: 'Sales Schedule Overview', to: '/branch-manager/field-operations/sales' }, { label: agent?.name ?? 'Sales Agent Detail', to: `/branch-manager/field-operations/sales/${params.agentId}` }];
    case 'ciQueue': return [...crumbs, ...ciCrumbs];
    case 'ciDetail': return [...crumbs, ...ciCrumbs, { label: ci?.clientName ?? 'CI Detail', to: `/branch-manager/ci-approvals/${params.ciId}` }];
    case 'gisMap': return [...crumbs, ...gisCrumbs];
    case 'gisTerritory': return [...crumbs, ...gisCrumbs, { label: 'Territory Map', to: '/branch-manager/gis/territory' }];
    case 'gisDelinquency': return [...crumbs, ...gisCrumbs, { label: 'Delinquency Heatmap', to: '/branch-manager/gis/delinquency' }];
    case 'gisProfitability': return [...crumbs, ...gisCrumbs, { label: 'Profitability Zones', to: '/branch-manager/gis/profitability' }];
    case 'accountLocationDetail': return [...crumbs, ...gisCrumbs, { label: account?.clientName ?? 'Account Location', to: `/branch-manager/gis/account/${params.accountId}` }];
    case 'reports': return [...crumbs, ...reportsCrumbs];
    case 'reportCollection': return [...crumbs, ...reportsCrumbs, { label: 'Collection Reports', to: '/branch-manager/reports/collection' }];
    case 'reportSales': return [...crumbs, ...reportsCrumbs, { label: 'Sales Reports', to: '/branch-manager/reports/sales' }];
    case 'reportInventory': return [...crumbs, ...reportsCrumbs, { label: 'Inventory Reports', to: '/branch-manager/reports/inventory' }];
    case 'reportDelinquency': return [...crumbs, ...reportsCrumbs, { label: 'Delinquency Reports', to: '/branch-manager/reports/delinquency' }];
    case 'staffPerformance': return [...crumbs, ...staffCrumbs];
    case 'staffCollectors': return [...crumbs, ...staffCrumbs, { label: 'Collectors', to: '/branch-manager/staff-performance/collectors' }];
    case 'staffSales': return [...crumbs, ...staffCrumbs, { label: 'Sales Agents', to: '/branch-manager/staff-performance/sales' }];
    case 'staffScorecards': return [...crumbs, ...staffCrumbs, { label: 'Performance Scorecards', to: '/branch-manager/staff-performance/scorecards' }];
    case 'alerts': return [...crumbs, { label: 'Alerts & Exceptions', to: '/branch-manager/alerts' }];
    case 'notifications': return [...crumbs, { label: 'Notifications', to: '/branch-manager/notifications' }];
    case 'profile': return [...crumbs, { label: 'Profile', to: '/branch-manager/profile' }];
    default: return crumbs;
  }
}

export function resolveBranchManagerPage(pathname) {
  const match = matchBranchManagerRoute(pathname);
  if (!match) return null;

  const titles = {
    dashboard: 'Dashboard',
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

  return {
    pageType: match.pageType,
    params: match.params,
    breadcrumbs: buildBranchManagerBreadcrumbs(match.pageType, match.params),
    title: titles[match.pageType] ?? 'Branch Manager',
    badge: 'Branch manager',
  };
}

export function isBranchManagerNavActive(fullPath, navTo) {
  const pathname = fullPath.split('?')[0];
  if (navTo === '/branch-manager/dashboard') {
    return pathname === '/branch-manager/dashboard' || pathname === '/branch-manager/settings' || pathname === '/branch-manager/audit-log' || pathname === '/branch-manager/approval-center';
  }
  if (navTo === '/branch-manager/field-operations') return pathname.startsWith('/branch-manager/field-operations');
  if (navTo === '/branch-manager/ci-approvals') return pathname.startsWith('/branch-manager/ci-approvals');
  if (navTo === '/branch-manager/gis') return pathname.startsWith('/branch-manager/gis');
  if (navTo === '/branch-manager/reports') return pathname.startsWith('/branch-manager/reports');
  if (navTo === '/branch-manager/staff-performance') return pathname.startsWith('/branch-manager/staff-performance');
  if (navTo === '/branch-manager/alerts') return pathname === '/branch-manager/alerts';
  if (navTo === '/branch-manager/notifications') return pathname === '/branch-manager/notifications';
  if (navTo === '/branch-manager/profile') return pathname === '/branch-manager/profile';
  return pathname === navTo;
}
