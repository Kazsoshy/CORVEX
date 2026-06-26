export const warehouseRole = {
  key: 'warehouse',
  label: 'Warehouse Staff',
  homePath: '/warehouse',
  entryPath: '/warehouse/dashboard',
  loginPath: '/warehouse',
  accent: 'Stock counts, restocks, and transfers',
  navPages: [
    { label: 'Dashboard', to: '/warehouse/dashboard' },
    { label: 'Inventory', to: '/warehouse/inventory' },
    { label: 'Stock Movements', to: '/warehouse/movements' },
    { label: 'Transfers', to: '/warehouse/transfers' },
    { label: 'Restock History', to: '/warehouse/restock-history' },
    { label: 'Notifications', to: '/warehouse/notifications' },
    { label: 'Profile', to: '/warehouse/profile' },
  ],
  routes: {},
};
