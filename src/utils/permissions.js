/**
 * Frontend permission helpers for CORVEX catalog codes.
 * Codes come from login /auth/me and are stored on the session user.
 */

import { getCurrentUser } from '../api/authService.js';

/** Module view codes used by Super Admin navigation / route guards. */
export const SUPER_ADMIN_NAV_PERMISSIONS = {
  '/super-admin/dashboard': 'dashboard.view',
  '/super-admin/users': 'users.view',
  '/super-admin/roles': 'roles.view',
  '/super-admin/settings': 'settings.view',
  '/super-admin/backup': 'backup.view',
  '/super-admin/monitoring': 'monitoring.view',
  '/super-admin/security': 'security.view',
  '/super-admin/audit-logs': 'audit.view',
  '/super-admin/notifications': 'notifications.view',
};

/** Page type → required view permission */
export const SUPER_ADMIN_PAGE_PERMISSIONS = {
  dashboard: 'dashboard.view',
  users: 'users.view',
  roles: 'roles.view',
  settings: 'settings.view',
  backup: 'backup.view',
  monitoring: 'monitoring.view',
  security: 'security.view',
  auditLogs: 'audit.view',
  notifications: 'notifications.view',
  profile: null,
};

/** Manage-style codes that imply a view code. */
export const MANAGE_IMPLIES_VIEW = {
  'users.create': 'users.view',
  'users.edit': 'users.view',
  'users.disable': 'users.view',
  'users.activate': 'users.view',
  'roles.create': 'roles.view',
  'roles.edit': 'roles.view',
  'roles.delete': 'roles.view',
  'roles.assign': 'roles.view',
  'settings.update': 'settings.view',
  'backup.create': 'backup.view',
  'backup.restore': 'backup.view',
  'backup.download': 'backup.view',
  'monitoring.details': 'monitoring.view',
  'security.events': 'security.view',
  'security.manage': 'security.view',
  'audit.details': 'audit.view',
  'notifications.manage': 'notifications.view',
};

function permissionSet(user = getCurrentUser()) {
  if (!user) return null;
  if (user.role?.slug === 'super_admin') return null; // null = unrestricted
  const list = Array.isArray(user.permissions) ? user.permissions : [];
  return new Set(list);
}

/** True if the signed-in user has any of the listed permission codes. */
export function can(...codes) {
  const required = codes.flat().filter(Boolean);
  if (!required.length) return true;
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role?.slug === 'super_admin') return true;
  const set = permissionSet(user);
  if (!set) return false;
  return required.some((code) => set.has(code));
}

export function canAll(...codes) {
  const required = codes.flat().filter(Boolean);
  if (!required.length) return true;
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role?.slug === 'super_admin') return true;
  const set = permissionSet(user);
  if (!set) return false;
  return required.every((code) => set.has(code));
}

/** Filter Super Admin nav links by the current user's view permissions. */
export function filterNavByPermissions(links = [], user = getCurrentUser()) {
  if (!Array.isArray(links)) return [];
  if (user?.role?.slug === 'super_admin') return links;
  return links.filter((link) => {
    const code = link.permission || SUPER_ADMIN_NAV_PERMISSIONS[link.to];
    if (!code) return true;
    return can(code);
  });
}

export function canAccessSuperAdminPage(pageType, user = getCurrentUser()) {
  if (!pageType) return false;
  if (user?.role?.slug === 'super_admin') return true;
  if (pageType === 'profile') return true;
  const code = SUPER_ADMIN_PAGE_PERMISSIONS[pageType];
  if (!code) return true;
  return can(code);
}

/** First Super Admin destination the user is allowed to open. */
export function firstAllowedSuperAdminPath(user = getCurrentUser()) {
  const entries = Object.entries(SUPER_ADMIN_NAV_PERMISSIONS);
  for (const [path, code] of entries) {
    if (user?.role?.slug === 'super_admin' || can(code)) return path;
  }
  return '/super-admin/profile';
}
