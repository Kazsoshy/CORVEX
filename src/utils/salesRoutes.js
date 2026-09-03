import { getCustomerById, getProductById, getSaleById } from '../data/salesMockData';

const ROUTE_DEFINITIONS = [
  { pattern: /^\/sales\/dashboard$/, pageType: 'dashboard' },
  { pattern: /^\/sales\/settings$/, pageType: 'settings' },
  { pattern: /^\/sales\/schedule\/map$/, pageType: 'scheduleMap' },
  { pattern: /^\/sales\/schedule$/, pageType: 'scheduleList' },
  { pattern: /^\/sales\/customers$/, pageType: 'customers' },
  { pattern: /^\/sales\/customer-detail\/([^/]+)$/, pageType: 'customerDetail', params: ['customerId'] },
  { pattern: /^\/sales\/visit-log\/(\d+)$/, pageType: 'visitLog', params: ['customerId'] },
  { pattern: /^\/sales\/ci-form\/(\d+)$/, pageType: 'ciForm', params: ['customerId'] },
  { pattern: /^\/sales\/history$/, pageType: 'history' },
  { pattern: /^\/sales\/history\/([^/]+)$/, pageType: 'saleDetails', params: ['invoiceId'] },
  { pattern: /^\/sales\/inventory\/([^/]+)$/, pageType: 'productDetails', params: ['productId'] },
  { pattern: /^\/sales\/inventory$/, pageType: 'inventory' },
  { pattern: /^\/sales\/notifications$/, pageType: 'notifications' },
  { pattern: /^\/sales\/profile$/, pageType: 'profile' },
  { pattern: /^\/sales\/route-tracking$/, pageType: 'routeTracking' },
  { pattern: /^\/sales\/credit-history$/, pageType: 'creditHistory' },
  { pattern: /^\/sales\/credit-history\/([^/]+)$/, pageType: 'creditDetail', params: ['creditId'] },
  { pattern: /^\/sales\/audit-log$/, pageType: 'auditLog' },
];

export function matchSalesRoute(pathname) {
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
  if (from === 'schedule' || from === 'customers') return from;
  return 'customers';
}

export function buildSalesBreadcrumbs(pageType, params = {}, parentContext = 'customers') {
  const crumbs = [{ label: 'Dashboard', to: '/sales/dashboard' }];
  const customer = params.customerId ? getCustomerById(params.customerId) : null;
  const customerLabel = customer ? `${customer.first_name} ${customer.last_name}` : 'Customer Detail';
  const product = params.productId ? getProductById(params.productId) : null;
  const sale = params.invoiceId ? getSaleById(params.invoiceId) : null;

  const creditCrumbs = [{ label: 'Customer Credit History', to: '/sales/credit-history' }];

  switch (pageType) {
    case 'dashboard':
      return [{ label: 'Dashboard', to: '/sales/dashboard' }];

    case 'settings':
      return [...crumbs, { label: 'Settings', to: '/sales/settings' }];

    case 'scheduleList':
    case 'scheduleMap':
      return [
        ...crumbs,
        { label: "Today's Schedule", to: '/sales/schedule' },
        ...(pageType === 'scheduleMap' ? [{ label: 'Territory Map', to: '/sales/schedule/map' }] : []),
      ];

    case 'customers':
      return [...crumbs, { label: 'Customers', to: '/sales/customers' }];

    case 'customerDetail': {
      const parentCrumb =
        parentContext === 'schedule'
          ? { label: "Today's Schedule", to: '/sales/schedule' }
          : { label: 'Customers', to: '/sales/customers' };
      return [...crumbs, parentCrumb, { label: customerLabel, to: `/sales/customer-detail/${params.customerId}?from=${parentContext}` }];
    }

    case 'visitLog':
      return [
        ...buildSalesBreadcrumbs('customerDetail', params, parentContext).slice(0, -1),
        { label: customerLabel, to: `/sales/customer-detail/${params.customerId}?from=${parentContext}` },
        { label: 'Sales Visit Log', to: `/sales/visit-log/${params.customerId}?from=${parentContext}` },
      ];

    case 'ciForm':
      return [
        ...buildSalesBreadcrumbs('customerDetail', params, parentContext).slice(0, -1),
        { label: customerLabel, to: `/sales/customer-detail/${params.customerId}?from=${parentContext}` },
        { label: 'Credit Investigation Form', to: `/sales/ci-form/${params.customerId}?from=${parentContext}` },
      ];

    case 'history':
      return [...crumbs, { label: 'Sales History', to: '/sales/history' }];

    case 'saleDetails':
      return [
        ...crumbs,
        { label: 'Sales History', to: '/sales/history' },
        { label: sale?.invoiceNumber ?? 'Sales Details', to: `/sales/history/${params.invoiceId}` },
      ];

    case 'inventory':
      return [...crumbs, { label: 'Inventory', to: '/sales/inventory' }];

    case 'productDetails':
      return [
        ...crumbs,
        { label: 'Inventory', to: '/sales/inventory' },
        { label: product?.name ?? 'Product Details', to: `/sales/inventory/${params.productId}` },
      ];

    case 'creditHistory':
      return [...crumbs, ...creditCrumbs];

    case 'creditDetail':
      return [...crumbs, ...creditCrumbs, { label: 'Credit Record', to: `/sales/credit-history/${params.creditId}` }];

    case 'notifications':
      return [...crumbs, { label: 'Notifications', to: '/sales/notifications' }];

    case 'profile':
      return [...crumbs, { label: 'Profile', to: '/sales/profile' }];

    case 'routeTracking':
      return [...crumbs, { label: 'Route Tracking', to: '/sales/route-tracking' }];

    case 'auditLog':
      return [...crumbs, { label: 'Audit Log', to: '/sales/audit-log' }];

    default:
      return crumbs;
  }
}

export function resolveSalesPage(pathname, search = '') {
  const match = matchSalesRoute(pathname);
  if (!match) return null;

  const parentContext = getParentContext(search);
  const breadcrumbs = buildSalesBreadcrumbs(match.pageType, match.params, parentContext);

  const titles = {
    dashboard: 'Dashboard',
    settings: 'Settings',
    scheduleList: "Today's Schedule",
    scheduleMap: 'Territory Map',
    customers: 'Customers',
    customerDetail: 'Customer Detail',
    visitLog: 'Sales Visit Log',
    ciForm: 'Credit Investigation Form',
    history: 'Sales History',
    saleDetails: 'Sales Details',
    inventory: 'Inventory',
    productDetails: 'Product Details',
    notifications: 'Notifications',
    profile: 'Profile',
    routeTracking: 'Route Tracking',
    auditLog: 'Audit Log',
    creditHistory: 'Customer Credit History',
    creditDetail: 'Credit Record',
  };

  return {
    pageType: match.pageType,
    params: match.params,
    parentContext,
    breadcrumbs,
    title: titles[match.pageType] ?? 'Sales Agent',
    badge: 'Sales agent',
  };
}

export function isSalesNavActive(fullPath, navTo) {
  const pathname = fullPath.split('?')[0];
  if (navTo === '/sales/dashboard') return pathname === '/sales/dashboard' || pathname === '/sales/settings' || pathname === '/sales/route-tracking' || pathname === '/sales/audit-log';
  if (navTo === '/sales/schedule') return pathname.startsWith('/sales/schedule') || fullPath.includes('from=schedule');
  if (navTo === '/sales/customers') return pathname === '/sales/customers' || fullPath.includes('from=customers');
  if (navTo === '/sales/history') return pathname.startsWith('/sales/history');
  if (navTo === '/sales/inventory') return pathname.startsWith('/sales/inventory');
  if (navTo === '/sales/notifications') return pathname === '/sales/notifications';
  if (navTo === '/sales/credit-history') return pathname.startsWith('/sales/credit-history');
  if (navTo === '/sales/profile') return pathname === '/sales/profile';
  return pathname === navTo || pathname.startsWith(`${navTo}/`);
}
