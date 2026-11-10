import { getCurrentUser } from '../api/authService.js';
import { getPreferences } from '../settings/preferences.js';

export function isSalesOfflineEnabled() {
  return getPreferences().salesOffline === true;
}

export function isSalesAutoSyncEnabled() {
  return getPreferences().salesAutoSync !== false;
}

export function isCollectorAutoSyncEnabled() {
  return getPreferences().collectorAutoSync !== false;
}

export function isAutoSyncEnabledForCurrentUser() {
  const slug = getCurrentUser()?.role?.slug;
  if (slug === 'sales_staff') return isSalesAutoSyncEnabled();
  if (slug === 'collector') return isCollectorAutoSyncEnabled();
  return true;
}
