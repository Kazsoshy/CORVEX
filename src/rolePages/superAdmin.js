import { salesRole } from './sales';
import { collectorRole } from './collector';
import { warehouseRole } from './warehouse';
import { branchManagerRole } from './branchManager';
import { operatingManagerRole } from './operatingManager';
import { customerRole } from './customer';

const superAdminNavPages = [
  { label: 'Dashboard',              to: '/super-admin/dashboard' },
  { label: 'Users',                  to: '/super-admin/users' },
  { label: 'Role & Permissions',     to: '/super-admin/roles' },
  { label: 'System Settings',        to: '/super-admin/settings' },
  { label: 'Backup & Restore',       to: '/super-admin/backup' },
  { label: 'Database Monitoring',    to: '/super-admin/monitoring' },
  { label: 'Audit Logs',             to: '/super-admin/audit-logs' },
  { label: 'Notifications',          to: '/super-admin/notifications' },
  { label: 'Profile',                to: '/super-admin/profile' },
];

function getFunctionalModules(role) {
  // Filter out the main dashboard/home to only get functional modules
  return role.navPages
    .filter(p => !p.to.endsWith('/dashboard') && !p.to.endsWith('/home') && !p.label.toLowerCase().includes('profile'))
    .map(p => ({ ...p, to: `/super-admin${p.to}` }));
}

export const superAdminRole = {
  key: 'superAdmin',
  label: 'Super Admin',
  homePath: '/super-admin',
  entryPath: '/super-admin/dashboard',
  loginPath: '/super-admin',
  navPages: superAdminNavPages,
  navSections: [
    { title: 'Super Admin', items: superAdminNavPages },
    { title: 'Sales Modules', items: getFunctionalModules(salesRole) },
    { title: 'Collector Modules', items: getFunctionalModules(collectorRole) },
    { title: 'Warehouse Modules', items: getFunctionalModules(warehouseRole) },
    { title: 'Branch Manager', items: getFunctionalModules(branchManagerRole) },
    { title: 'Operating Manager', items: getFunctionalModules(operatingManagerRole) },
    { title: 'Customer Views', items: getFunctionalModules(customerRole) }
  ],
  routes: {},
};
