import { getCreditRecordById, getProductById, getRestockById, getTransferById } from '../data/warehouseMockData';

const ROUTE_DEFINITIONS = [
  { pattern: /^\/warehouse\/dashboard$/, pageType: 'dashboard' },
  { pattern: /^\/warehouse\/settings$/, pageType: 'settings' },
  { pattern: /^\/warehouse\/inventory$/, pageType: 'branchInventory' },
  { pattern: /^\/warehouse\/branch-inventory$/, pageType: 'branchInventory' },
  { pattern: /^\/warehouse\/products$/, pageType: 'products' },
  { pattern: /^\/warehouse\/add-product$/, pageType: 'addProduct' },
  { pattern: /^\/warehouse\/product\/([^/]+)\/stock-count$/, pageType: 'stockCount', params: ['productId'] },
  { pattern: /^\/warehouse\/product\/([^/]+)\/restock$/, pageType: 'restock', params: ['productId'] },
  { pattern: /^\/warehouse\/product\/([^/]+)\/transfer$/, pageType: 'transfer', params: ['productId'] },
  { pattern: /^\/warehouse\/product\/([^/]+)$/, pageType: 'productDetail', params: ['productId'] },
  { pattern: /^\/warehouse\/movements$/, pageType: 'movements' },
  { pattern: /^\/warehouse\/movements\/([^/]+)$/, pageType: 'movementDetail', params: ['movementId'] },
  { pattern: /^\/warehouse\/transfers$/, pageType: 'transfers' },
  { pattern: /^\/warehouse\/transfers\/([^/]+)$/, pageType: 'transferDetail', params: ['transferId'] },
  { pattern: /^\/warehouse\/restock-history$/, pageType: 'restockHistory' },
  { pattern: /^\/warehouse\/restock-history\/([^/]+)$/, pageType: 'restockDetail', params: ['restockId'] },
  { pattern: /^\/warehouse\/credit-history$/, pageType: 'creditHistory' },
  { pattern: /^\/warehouse\/credit-history\/([^/]+)$/, pageType: 'creditDetail', params: ['creditId'] },
  { pattern: /^\/warehouse\/notifications$/, pageType: 'notifications' },
  { pattern: /^\/warehouse\/profile$/, pageType: 'profile' },
  { pattern: /^\/warehouse\/audit-log$/, pageType: 'auditLog' },
  { pattern: /^\/warehouse\/reports$/, pageType: 'reports' },
  { pattern: /^\/warehouse\/suppliers$/, pageType: 'suppliers' },
  { pattern: /^\/warehouse\/suppliers\/([^/]+)$/, pageType: 'supplierDetail', params: ['supplierId'] },
];

export function matchWarehouseRoute(pathname) {
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

export function buildWarehouseBreadcrumbs(pageType, params = {}) {
  const crumbs = [{ label: 'Dashboard', to: '/warehouse/dashboard' }];
  const product = params.productId ? getProductById(params.productId) : null;
  const productLabel = product?.name ?? 'Product Detail';
  const transfer = params.transferId ? getTransferById(params.transferId) : null;
  const restock = params.restockId ? getRestockById(params.restockId) : null;

  switch (pageType) {
    case 'dashboard':
      return [{ label: 'Dashboard', to: '/warehouse/dashboard' }];
    case 'settings':
      return [...crumbs, { label: 'Settings', to: '/warehouse/settings' }];
    case 'branchInventory':
      return [...crumbs, { label: 'Branch Inventory', to: '/warehouse/branch-inventory' }];
    case 'products':
      return [...crumbs, { label: 'Products', to: '/warehouse/products' }];
    case 'addProduct':
      return [...crumbs, { label: 'Branch Inventory', to: '/warehouse/branch-inventory' }, { label: 'Add Product', to: '/warehouse/add-product' }];
    case 'productDetail':
      return [...crumbs, { label: 'Branch Inventory', to: '/warehouse/branch-inventory' }, { label: productLabel, to: `/warehouse/product/${params.productId}` }];
    case 'stockCount':
      return [
        ...buildWarehouseBreadcrumbs('productDetail', params).slice(0, -1),
        { label: productLabel, to: `/warehouse/product/${params.productId}` },
        { label: 'Stock Count', to: `/warehouse/product/${params.productId}/stock-count` },
      ];
    case 'restock':
      return [
        ...buildWarehouseBreadcrumbs('productDetail', params).slice(0, -1),
        { label: productLabel, to: `/warehouse/product/${params.productId}` },
        { label: 'Restock', to: `/warehouse/product/${params.productId}/restock` },
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
        { label: params.movementId ? `Movement #${params.movementId}` : 'Movement Detail', to: `/warehouse/movements/${params.movementId}` },
      ];
    case 'transfers':
      return [...crumbs, { label: 'Transfers', to: '/warehouse/transfers' }];
    case 'transferDetail':
      return [
        ...crumbs,
        { label: 'Transfers', to: '/warehouse/transfers' },
        { label: transfer?.id ?? 'Transfer Detail', to: `/warehouse/transfers/${params.transferId}` },
      ];
    case 'restockHistory':
      return [...crumbs, { label: 'Restock History', to: '/warehouse/restock-history' }];
    case 'restockDetail':
      return [
        ...crumbs,
        { label: 'Restock History', to: '/warehouse/restock-history' },
        { label: restock?.id ?? 'Restock Detail', to: `/warehouse/restock-history/${params.restockId}` },
      ];
    case 'creditHistory':
      return [...crumbs, { label: 'Customer Credit History', to: '/warehouse/credit-history' }];
    case 'creditDetail':
      return [...crumbs, { label: 'Customer Credit History', to: '/warehouse/credit-history' }, { label: 'Credit Record', to: `/warehouse/credit-history/${params.creditId}` }];
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
    default:
      return crumbs;
  }
}

export function resolveWarehousePage(pathname) {
  const match = matchWarehouseRoute(pathname);
  if (!match) return null;

  const breadcrumbs = buildWarehouseBreadcrumbs(match.pageType, match.params);
  const titles = {
    dashboard: 'Dashboard',
    settings: 'Settings',
    branchInventory: 'Branch Inventory',
    products: 'Products',
    addProduct: 'Add Product',
    productDetail: 'Product Detail',
    stockCount: 'Stock Count',
    restock: 'Restock',
    transfer: 'Transfer Stock',
    movements: 'Stock Movements',
    movementDetail: 'Movement Detail',
    transfers: 'Transfers',
    transferDetail: 'Transfer Detail',
    restockHistory: 'Restock History',
    restockDetail: 'Restock Detail',
    creditHistory: 'Customer Credit History',
    creditDetail: 'Credit Record',
    notifications: 'Notifications',
    profile: 'Profile',
    auditLog: 'Audit Log',
    reports: 'Reports',
    suppliers: 'Suppliers',
    supplierDetail: 'Supplier Detail',
  };

  return {
    pageType: match.pageType,
    params: match.params,
    breadcrumbs,
    title: titles[match.pageType] ?? 'Warehouse',
    badge: 'Warehouse staff',
  };
}

export function isWarehouseNavActive(fullPath, navTo) {
  const pathname = fullPath.split('?')[0];
  if (navTo === '/warehouse/dashboard') {
    return pathname === '/warehouse/dashboard' || pathname === '/warehouse/settings' || pathname === '/warehouse/audit-log' || pathname === '/warehouse/reports';
  }
  if (navTo === '/warehouse/branch-inventory') {
    return pathname === '/warehouse/branch-inventory'
      || pathname === '/warehouse/inventory'
      || pathname.startsWith('/warehouse/product/')
      || pathname === '/warehouse/add-product';
  }
  if (navTo === '/warehouse/products') return pathname === '/warehouse/products';
  if (navTo === '/warehouse/movements') return pathname.startsWith('/warehouse/movements');
  if (navTo === '/warehouse/transfers') return pathname.startsWith('/warehouse/transfers');
  if (navTo === '/warehouse/restock-history') return pathname.startsWith('/warehouse/restock-history');
  if (navTo === '/warehouse/suppliers') return pathname.startsWith('/warehouse/suppliers');
  if (navTo === '/warehouse/credit-history') return pathname.startsWith('/warehouse/credit-history');
  if (navTo === '/warehouse/notifications') return pathname === '/warehouse/notifications';
  if (navTo === '/warehouse/profile') return pathname === '/warehouse/profile';
  return pathname === navTo;
}
