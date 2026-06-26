export const operatingManagerRole = {
  key: 'operatingManager',
  label: 'Operating Manager',
  homePath: '/operating-manager',
  entryPath: '/operating-manager/dashboard',
  loginPath: '/operating-manager',
  accent: 'Cross-branch performance and executive intelligence',
  navPages: [
    { label: 'Executive Dashboard', to: '/operating-manager/dashboard' },
    { label: 'Branch Performance', to: '/operating-manager/branch-performance' },
    { label: 'GIS Intelligence', to: '/operating-manager/gis' },
    { label: 'Reports & Analytics', to: '/operating-manager/reports' },
    { label: 'Alerts Center', to: '/operating-manager/alerts' },
    { label: 'Notifications', to: '/operating-manager/notifications' },
    { label: 'Profile', to: '/operating-manager/profile' },
  ],
  routes: {},
};
