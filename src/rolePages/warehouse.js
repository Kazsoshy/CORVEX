export const warehouseRole = {
  key: 'warehouse',
  label: 'Warehouse Staff',
  homePath: '/warehouse',
  entryPath: '/warehouse/dashboard',
  loginPath: '/warehouse',
  accent: 'Stock counts, restocks, and transfers',
  navSections: [
    {
      title: 'Dashboard',
      items: [
        { label: 'Dashboard', to: '/warehouse/dashboard' },
      ],
    },
    {
      title: 'Daily Operations',
      items: [
        { label: 'Transfers', to: '/warehouse/transfers' },
        { label: 'Restock', to: '/warehouse/restock-history' },
        { label: 'Stock Counts', to: '/warehouse/stock-counts' },
      ],
    },
    {
      title: 'Stock',
      items: [
        { label: 'Branch Stock', to: '/warehouse/branch-stock' },
        { label: 'Stock Movements', to: '/warehouse/movements' },
        { label: 'Products', to: '/warehouse/products' },
      ],
    },
    {
      title: 'Master Data',
      items: [
        { label: 'Suppliers', to: '/warehouse/suppliers' },
        { label: 'Product Categories', to: '/warehouse/product-categories' },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Notifications', to: '/warehouse/notifications' },
        { label: 'Settings', to: '/warehouse/settings' },
        { label: 'Profile', to: '/warehouse/profile' },
      ],
    },
  ],
  navPages: [
    { label: 'Dashboard', to: '/warehouse/dashboard' },
    { label: 'Transfers', to: '/warehouse/transfers' },
    { label: 'Restock', to: '/warehouse/restock-history' },
    { label: 'Stock Counts', to: '/warehouse/stock-counts' },
    { label: 'Branch Stock', to: '/warehouse/branch-stock' },
    { label: 'Stock Movements', to: '/warehouse/movements' },
    { label: 'Products', to: '/warehouse/products' },
    { label: 'Suppliers', to: '/warehouse/suppliers' },
    { label: 'Product Categories', to: '/warehouse/product-categories' },
    { label: 'Notifications', to: '/warehouse/notifications' },
    { label: 'Settings', to: '/warehouse/settings' },
    { label: 'Profile', to: '/warehouse/profile' },
  ],
  routes: {},
};
