export const salesRole = {
  key: 'sales',
  label: 'Sales Agent',
  homePath: '/sales',
  entryPath: '/sales/dashboard',
  loginPath: '/sales',
  accent: 'Visits, sales, and inventory awareness',
  navPages: [
    { label: 'Dashboard', to: '/sales/dashboard' },
    { label: "Today's Schedule", to: '/sales/schedule' },
    { label: 'Clients', to: '/sales/clients' },
    { label: 'Sales History', to: '/sales/history' },
    { label: 'Inventory', to: '/sales/inventory' },
    { label: 'Notifications', to: '/sales/notifications' },
    { label: 'Profile', to: '/sales/profile' },
  ],
  routes: {},
};
