import { getCurrentUser } from '../api/authService.js';

export function isSalesOfflineEnabled() {
  return localStorage.getItem('corvex_sales_offline') === '1';
}

export function isSalesAutoSyncEnabled() {
  return localStorage.getItem('corvex_sales_autosync') !== '0';
}

export function isCollectorAutoSyncEnabled() {
  return localStorage.getItem('corvex_collector_autosync') !== '0';
}

export function isAutoSyncEnabledForCurrentUser() {
  const slug = getCurrentUser()?.role?.slug;
  if (slug === 'sales_staff') return isSalesAutoSyncEnabled();
  if (slug === 'collector') return isCollectorAutoSyncEnabled();
  return true;
}
