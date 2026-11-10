export const collectorRole = {
  key: 'collector',
  label: 'Collector',
  homePath: '/collector',
  entryPath: '/collector/dashboard',
  loginPath: '/collector',
  accent: 'Field collection and route tracking',
  navSections: [
    {
      title: 'Dashboard',
      items: [
        { label: 'Dashboard', to: '/collector/dashboard' },
      ],
    },
    {
      title: 'Field Work',
      items: [
        { label: "Today's Route", to: '/collector/route' },
        { label: 'Field Activity Reports', to: '/collector/field-reports' },
      ],
    },
    {
      title: 'Customers & Collections',
      items: [
        { label: 'Customers', to: '/collector/accounts' },
        { label: 'Collection History', to: '/collector/history' },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Notifications', to: '/collector/notifications' },
        { label: 'Settings', to: '/collector/settings' },
        { label: 'Profile', to: '/collector/profile' },
      ],
    },
  ],
  navPages: [
    { label: 'Dashboard', to: '/collector/dashboard' },
    { label: "Today's Route", to: '/collector/route' },
    { label: 'Field Activity Reports', to: '/collector/field-reports' },
    { label: 'Customers', to: '/collector/accounts' },
    { label: 'Collection History', to: '/collector/history' },
    { label: 'Notifications', to: '/collector/notifications' },
    { label: 'Settings', to: '/collector/settings' },
    { label: 'Profile', to: '/collector/profile' },
  ],
  routes: {},
};
