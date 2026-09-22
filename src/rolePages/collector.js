export const collectorRole = {
  key: 'collector',
  label: 'Collector',
  homePath: '/collector',
  entryPath: '/collector/dashboard',
  loginPath: '/collector',
  accent: 'Field collection and route tracking',
  navPages: [
    { label: 'Dashboard', to: '/collector/dashboard' },
    { label: "Today's Route", to: '/collector/route' },
    { label: 'Field Activity Reports', to: '/collector/field-reports' },
    { label: 'Customers', to: '/collector/accounts' },
    { label: 'Collection History', to: '/collector/history' },
    { label: 'Digital Receipts', to: '/collector/receipts' },
    { label: 'Notifications', to: '/collector/notifications' },
    { label: 'Profile', to: '/collector/profile' },
  ],
  routes: {},
};
