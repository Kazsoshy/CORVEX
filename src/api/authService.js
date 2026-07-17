import apiClient from './apiClient.js';

/**
 * Login with email and password.
 * On success, persists user info to localStorage.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: object, message?: string}>}
 */
export async function login(email, password) {
  const response = await apiClient.post('/api/auth/login', { email, password });
  const data = response.data;

  if (data.success && data.user) {
    localStorage.setItem('corvex_user', JSON.stringify(data.user));
  }

  return data;
}

/**
 * Clear the current session from localStorage.
 */
export function logout() {
  localStorage.removeItem('corvex_user');
  localStorage.removeItem('corvex_token');
}

/**
 * Return the currently stored user object, or null if not logged in.
 * @returns {object|null}
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('corvex_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Map a role slug from the API to the frontend route path prefix.
 */
const ROLE_SLUG_TO_PATH = {
  super_admin:       '/super-admin/dashboard',
  operating_manager: '/operating-manager/operations/dashboard',
  branch_manager:    '/branch-manager/dashboard',
  inventory_staff:   '/warehouse/dashboard',
  sales_staff:       '/sales/dashboard',
  collector:         '/collector/dashboard',
  client:            '/customer/home',
};

/**
 * Given a role slug from the API response, return the entry path for that role.
 * @param {string} roleSlug
 * @returns {string}
 */
export function getEntryPathForRole(roleSlug) {
  return ROLE_SLUG_TO_PATH[roleSlug] ?? '/login';
}

/**
 * Request a logout, triggering the global confirmation dialog.
 */
export function requestLogout() {
  window.dispatchEvent(new Event('request-logout'));
}
