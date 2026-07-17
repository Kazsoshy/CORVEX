export const branchManagerRole = {
  key: 'branchManager',
  label: 'Branch Manager',
  homePath: '/branch-manager',
  entryPath: '/branch-manager/dashboard',
  loginPath: '/branch-manager',
  // accent is shown in the sidebar header — branch name is injected at runtime
  // by App.jsx once the user object is available
  accent: 'Branch operations, field teams, and approvals',
  navSections: [
    {
      title: 'Dashboard',
      items: [
        { label: 'Dashboard', to: '/branch-manager/dashboard' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { label: 'Field Operations',               to: '/branch-manager/field-operations' },
        { label: 'Credit Investigation Approvals', to: '/branch-manager/ci-approvals' },
        { label: 'Approval Center',                to: '/branch-manager/approval-center' },
      ],
    },
    {
      title: 'Performance',
      items: [
        { label: 'Staff Performance',   to: '/branch-manager/staff-performance' },
        { label: 'Map',                 to: '/branch-manager/leaflet' },
        { label: 'Reports & Analytics', to: '/branch-manager/reports' },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Alerts & Exceptions', to: '/branch-manager/alerts' },
        { label: 'Audit Log',           to: '/branch-manager/audit-log' },
        { label: 'Notifications',       to: '/branch-manager/notifications' },
        { label: 'Settings',            to: '/branch-manager/settings' },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Profile', to: '/branch-manager/profile' },
      ],
    },
  ],
  navPages: [
    { label: 'Dashboard',                          to: '/branch-manager/dashboard' },
    { label: 'Field Operations',                   to: '/branch-manager/field-operations' },
    { label: 'Credit Investigation Approvals',     to: '/branch-manager/ci-approvals' },
    { label: 'Approval Center',                    to: '/branch-manager/approval-center' },
    { label: 'Staff Performance',                  to: '/branch-manager/staff-performance' },
    { label: 'Leaflet | OpenStreetMap',            to: '/branch-manager/leaflet' },
    { label: 'Reports & Analytics',                to: '/branch-manager/reports' },
    { label: 'Alerts & Exceptions',                to: '/branch-manager/alerts' },
    { label: 'Audit Log',                          to: '/branch-manager/audit-log' },
    { label: 'Notifications',                      to: '/branch-manager/notifications' },
    { label: 'Settings',                           to: '/branch-manager/settings' },
    { label: 'Profile',                            to: '/branch-manager/profile' },
  ],
  routes: {},
};
