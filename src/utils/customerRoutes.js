import { getReceiptById, getStatementById } from '../data/customerMockData';

const ROUTE_DEFINITIONS = [
  { pattern: /^\/customer\/login$/, pageType: 'login' },
  { pattern: /^\/customer\/home$/, pageType: 'home' },
  { pattern: /^\/customer\/account-details$/, pageType: 'accountDetails' },
  { pattern: /^\/customer\/payment-history$/, pageType: 'paymentHistory' },
  { pattern: /^\/customer\/receipts$/, pageType: 'receipts' },
  { pattern: /^\/customer\/receipts\/([^/]+)$/, pageType: 'receiptDetail', params: ['receiptId'] },
  { pattern: /^\/customer\/statements$/, pageType: 'statements' },
  { pattern: /^\/customer\/statements\/([^/]+)$/, pageType: 'statementDetail', params: ['statementId'] },
  { pattern: /^\/customer\/notifications$/, pageType: 'notifications' },
  { pattern: /^\/customer\/profile$/, pageType: 'profile' },
];

export function matchCustomerRoute(pathname) {
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

export function buildCustomerBreadcrumbs(pageType, params = {}) {
  const crumbs = [{ label: 'Home', to: '/customer/home' }];
  const receipt = params.receiptId ? getReceiptById(params.receiptId) : null;
  const statement = params.statementId ? getStatementById(params.statementId) : null;

  switch (pageType) {
    case 'login':
      return [{ label: 'Login', to: '/customer/login' }];
    case 'home':
      return [{ label: 'Home', to: '/customer/home' }];
    case 'accountDetails':
      return [...crumbs, { label: 'Account Details', to: '/customer/account-details' }];
    case 'paymentHistory':
      return [...crumbs, { label: 'Payment History', to: '/customer/payment-history' }];
    case 'receipts':
      return [...crumbs, { label: 'Digital Receipts', to: '/customer/receipts' }];
    case 'receiptDetail':
      return [...crumbs, { label: 'Digital Receipts', to: '/customer/receipts' }, { label: receipt?.receiptNumber ?? 'Receipt', to: `/customer/receipts/${params.receiptId}` }];
    case 'statements':
      return [...crumbs, { label: 'Statements', to: '/customer/statements' }];
    case 'statementDetail':
      return [...crumbs, { label: 'Statements', to: '/customer/statements' }, { label: statement?.month ?? 'Statement', to: `/customer/statements/${params.statementId}` }];
    case 'notifications':
      return [...crumbs, { label: 'Notifications', to: '/customer/notifications' }];
    case 'profile':
      return [...crumbs, { label: 'Profile', to: '/customer/profile' }];
    default:
      return crumbs;
  }
}

export function resolveCustomerPage(pathname) {
  const match = matchCustomerRoute(pathname);
  if (!match) return null;

  const titles = {
    login: 'Customer Login',
    home: 'Home',
    accountDetails: 'Account Details',
    paymentHistory: 'Payment History',
    receipts: 'Digital Receipts',
    receiptDetail: 'Receipt Detail',
    statements: 'Statements',
    statementDetail: 'Statement Detail',
    notifications: 'Notifications',
    profile: 'Profile',
  };

  const descriptions = {
    login: 'Sign in with your account number and password or OTP.',
    home: 'Your account overview and quick actions.',
    accountDetails: 'View and update your account information.',
    paymentHistory: 'Complete record of payments received.',
    receipts: 'Digital receipts for all confirmed payments.',
    statements: 'Monthly account statements and summaries.',
    notifications: 'Payment reminders and account updates.',
    profile: 'Personal information and security settings.',
  };

  return {
    pageType: match.pageType,
    params: match.params,
    breadcrumbs: buildCustomerBreadcrumbs(match.pageType, match.params),
    title: titles[match.pageType] ?? 'Customer Portal',
    description: descriptions[match.pageType],
    badge: 'Customer portal',
  };
}

export function isCustomerNavActive(fullPath, navTo) {
  const pathname = fullPath.split('?')[0];
  if (navTo === '/customer/home') {
    return pathname === '/customer/home';
  }
  if (navTo === '/customer/receipts') {
    return pathname.startsWith('/customer/receipts');
  }
  if (navTo === '/customer/statements') {
    return pathname.startsWith('/customer/statements');
  }
  return pathname === navTo;
}

export function isCustomerAuthPath(pathname) {
  return pathname === '/customer/login';
}
