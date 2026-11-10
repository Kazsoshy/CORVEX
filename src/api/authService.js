import apiClient from './apiClient.js';
import { clearIdleMarkers, stampSessionActivity } from './sessionActivity.js';

function normalizeSessionUser(user) {
  if (!user || typeof user !== 'object') return user;
  return {
    ...user,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

function writeSessionUser(user) {
  const next = normalizeSessionUser(user);
  localStorage.setItem('corvex_user', JSON.stringify(next));
  return next;
}

/**
 * Login with email and password.
 * On success, persists user info to localStorage.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: object, message?: string}>}
 */
export async function login(email, password) {
  const response = await apiClient.post('/auth/login', { email, password });
  const data = response.data;

  if (data.success && data.user && data.token) {
    writeSessionUser(data.user);
    localStorage.setItem('corvex_token', data.token);
    stampSessionActivity();
    window.dispatchEvent(new Event('corvex-session-ready'));
  }

  return data;
}

/**
 * Refresh effective permission codes from the API into the local session.
 * Call after Super Admin changes the signed-in user's grants, or on app load.
 */
export async function refreshSessionPermissions() {
  try {
    const response = await apiClient.get('/auth/permissions');
    if (!response.data?.success) return getCurrentUser();
    const prev = getCurrentUser() || {};
    return writeSessionUser({
      ...prev,
      permissions: response.data.data?.permissions || [],
    });
  } catch {
    return getCurrentUser();
  }
}

/**
 * Clear the current session from localStorage.
 * `notice` is shown on the next login screen.
 * `broadcastEnd` redirects every open view of this app to the login page.
 */
export function logout({ notice, broadcastEnd = false } = {}) {
  if (notice) sessionStorage.setItem('corvex_auth_notice', notice);
  localStorage.removeItem('corvex_user');
  localStorage.removeItem('corvex_token');
  clearIdleMarkers();
  window.dispatchEvent(new Event('corvex-signed-out'));
  if (broadcastEnd) window.dispatchEvent(new Event('session-ended'));
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
 * Sidebar / UI label for the user's assigned branch or location.
 * Uses the primary `user.branch` from login/profile; if multiple branches
 * are present on the session object, shows a concise summary.
 * @param {object|null|undefined} user
 * @returns {string}
 */
export function getUserAssignedLocation(user) {
  if (!user) return 'No Branch Assigned';

  const primaryName = String(user.branch?.name || user.branchName || '').trim();
  if (primaryName) return primaryName;

  const extra = Array.isArray(user.branches)
    ? user.branches
      .map((b) => (typeof b === 'string' ? b : b?.name))
      .map((n) => String(n || '').trim())
      .filter(Boolean)
    : [];

  if (extra.length === 1) return extra[0];
  if (extra.length > 1) return `${extra[0]} +${extra.length - 1}`;

  return 'No Branch Assigned';
}

/** Refresh stored session user after profile updates. */
export function persistCurrentUserFromProfile(profile) {
  if (!profile) return;
  const prev = getCurrentUser() || {};
  const fullName = (
    profile.full_name
    || [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
  writeSessionUser({
    ...prev,
    id: profile.user_id ?? prev.id,
    fullName: fullName || prev.fullName,
    email: profile.email ?? prev.email,
    phone: profile.phone ?? prev.phone,
    role: profile.role ?? prev.role,
    branch: profile.branch ?? prev.branch,
    hasAvatar: profile.has_avatar ?? prev.hasAvatar,
    permissions: Array.isArray(profile.permissions) ? profile.permissions : prev.permissions,
  });
}

/**
 * Map a role slug from the API to the frontend route path prefix.
 */
const ROLE_SLUG_TO_PATH = {
  super_admin:       '/super-admin/dashboard',
  operating_manager: '/operating-manager/dashboard',
  branch_manager:    '/branch-manager/dashboard',
  inventory_staff:   '/warehouse/dashboard',
  sales_staff:       '/sales/dashboard',
  collector:         '/collector/dashboard',
  customer:            '/customer/dashboard',
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
