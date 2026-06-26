import { getAccountById, getReceiptById } from '../data/collectorMockData';

const ROUTE_DEFINITIONS = [
  { pattern: /^\/collector\/dashboard$/, pageType: 'dashboard' },
  { pattern: /^\/collector\/settings$/, pageType: 'settings' },
  { pattern: /^\/collector\/route\/map$/, pageType: 'routeMap' },
  { pattern: /^\/collector\/route\/summary$/, pageType: 'routeSummary' },
  { pattern: /^\/collector\/route$/, pageType: 'routeList' },
  { pattern: /^\/collector\/accounts$/, pageType: 'accounts' },
  { pattern: /^\/collector\/history$/, pageType: 'history' },
  { pattern: /^\/collector\/history\/([^/]+)$/, pageType: 'receiptDetails', params: ['receiptId'] },
  { pattern: /^\/collector\/notifications$/, pageType: 'notifications' },
  { pattern: /^\/collector\/profile$/, pageType: 'profile' },
  { pattern: /^\/collector\/account-detail\/(\d+)$/, pageType: 'accountDetail', params: ['accountId'] },
  { pattern: /^\/collector\/collection-log\/(\d+)$/, pageType: 'collectionLog', params: ['accountId'] },
  { pattern: /^\/collector\/receipt\/(\d+)$/, pageType: 'digitalReceipt', params: ['accountId'] },
  { pattern: /^\/collector\/ci-form\/(\d+)$/, pageType: 'ciForm', params: ['accountId'] },
  { pattern: /^\/collector\/incident\/(\d+)$/, pageType: 'incidentReport', params: ['accountId'] },
  { pattern: /^\/collector\/incident$/, pageType: 'incidentReportStandalone' },
];

export function matchCollectorRoute(pathname) {
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

export function getParentContext(search) {
  const params = new URLSearchParams(search);
  const from = params.get('from');
  if (from === 'route' || from === 'accounts') return from;
  return 'accounts';
}

export function buildCollectorBreadcrumbs(pageType, params = {}, parentContext = 'accounts') {
  const crumbs = [{ label: 'Dashboard', to: '/collector/dashboard' }];

  const account = params.accountId ? getAccountById(params.accountId) : null;
  const accountLabel = account?.clientName ?? 'Account Detail';

  switch (pageType) {
    case 'dashboard':
      return [{ label: 'Dashboard', to: '/collector/dashboard' }];

    case 'settings':
      return [
        ...crumbs,
        { label: 'Settings', to: '/collector/settings' },
      ];

    case 'routeList':
    case 'routeMap':
    case 'routeSummary':
      return [
        ...crumbs,
        { label: "Today's Route", to: '/collector/route' },
        ...(pageType === 'routeMap' ? [{ label: 'Route Map View', to: '/collector/route/map' }] : []),
        ...(pageType === 'routeSummary' ? [{ label: 'Route Summary', to: '/collector/route/summary' }] : []),
      ];

    case 'accounts':
      return [...crumbs, { label: 'Accounts', to: '/collector/accounts' }];

    case 'accountDetail': {
      const parentCrumb =
        parentContext === 'route'
          ? { label: "Today's Route", to: '/collector/route' }
          : { label: 'Accounts', to: '/collector/accounts' };
      return [...crumbs, parentCrumb, { label: accountLabel, to: `/collector/account-detail/${params.accountId}?from=${parentContext}` }];
    }

    case 'collectionLog':
      return [
        ...buildCollectorBreadcrumbs('accountDetail', params, parentContext).slice(0, -1),
        { label: accountLabel, to: `/collector/account-detail/${params.accountId}?from=${parentContext}` },
        { label: 'Collection Log', to: `/collector/collection-log/${params.accountId}?from=${parentContext}` },
      ];

    case 'digitalReceipt':
      return [
        ...buildCollectorBreadcrumbs('collectionLog', params, parentContext).slice(0, -1),
        { label: 'Collection Log', to: `/collector/collection-log/${params.accountId}?from=${parentContext}` },
        { label: 'Digital Receipt', to: `/collector/receipt/${params.accountId}?from=${parentContext}` },
      ];

    case 'ciForm':
      return [
        ...buildCollectorBreadcrumbs('accountDetail', params, parentContext).slice(0, -1),
        { label: accountLabel, to: `/collector/account-detail/${params.accountId}?from=${parentContext}` },
        { label: 'CI Form', to: `/collector/ci-form/${params.accountId}?from=${parentContext}` },
      ];

    case 'incidentReport':
      return [
        ...buildCollectorBreadcrumbs('accountDetail', params, parentContext).slice(0, -1),
        { label: accountLabel, to: `/collector/account-detail/${params.accountId}?from=${parentContext}` },
        { label: 'Incident Report', to: `/collector/incident/${params.accountId}?from=${parentContext}` },
      ];

    case 'incidentReportStandalone':
      return [...crumbs, { label: 'Incident Report', to: '/collector/incident' }];

    case 'history':
      return [...crumbs, { label: 'Collection History', to: '/collector/history' }];

    case 'receiptDetails': {
      const receipt = getReceiptById(params.receiptId);
      return [
        ...crumbs,
        { label: 'Collection History', to: '/collector/history' },
        { label: receipt?.receiptNumber ?? 'Receipt Details', to: `/collector/history/${params.receiptId}` },
      ];
    }

    case 'notifications':
      return [...crumbs, { label: 'Notifications', to: '/collector/notifications' }];

    case 'profile':
      return [...crumbs, { label: 'Profile', to: '/collector/profile' }];

    default:
      return crumbs;
  }
}

export function resolveCollectorPage(pathname, search = '') {
  const match = matchCollectorRoute(pathname);
  if (!match) return null;

  const parentContext = getParentContext(search);
  const breadcrumbs = buildCollectorBreadcrumbs(match.pageType, match.params, parentContext);

  const titles = {
    dashboard: 'Dashboard',
    settings: 'Settings',
    routeList: "Today's Route",
    routeMap: 'Route Map View',
    routeSummary: 'Route Summary',
    accounts: 'Accounts',
    accountDetail: 'Account Detail',
    collectionLog: 'Collection Log',
    digitalReceipt: 'Digital Receipt',
    ciForm: 'Credit Investigation Form',
    incidentReport: 'Incident Report',
    incidentReportStandalone: 'Incident Report',
    history: 'Collection History',
    receiptDetails: 'Receipt Details',
    notifications: 'Notifications',
    profile: 'Profile',
  };

  return {
    pageType: match.pageType,
    params: match.params,
    parentContext,
    breadcrumbs,
    title: titles[match.pageType] ?? 'Field Collector',
    badge: 'Field collector',
  };
}

export function isCollectorNavActive(fullPath, navTo) {
  const pathname = fullPath.split('?')[0];
  if (navTo === '/collector/dashboard') return pathname === '/collector/dashboard' || pathname === '/collector/settings';
  if (navTo === '/collector/route') return pathname.startsWith('/collector/route') || fullPath.includes('from=route');
  if (navTo === '/collector/accounts') return pathname === '/collector/accounts' || fullPath.includes('from=accounts');
  if (navTo === '/collector/history') return pathname.startsWith('/collector/history');
  if (navTo === '/collector/notifications') return pathname === '/collector/notifications';
  if (navTo === '/collector/profile') return pathname === '/collector/profile';
  return pathname === navTo || pathname.startsWith(`${navTo}/`);
}
