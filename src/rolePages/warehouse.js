export const warehouseRole = {
  key: 'warehouse',
  label: 'Warehouse Staff',
  homePath: '/warehouse',
  entryPath: '/warehouse/dashboard',
  loginPath: '/warehouse',
  accent: 'Stock counts, restocks, transfers, and credit history',
  navPages: [
    { label: 'Dashboard',               to: '/warehouse/dashboard' },
    { label: 'Inventory',               to: '/warehouse/inventory' },
    { label: 'Stock Movements',         to: '/warehouse/movements' },
    { label: 'Transfers',               to: '/warehouse/transfers' },
    { label: 'Restock History',         to: '/warehouse/restock-history' },
    { label: 'Customer Credit History', to: '/warehouse/credit-history' },
    { label: 'Notifications',           to: '/warehouse/notifications' },
    { label: 'Profile',                 to: '/warehouse/profile' },
  ],
  routes: {},
};
