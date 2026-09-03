export const collectorRole = {
  key: 'collector',
  label: 'Collector',
  homePath: '/collector',
  entryPath: '/collector/dashboard',
  loginPath: '/collector',
  navPages: [
    { label: 'Dashboard', to: '/collector/dashboard' },
    { label: "Today's Route", to: '/collector/route' },
    { label: 'Customers', to: '/collector/accounts' },
    { label: 'Collection History', to: '/collector/history' },
    { label: 'Notifications', to: '/collector/notifications' },
    { label: 'Profile', to: '/collector/profile' },
  ],
  routes: {},
};
