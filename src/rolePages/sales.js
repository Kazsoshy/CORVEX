export const salesRole = {
  key: 'sales',
  label: 'Sales Agent',
  homePath: '/sales',
  entryPath: '/sales/dashboard',
  loginPath: '/sales',
  accent: 'Areas, sales, and inventory awareness',
  navSections: [
    {
      title: 'Dashboard',
      items: [
        { label: 'Dashboard', to: '/sales/dashboard' },
      ],
    },
    {
      title: 'Field Work',
      items: [
        { label: "Today's Schedule", to: '/sales/schedule' },
        { label: 'Log a Sale', to: '/sales/log-sale' },
        { label: 'Field Activity Reports', to: '/sales/field-reports' },
      ],
    },
    {
      title: 'Customers & Credit',
      items: [
        { label: 'Customers', to: '/sales/customers' },
        { label: 'Credit Reviews', to: '/sales/credit-investigations' },
        { label: 'Payment History', to: '/sales/credit-history' },
      ],
    },
    {
      title: 'Records & Stock',
      items: [
        { label: 'Sales History', to: '/sales/history' },
        { label: 'Inventory', to: '/sales/inventory' },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Notifications', to: '/sales/notifications' },
        { label: 'Settings', to: '/sales/settings' },
        { label: 'Profile', to: '/sales/profile' },
      ],
    },
  ],
  navPages: [
    { label: 'Dashboard', to: '/sales/dashboard' },
    { label: "Today's Schedule", to: '/sales/schedule' },
    { label: 'Log a Sale', to: '/sales/log-sale' },
    { label: 'Field Activity Reports', to: '/sales/field-reports' },
    { label: 'Customers', to: '/sales/customers' },
    { label: 'Credit Reviews', to: '/sales/credit-investigations' },
    { label: 'Payment History', to: '/sales/credit-history' },
    { label: 'Sales History', to: '/sales/history' },
    { label: 'Inventory', to: '/sales/inventory' },
    { label: 'Notifications', to: '/sales/notifications' },
    { label: 'Settings', to: '/sales/settings' },
    { label: 'Profile', to: '/sales/profile' },
  ],
  routes: {},
};
