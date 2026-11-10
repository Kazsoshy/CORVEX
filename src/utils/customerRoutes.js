
const ROUTE_DEFINITIONS = [
  { pattern: /^\/customer\/login$/, pageType: 'login' },
  { pattern: /^\/customer\/(?:dashboard|home)$/, pageType: 'dashboard' },
  { pattern: /^\/customer\/(?:my-profile|profile|account-details)$/, pageType: 'profile' },
  { pattern: /^\/customer\/purchases$/, pageType: 'purchases' },
  { pattern: /^\/customer\/purchases\/([^/]+)$/, pageType: 'purchaseDetail', params: ['invoiceId'] },
  { pattern: /^\/customer\/balances$/, pageType: 'balances' },
  { pattern: /^\/customer\/payment-history$/, pageType: 'paymentHistory' },
  { pattern: /^\/customer\/receipts$/, pageType: 'receipts' },
  { pattern: /^\/customer\/receipts\/([^/]+)$/, pageType: 'receiptDetail', params: ['receiptId'] },
  { pattern: /^\/customer\/notifications$/, pageType: 'notifications' },
  { pattern: /^\/customer\/(?:account-settings|settings)$/, pageType: 'settings' },
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
  const crumbs = [{ label: 'Dashboard', to: '/customer/dashboard' }];
  const receiptLabel = params.receiptId ? `Receipt #${params.receiptId}` : 'Receipt';
  const invoiceLabel = params.invoiceId ? `Invoice ${params.invoiceId}` : 'Invoice';

  switch (pageType) {
    case 'login':
      return [{ label: 'Login', to: '/customer/login' }];
    case 'dashboard':
      return [{ label: 'Dashboard', to: '/customer/dashboard' }];
    case 'profile':
      return [...crumbs, { label: 'My Profile', to: '/customer/my-profile' }];
    case 'purchases':
      return [...crumbs, { label: 'My Purchases', to: '/customer/purchases' }];
    case 'purchaseDetail':
      return [...crumbs, { label: 'My Purchases', to: '/customer/purchases' }, { label: invoiceLabel, to: `/customer/purchases/${params.invoiceId}` }];
    case 'balances':
      return [...crumbs, { label: 'Outstanding Balances', to: '/customer/balances' }];
    case 'paymentHistory':
      return [...crumbs, { label: 'Payment History', to: '/customer/payment-history' }];
    case 'receipts':
      return [...crumbs, { label: 'Payment History', to: '/customer/payment-history' }, { label: 'Receipts', to: '/customer/receipts' }];
    case 'receiptDetail':
      return [...crumbs, { label: 'Payment History', to: '/customer/payment-history' }, { label: receiptLabel, to: `/customer/receipts/${params.receiptId}` }];
    case 'notifications':
      return [...crumbs, { label: 'Notifications', to: '/customer/notifications' }];
    case 'settings':
      return [...crumbs, { label: 'Account Settings', to: '/customer/account-settings' }];
    default:
      return crumbs;
  }
}

export function resolveCustomerPage(pathname) {
  const match = matchCustomerRoute(pathname);
  if (!match) return null;

  const titles = {
    login: 'Customer Login',
    dashboard: 'Dashboard',
    profile: 'My Profile',
    purchases: 'My Purchases',
    purchaseDetail: 'Invoice Details',
    balances: 'Outstanding Balances',
    paymentHistory: 'Payment History',
    receipts: 'Payment Receipts',
    receiptDetail: 'Receipt Detail',
    notifications: 'Notifications',
    settings: 'Account Settings',
  };

  const descriptions = {
    login: 'Sign in with your account number and password.',
    dashboard: 'Outstanding balance, purchases, payments, and upcoming due dates.',
    profile: 'Your customer record and account status.',
    purchases: 'Invoices, products, and payment status.',
    purchaseDetail: 'Products, quantities, and amounts on this invoice.',
    balances: 'Unpaid, partially paid, and overdue invoices.',
    paymentHistory: 'Payments, the invoices they covered, and receipts.',
    receipts: 'Digital receipts for confirmed payments.',
    notifications: 'Payment, invoice, due date, and account updates.',
    settings: 'Password, contact details, notifications, and sign out.',
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
  if (navTo === '/customer/dashboard') {
    return pathname === '/customer/dashboard' || pathname === '/customer/home';
  }
  if (navTo === '/customer/my-profile') {
    return pathname === '/customer/my-profile' || pathname === '/customer/profile' || pathname === '/customer/account-details';
  }
  if (navTo === '/customer/purchases') {
    return pathname.startsWith('/customer/purchases');
  }
  if (navTo === '/customer/payment-history') {
    return pathname === '/customer/payment-history' || pathname.startsWith('/customer/receipts');
  }
  if (navTo === '/customer/account-settings') {
    return pathname === '/customer/account-settings' || pathname === '/customer/settings';
  }
  return pathname === navTo;
}

export function isCustomerAuthPath(pathname) {
  return pathname === '/customer/login';
}
