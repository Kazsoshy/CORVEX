export const operatingManagerRole = {
  key: 'operatingManager',
  label: 'Operating Manager',
  homePath: '/operating-manager',
  entryPath: '/operating-manager/dashboard',
  loginPath: '/operating-manager',
  accent: 'Cross-branch performance, administration, and field operations',
  navSections: [
    {
      title: 'Dashboard',
      items: [
        { label: 'Dashboard', to: '/operating-manager/dashboard' },
      ],
    },
    {
      title: 'User & Branch Management',
      items: [
        { label: 'User Management', to: '/operating-manager/admin/users' },
        { label: 'Branch Management', to: '/operating-manager/admin/branches' },
        { label: 'Customer Records', to: '/operating-manager/customers' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { label: 'Inventory Management', to: '/operating-manager/admin/inventory' },
        { label: 'Field Operations', to: '/operating-manager/operations/field-operations' },
        { label: 'Credit Investigation Approvals', to: '/operating-manager/operations/ci-approvals' },
        { label: 'Approval Center', to: '/operating-manager/operations/approval-center' },
      ],
    },
    {
      title: 'Monitoring & Performance',
      items: [
        { label: 'Branch Performance', to: '/operating-manager/branch-performance' },
        { label: 'Staff Performance', to: '/operating-manager/operations/staff-performance' },
        { label: 'Map', to: '/operating-manager/leaflet' },
        { label: 'Reports & Analytics', to: '/operating-manager/reports' },
        { label: 'Operations Reports', to: '/operating-manager/operations/reports' },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Administration', to: '/operating-manager/admin/dashboard' },
        { label: 'Audit Logs', to: '/operating-manager/admin/audit-logs' },
        { label: 'Alerts & Exceptions', to: '/operating-manager/operations/alerts' },
        { label: 'Notifications', to: '/operating-manager/notifications' },
        { label: 'System Configuration', to: '/operating-manager/operations/settings' },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Profile', to: '/operating-manager/profile' },
      ],
    },
  ],
  navPages: [
    { label: 'Dashboard', to: '/operating-manager/dashboard' },
    { label: 'User Management', to: '/operating-manager/admin/users' },
    { label: 'Branch Management', to: '/operating-manager/admin/branches' },
    { label: 'Customer Records', to: '/operating-manager/customers' },
    { label: 'Inventory Management', to: '/operating-manager/admin/inventory' },
    { label: 'Field Operations', to: '/operating-manager/operations/field-operations' },
    { label: 'Credit Investigation Approvals', to: '/operating-manager/operations/ci-approvals' },
    { label: 'Approval Center', to: '/operating-manager/operations/approval-center' },
    { label: 'Branch Performance', to: '/operating-manager/branch-performance' },
    { label: 'Staff Performance', to: '/operating-manager/operations/staff-performance' },
    { label: 'Leaflet | OpenStreetMap', to: '/operating-manager/leaflet' },
    { label: 'Reports & Analytics', to: '/operating-manager/reports' },
    { label: 'Operations Reports', to: '/operating-manager/operations/reports' },
    { label: 'Administration', to: '/operating-manager/admin/dashboard' },
    { label: 'Audit Logs', to: '/operating-manager/admin/audit-logs' },
    { label: 'Alerts & Exceptions', to: '/operating-manager/operations/alerts' },
    { label: 'Notifications', to: '/operating-manager/notifications' },
    { label: 'System Configuration', to: '/operating-manager/operations/settings' },
    { label: 'Profile', to: '/operating-manager/profile' },
  ],
  routes: {},
};
