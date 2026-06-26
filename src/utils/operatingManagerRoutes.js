import { getBranchById } from '../data/operatingManagerMockData';

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
  const branch = params.branchId ? getBranchById(params.branchId) : null;
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
    default:
      return crumbs;
  }
}

export function resolveOperatingManagerPage(pathname) {
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
  };

  return {
    pageType: match.pageType,
    params: match.params,
    breadcrumbs: buildOperatingManagerBreadcrumbs(match.pageType, match.params),
    title: titles[match.pageType] ?? 'Operating Manager',
    badge: 'Operating manager',
  };
}

export function isOperatingManagerNavActive(fullPath, navTo) {
  const pathname = fullPath.split('?')[0];
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
  return pathname === navTo;
}
