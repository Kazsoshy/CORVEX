export const salesRole = {
  key: 'sales',
  label: 'Sales Agent',
  homePath: '/sales',
  entryPath: '/sales/dashboard',
  loginPath: '/sales',
  navPages: [
    { label: 'Dashboard', to: '/sales/dashboard' },
    { label: "Today's Schedule", to: '/sales/schedule' },
    { label: 'Customers', to: '/sales/customers' },
    { label: 'Customer Credit History', to: '/sales/credit-history' },
    { label: 'Sales History', to: '/sales/history' },
    { label: 'Inventory', to: '/sales/inventory' },
    { label: 'Notifications', to: '/sales/notifications' },
    { label: 'Profile', to: '/sales/profile' },
  ],
  routes: {},
};
