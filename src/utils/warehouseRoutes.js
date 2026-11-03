const ROUTE_DEFINITIONS = [
  { pattern: /^\/warehouse\/dashboard$/, pageType: 'dashboard' },
  { pattern: /^\/warehouse\/settings$/, pageType: 'settings' },
  { pattern: /^\/warehouse\/branch-stock$/, pageType: 'centralInventory' },
  { pattern: /^\/warehouse\/central-inventory$/, pageType: 'centralInventory' },
  { pattern: /^\/warehouse\/products$/, pageType: 'products' },
  { pattern: /^\/warehouse\/add-product$/, pageType: 'addProduct' },
  { pattern: /^\/warehouse\/product\/([^/]+)\/edit$/, pageType: 'editProduct', params: ['productId'] },
  { pattern: /^\/warehouse\/product\/([^/]+)\/stock-count$/, pageType: 'stockCount', params: ['productId'] },
  { pattern: /^\/warehouse\/product\/([^/]+)\/restock$/, pageType: 'restock', params: ['productId'] },
  { pattern: /^\/warehouse\/product\/([^/]+)\/transfer$/, pageType: 'transfer', params: ['productId'] },
  { pattern: /^\/warehouse\/product\/([^/]+)$/, pageType: 'productDetail', params: ['productId'] },
  { pattern: /^\/warehouse\/movements$/, pageType: 'movements' },
  { pattern: /^\/warehouse\/movements\/([^/]+)$/, pageType: 'movementDetail', params: ['movementId'] },
  { pattern: /^\/warehouse\/transfers\/new$/, pageType: 'transferRequestNew' },
  { pattern: /^\/warehouse\/transfers$/, pageType: 'transfers' },
  { pattern: /^\/warehouse\/transfers\/([^/]+)$/, pageType: 'transferDetail', params: ['transferId'] },
  { pattern: /^\/warehouse\/restock-history\/new$/, pageType: 'restockNew' },
  { pattern: /^\/warehouse\/restock-history$/, pageType: 'restockHistory' },
  { pattern: /^\/warehouse\/restock-history\/([^/]+)$/, pageType: 'restockDetail', params: ['restockId'] },
  { pattern: /^\/warehouse\/stock-counts\/new$/, pageType: 'stockCountNew' },
  { pattern: /^\/warehouse\/stock-counts$/, pageType: 'stockCountHistory' },
  { pattern: /^\/warehouse\/stock-counts\/([^/]+)$/, pageType: 'stockCountDetail', params: ['countId'] },
  { pattern: /^\/warehouse\/notifications$/, pageType: 'notifications' },
  { pattern: /^\/warehouse\/profile$/, pageType: 'profile' },
  { pattern: /^\/warehouse\/audit-log$/, pageType: 'auditLog' },
  { pattern: /^\/warehouse\/reports$/, pageType: 'reports' },
  { pattern: /^\/warehouse\/suppliers$/, pageType: 'suppliers' },
  { pattern: /^\/warehouse\/suppliers\/([^/]+)$/, pageType: 'supplierDetail', params: ['supplierId'] },
  { pattern: /^\/warehouse\/product-categories$/, pageType: 'productCategories' },
];

function normalizeWarehousePathname(pathname) {
  if (pathname === '/warehouse/transfer-requests') return '/warehouse/transfers';
  if (pathname === '/warehouse/transfer-requests/new') return '/warehouse/transfers/new';
  if (
    pathname === '/warehouse/branch-inventory'
    || pathname === '/warehouse/inventory'
    || pathname === '/warehouse/central-inventory'
  ) {
    return '/warehouse/branch-stock';
  }
  // Credit history is not part of the warehouse role — send old bookmarks to dashboard.
  if (pathname === '/warehouse/credit-history' || pathname.startsWith('/warehouse/credit-history/')) {
    return '/warehouse/dashboard';
  }
  const legacy = pathname.match(/^\/warehouse\/transfer-requests\/([^/]+)$/);
  if (legacy) return `/warehouse/transfers/${legacy[1]}`;
  return pathname;
}

/** Old warehouse URLs that should be replaced in the browser address bar. */
export function getWarehouseLegacyRedirect(pathname) {
  if (pathname === '/warehouse/credit-history' || pathname.startsWith('/warehouse/credit-history/')) {
    return '/warehouse/dashboard';
  }
  if (
    pathname === '/warehouse/central-inventory'
    || pathname === '/warehouse/branch-inventory'
    || pathname === '/warehouse/inventory'
  ) {
    return '/warehouse/branch-stock';
  }
  return null;
}

export function matchWarehouseRoute(pathname) {
  const normalized = normalizeWarehousePathname(pathname);
  for (const route of ROUTE_DEFINITIONS) {
    const match = normalized.match(route.pattern);
    if (!match) continue;
    const params = {};
    route.params?.forEach((name, index) => {
      params[name] = match[index + 1];
    });
    return { pageType: route.pageType, params };
  }
  return null;
}

export function buildWarehouseBreadcrumbs(pageType, params = {}) {
  const crumbs = [{ label: 'Dashboard', to: '/warehouse/dashboard' }];
  const productLabel = params.productId ? `Product #${params.productId}` : 'Product Detail';

  switch (pageType) {
    case 'dashboard':
      return [{ label: 'Dashboard', to: '/warehouse/dashboard' }];
    case 'settings':
      return [...crumbs, { label: 'Settings', to: '/warehouse/settings' }];
    case 'centralInventory':
      return [...crumbs, { label: 'Branch Stock', to: '/warehouse/branch-stock' }];
    case 'products':
      return [...crumbs, { label: 'Products', to: '/warehouse/products' }];
    case 'addProduct':
      return [...crumbs, { label: 'Products', to: '/warehouse/products' }, { label: 'Add Product', to: '/warehouse/add-product' }];
    case 'editProduct':
      return [
        ...crumbs,
        { label: 'Products', to: '/warehouse/products' },
        { label: productLabel, to: `/warehouse/product/${params.productId}` },
        { label: 'Edit', to: `/warehouse/product/${params.productId}/edit` },
      ];
    case 'productDetail':
      return [...crumbs, { label: 'Products', to: '/warehouse/products' }, { label: productLabel, to: `/warehouse/product/${params.productId}` }];
    case 'stockCount':
      return [
        ...crumbs,
        { label: 'Stock Counts', to: '/warehouse/stock-counts' },
        { label: 'New Stock Count', to: `/warehouse/product/${params.productId}/stock-count` },
      ];
    case 'stockCountHistory':
      return [...crumbs, { label: 'Stock Counts', to: '/warehouse/stock-counts' }];
    case 'stockCountNew':
      return [
        ...crumbs,
        { label: 'Stock Counts', to: '/warehouse/stock-counts' },
        { label: 'New Stock Count', to: '/warehouse/stock-counts/new' },
      ];
    case 'stockCountDetail':
      return [
        ...crumbs,
        { label: 'Stock Counts', to: '/warehouse/stock-counts' },
        { label: params.countId ? `Count #${params.countId}` : 'Count Detail', to: `/warehouse/stock-counts/${params.countId}` },
      ];
    case 'restock':
      return [
        ...crumbs,
        { label: 'Restock', to: '/warehouse/restock-history' },
        { label: 'New Restock', to: `/warehouse/product/${params.productId}/restock` },
      ];
    case 'transfer':
      return [
        ...buildWarehouseBreadcrumbs('productDetail', params).slice(0, -1),
        { label: productLabel, to: `/warehouse/product/${params.productId}` },
        { label: 'Transfer', to: `/warehouse/product/${params.productId}/transfer` },
      ];
    case 'movements':
      return [...crumbs, { label: 'Stock Movements', to: '/warehouse/movements' }];
    case 'movementDetail':
      return [
        ...crumbs,
        { label: 'Stock Movements', to: '/warehouse/movements' },
        { label: 'Transaction Detail', to: `/warehouse/movements/${params.movementId}` },
      ];
    case 'transferRequestNew':
      return [
        ...crumbs,
        { label: 'Transfers', to: '/warehouse/transfers' },
        { label: 'New Request', to: '/warehouse/transfers/new' },
      ];
    case 'transfers':
      return [...crumbs, { label: 'Transfers', to: '/warehouse/transfers' }];
    case 'transferDetail':
      return [
        ...crumbs,
        { label: 'Transfers', to: '/warehouse/transfers' },
        { label: params.transferId ? `Transfer #${params.transferId}` : 'Transfer Detail', to: `/warehouse/transfers/${params.transferId}` },
      ];
    case 'restockHistory':
      return [...crumbs, { label: 'Restock', to: '/warehouse/restock-history' }];
    case 'restockNew':
      return [
        ...crumbs,
        { label: 'Restock', to: '/warehouse/restock-history' },
        { label: 'New Restock', to: '/warehouse/restock-history/new' },
      ];
    case 'restockDetail':
      return [
        ...crumbs,
        { label: 'Restock', to: '/warehouse/restock-history' },
        { label: 'Restock Detail', to: `/warehouse/restock-history/${params.restockId}` },
      ];
    case 'notifications':
      return [...crumbs, { label: 'Notifications', to: '/warehouse/notifications' }];
    case 'profile':
      return [...crumbs, { label: 'Profile', to: '/warehouse/profile' }];
    case 'auditLog':
      return [...crumbs, { label: 'Audit Log', to: '/warehouse/audit-log' }];
    case 'reports':
      return [...crumbs, { label: 'Reports', to: '/warehouse/reports' }];
    case 'suppliers':
      return [...crumbs, { label: 'Suppliers', to: '/warehouse/suppliers' }];
    case 'supplierDetail':
      return [
        ...crumbs,
        { label: 'Suppliers', to: '/warehouse/suppliers' },
        { label: params.supplierId ? `Supplier #${params.supplierId}` : 'Supplier Detail', to: `/warehouse/suppliers/${params.supplierId}` },
      ];
    case 'productCategories':
      return [...crumbs, { label: 'Product Categories', to: '/warehouse/product-categories' }];
    default:
      return crumbs;
  }
}

export function resolveWarehousePage(pathname, search = '') {
  const match = matchWarehouseRoute(pathname);
  if (!match) return null;

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  let transferTab = searchParams.get('tab');
  if (!transferTab && pathname === '/warehouse/transfer-requests') transferTab = 'requests';
  if (transferTab !== 'history') transferTab = 'requests';

  const params = { ...match.params };
  if (match.pageType === 'transfers') {
    params.transferTab = transferTab;
    const segment = searchParams.get('segment') || 'Action required';
    params.transferSegment = [
      'Action required',
      'Awaiting approval',
      'Incoming',
      'All',
    ].includes(segment)
      ? segment
      : 'Action required';
  }
  if (match.pageType === 'centralInventory') {
    const stock = searchParams.get('stock') || 'All';
    if (['All', 'Attention', 'Out of Stock', 'Pending', 'Never Stocked', 'Low Stock', 'Critical Stock'].includes(stock)) {
      params.stockFilter = stock;
    } else if (stock === 'NeedsRestock' || stock === 'needs-restock') {
      params.stockFilter = 'Attention';
    } else {
      params.stockFilter = 'All';
    }
  }

  const breadcrumbs = buildWarehouseBreadcrumbs(match.pageType, params);
  const titles = {
    dashboard: 'Dashboard',
    settings: 'Settings',
    centralInventory: 'Branch Stock',
    products: 'Products',
    addProduct: 'Add Product',
    editProduct: 'Edit Product',
    productDetail: 'Product Detail',
    transferRequestNew: 'New Transfer Request',
    stockCount: 'Stock Count',
    stockCountHistory: 'Stock Counts',
    stockCountNew: 'New Stock Count',
    stockCountDetail: 'Stock Count Detail',
    restock: 'Restock',
    transfer: 'Transfer Stock',
    movements: 'Stock Movements',
    movementDetail: 'Transaction Detail',
    transfers: 'Transfers',
    transferDetail: 'Transfer Detail',
    restockHistory: 'Restock',
    restockNew: 'New Restock',
    restockDetail: 'Restock Detail',
    notifications: 'Notifications',
    profile: 'Profile',
    auditLog: 'Audit Log',
    reports: 'Reports',
    suppliers: 'Suppliers',
    supplierDetail: 'Supplier Detail',
    productCategories: 'Product Categories',
  };

  return {
    pageType: match.pageType,
    params,
    breadcrumbs,
    title: titles[match.pageType] ?? 'Warehouse',
    badge: 'Warehouse staff',
  };
}

export function isWarehouseNavActive(fullPath, navTo) {
  const pathname = fullPath.split('?')[0];
  if (navTo === '/warehouse/dashboard') {
    return pathname === '/warehouse/dashboard' || pathname === '/warehouse/audit-log' || pathname === '/warehouse/reports';
  }
  if (navTo === '/warehouse/branch-stock' || navTo === '/warehouse/central-inventory') {
    return pathname === '/warehouse/branch-stock'
      || pathname === '/warehouse/central-inventory'
      || pathname === '/warehouse/branch-inventory'
      || pathname === '/warehouse/inventory';
  }
  if (navTo === '/warehouse/products') {
    return pathname === '/warehouse/products'
      || pathname === '/warehouse/add-product'
      || (pathname.startsWith('/warehouse/product/')
        && !pathname.includes('/stock-count')
        && !pathname.includes('/restock')
        && !pathname.endsWith('/transfer'));
  }
  if (navTo === '/warehouse/movements') return pathname.startsWith('/warehouse/movements');
  if (navTo === '/warehouse/transfers') {
    return pathname.startsWith('/warehouse/transfers') || pathname.startsWith('/warehouse/transfer-requests');
  }
  if (navTo === '/warehouse/restock-history') return pathname.startsWith('/warehouse/restock-history');
  if (navTo === '/warehouse/stock-counts') {
    return pathname.startsWith('/warehouse/stock-counts')
      || (pathname.startsWith('/warehouse/product/') && pathname.includes('/stock-count'));
  }
  if (navTo === '/warehouse/suppliers') return pathname.startsWith('/warehouse/suppliers');
  if (navTo === '/warehouse/product-categories') return pathname.startsWith('/warehouse/product-categories');
  if (navTo === '/warehouse/notifications') return pathname === '/warehouse/notifications';
  if (navTo === '/warehouse/profile') return pathname === '/warehouse/profile';
  if (navTo === '/warehouse/settings') return pathname === '/warehouse/settings';
  return pathname === navTo;
}
