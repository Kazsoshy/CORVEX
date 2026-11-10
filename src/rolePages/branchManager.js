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
      title: "Today's Field",
      items: [
        { label: 'Field Map', to: '/branch-manager/leaflet' },
        { label: 'Field Activity Reports', to: '/branch-manager/field-activity-reports' },
      ],
    },
    {
      title: 'People & Routes',
      items: [
        { label: 'Collectors', to: '/branch-manager/field-operations/collectors' },
        { label: 'Sales Agents', to: '/branch-manager/field-operations/sales' },
        { label: 'Territories', to: '/branch-manager/territories' },
      ],
    },
    {
      title: 'Customers & Credit',
      items: [
        { label: 'Customers', to: '/branch-manager/customers' },
        { label: 'Credit Reviews', to: '/branch-manager/ci-approvals' },
        { label: 'Credit History', to: '/branch-manager/credit-history' },
        { label: 'Approval Center', to: '/branch-manager/approval-center' },
      ],
    },
    {
      title: 'Branch Stock',
      items: [
        { label: 'Branch Inventory', to: '/branch-manager/branch-inventory' },
      ],
    },
    {
      title: 'Results',
      items: [
        { label: 'SAW Results', to: '/branch-manager/saw-results' },
        { label: 'Team Scorecards', to: '/branch-manager/staff-performance' },
        { label: 'Reports & Analytics', to: '/branch-manager/reports' },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Alerts & Exceptions', to: '/branch-manager/alerts' },
        { label: 'Audit Log', to: '/branch-manager/audit-log' },
        { label: 'Notifications', to: '/branch-manager/notifications' },
        { label: 'Settings', to: '/branch-manager/settings' },
      ],
    },
  ],
  navPages: [
    { label: 'Dashboard', to: '/branch-manager/dashboard' },
    { label: 'Field Map', to: '/branch-manager/leaflet' },
    { label: 'Field Activity Reports', to: '/branch-manager/field-activity-reports' },
    { label: 'Collectors', to: '/branch-manager/field-operations/collectors' },
    { label: 'Sales Agents', to: '/branch-manager/field-operations/sales' },
    { label: 'Territories', to: '/branch-manager/territories' },
    { label: 'Customers', to: '/branch-manager/customers' },
    { label: 'Credit Reviews', to: '/branch-manager/ci-approvals' },
    { label: 'Credit History', to: '/branch-manager/credit-history' },
    { label: 'Approval Center', to: '/branch-manager/approval-center' },
    { label: 'Branch Inventory', to: '/branch-manager/branch-inventory' },
    { label: 'SAW Results', to: '/branch-manager/saw-results' },
    { label: 'Team Scorecards', to: '/branch-manager/staff-performance' },
    { label: 'Reports & Analytics', to: '/branch-manager/reports' },
    { label: 'Alerts & Exceptions', to: '/branch-manager/alerts' },
    { label: 'Audit Log', to: '/branch-manager/audit-log' },
    { label: 'Notifications', to: '/branch-manager/notifications' },
    { label: 'Settings', to: '/branch-manager/settings' },
  ],
  routes: {},
};
