import { getCurrentUser } from '../api/authService.js';
import { fetchMyPreferences, saveMyPreferences } from '../api/preferencesService.js';

export const PREFERENCES_KEY = 'corvex_user_preferences';
export const PREF_EVENT = 'corvex-preferences-changed';
export const SIDEBAR_EVENT = 'corvex-sidebar-preference';

export const TEXT_SCALES = [100, 112, 125, 150];

export const DEFAULT_PREFERENCES = {
  theme: 'light',
  density: 'comfortable',
  textScale: 100,
  lineSpacing: 'default',
  letterSpacing: 'default',
  readableFont: false,
  highContrast: false,
  underlineLinks: false,
  strongFocus: false,
  largeTargets: false,
  reduceMotion: 'system',
  colorPalette: 'standard',
  readingGuide: false,
  longerToasts: false,
  toastSound: false,
  desktopNotifications: false,
  salesOffline: false,
  salesAutoSync: true,
  salesGps: true,
  collectorAutoSync: true,
  warehouseBarcode: true,
  warehouseLowStock: true,
  sidebarCollapsed: false,
};

const BOOLEAN_KEYS = [
  'readableFont',
  'highContrast',
  'underlineLinks',
  'strongFocus',
  'largeTargets',
  'readingGuide',
  'longerToasts',
  'toastSound',
  'desktopNotifications',
  'salesOffline',
  'salesAutoSync',
  'salesGps',
  'collectorAutoSync',
  'warehouseBarcode',
  'warehouseLowStock',
  'sidebarCollapsed',
];

export const PREFERENCE_GROUPS = {
  accessibility: [
    'textScale',
    'lineSpacing',
    'letterSpacing',
    'readableFont',
    'highContrast',
    'underlineLinks',
    'strongFocus',
    'largeTargets',
    'reduceMotion',
    'colorPalette',
    'readingGuide',
    'longerToasts',
  ],
  appearance: ['theme', 'density', 'sidebarCollapsed'],
  notifications: ['toastSound', 'desktopNotifications'],
  workspace: [
    'salesOffline',
    'salesAutoSync',
    'salesGps',
    'collectorAutoSync',
    'warehouseBarcode',
    'warehouseLowStock',
  ],
};

export const WORKSPACE_FIELDS = {
  sales: [
    {
      key: 'salesOffline',
      label: 'Enable offline mode',
      detail: 'Keep a field report or a sale on this device when the server cannot be reached.',
    },
    {
      key: 'salesAutoSync',
      label: 'Auto-sync when online',
      detail: 'Send those saved records once this device is back online.',
    },
    {
      key: 'salesGps',
      label: 'Show GPS route tracking on the map',
      detail: 'Draw the route line on today’s schedule map and on Route Tracking.',
    },
  ],
  collector: [
    {
      key: 'collectorAutoSync',
      label: 'Auto-sync when online',
      detail: 'Send collections and field reports saved on this device once you are online.',
    },
  ],
  warehouse: [
    {
      key: 'warehouseBarcode',
      label: 'Enable barcode scanning',
      detail: 'Adds a scan field on the product list. Type or scan a SKU and press Enter to open that product.',
    },
    {
      key: 'warehouseLowStock',
      label: 'Low-stock alert notifications',
      detail: 'Show stock-threshold alerts on the warehouse dashboard.',
    },
  ],
};

let persistTimer = null;
let pendingPersistPrefs = null;

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function currentUserId() {
  const user = getCurrentUser();
  const id = user?.id ?? user?.user_id ?? null;
  if (id == null || id === '') return null;
  return String(id);
}

function preferencesStorageKey(userId = currentUserId()) {
  if (!userId) return null;
  return `${PREFERENCES_KEY}:${userId}`;
}

function sidebarStorageKey(userId = currentUserId()) {
  if (!userId) return null;
  return `corvex_sidebar_collapsed:${userId}`;
}

function readLegacySeeds() {
  const store = storage();
  if (!store) return {};
  const flag = (key, fallback = true) => {
    const value = store.getItem(key);
    if (value == null) return fallback;
    return value !== '0';
  };
  return {
    salesOffline: store.getItem('corvex_sales_offline') === '1',
    salesAutoSync: flag('corvex_sales_autosync', true),
    salesGps: flag('corvex_sales_gps', true),
    collectorAutoSync: flag('corvex_collector_autosync', true),
    warehouseBarcode: flag('corvex_warehouse_barcode', true),
    warehouseLowStock: flag('corvex_warehouse_low_stock', true),
    sidebarCollapsed: store.getItem('corvex_sidebar_collapsed') === 'true',
  };
}

function normalize(prefs) {
  const next = { ...DEFAULT_PREFERENCES, ...prefs };
  const scale = Number(next.textScale);
  next.textScale = TEXT_SCALES.includes(scale) ? scale : 100;
  if (!['system', 'light', 'dark'].includes(next.theme)) next.theme = 'system';
  if (!['comfortable', 'compact'].includes(next.density)) next.density = 'comfortable';
  if (!['default', 'relaxed', 'loose'].includes(next.lineSpacing)) next.lineSpacing = 'default';
  if (!['default', 'wide'].includes(next.letterSpacing)) next.letterSpacing = 'default';
  if (!['system', 'on', 'off'].includes(next.reduceMotion)) next.reduceMotion = 'system';
  if (!['standard', 'colorblind'].includes(next.colorPalette)) next.colorPalette = 'standard';
  BOOLEAN_KEYS.forEach((key) => {
    next[key] = Boolean(next[key]);
  });
  return next;
}

function readSharedLegacyBlob(store) {
  try {
    const raw = store.getItem(PREFERENCES_KEY);
    if (!raw) return null;
    return normalize({ ...readLegacySeeds(), ...JSON.parse(raw) });
  } catch {
    return null;
  }
}

function writeLocalPreferences(userId, prefs) {
  const store = storage();
  const key = preferencesStorageKey(userId);
  if (!store || !key) return;
  store.setItem(key, JSON.stringify(prefs));
  const sideKey = sidebarStorageKey(userId);
  if (sideKey) store.setItem(sideKey, prefs.sidebarCollapsed ? 'true' : 'false');
}

function readLocalPreferences(userId) {
  const store = storage();
  if (!store || !userId) return { ...DEFAULT_PREFERENCES };

  const key = preferencesStorageKey(userId);
  try {
    const raw = key ? store.getItem(key) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      const sideKey = sidebarStorageKey(userId);
      const sideRaw = sideKey ? store.getItem(sideKey) : null;
      if (sideRaw != null && parsed.sidebarCollapsed == null) {
        parsed.sidebarCollapsed = sideRaw === 'true';
      }
      return normalize(parsed);
    }
  } catch {
    /* adopt shared blob below */
  }

  // One-time adopt of the previous device-wide blob so existing customization is kept.
  const shared = readSharedLegacyBlob(store);
  if (shared) {
    writeLocalPreferences(userId, shared);
    return shared;
  }

  return normalize(readLegacySeeds());
}

function publishPreferences(next) {
  applyPreferences(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: next }));
    window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT, { detail: Boolean(next.sidebarCollapsed) }));
  }
  return next;
}

function scheduleServerPersist(userId, prefs) {
  if (!userId || typeof window === 'undefined') return;
  pendingPersistPrefs = prefs;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    const payload = pendingPersistPrefs;
    pendingPersistPrefs = null;
    if (!payload || currentUserId() !== String(userId)) return;
    saveMyPreferences(payload);
  }, 400);
}

export function getPreferences() {
  const userId = currentUserId();
  if (!userId) return { ...DEFAULT_PREFERENCES };
  return readLocalPreferences(userId);
}

export function resolveTheme(prefs = getPreferences()) {
  if (prefs.theme === 'dark') return 'dark';
  if (prefs.theme === 'light') return 'light';
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveReduceMotion(prefs = getPreferences()) {
  if (prefs.reduceMotion === 'on') return true;
  if (prefs.reduceMotion === 'off') return false;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureReadableFont(enabled) {
  if (typeof document === 'undefined') return;
  const id = 'corvex-readable-font';
  let link = document.getElementById(id);
  if (!enabled) {
    link?.remove();
    return;
  }
  if (link) return;
  link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);
}

export function applyPreferences(prefs = getPreferences()) {
  if (typeof document === 'undefined') return prefs;
  const root = document.documentElement;
  const theme = resolveTheme(prefs);
  root.dataset.theme = theme;
  root.dataset.textScale = String(prefs.textScale);
  root.dataset.line = prefs.lineSpacing;
  root.dataset.tracking = prefs.letterSpacing;
  root.dataset.density = prefs.density;
  root.dataset.readableFont = prefs.readableFont ? '1' : '0';
  root.dataset.contrast = prefs.highContrast ? 'high' : 'default';
  root.dataset.underlineLinks = prefs.underlineLinks ? '1' : '0';
  root.dataset.strongFocus = prefs.strongFocus ? '1' : '0';
  root.dataset.largeTargets = prefs.largeTargets ? '1' : '0';
  root.dataset.reduceMotion = resolveReduceMotion(prefs) ? '1' : '0';
  root.dataset.palette = prefs.colorPalette === 'colorblind' ? 'colorblind' : 'default';
  root.dataset.readingGuide = prefs.readingGuide ? '1' : '0';
  root.style.colorScheme = prefs.highContrast ? 'light' : theme;
  ensureReadableFont(prefs.readableFont);
  return prefs;
}

export function updatePreferences(patch) {
  const userId = currentUserId();
  const previous = getPreferences();
  const next = normalize({ ...previous, ...patch });
  if (userId) {
    writeLocalPreferences(userId, next);
    scheduleServerPersist(userId, next);
  }
  publishPreferences(next);
  const turnedSyncOn = (!previous.salesAutoSync && next.salesAutoSync)
    || (!previous.collectorAutoSync && next.collectorAutoSync);
  if (turnedSyncOn && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('corvex-session-ready'));
  }
  return next;
}

export function resetPreferenceGroup(group) {
  const keys = PREFERENCE_GROUPS[group] || [];
  const patch = {};
  keys.forEach((key) => {
    patch[key] = DEFAULT_PREFERENCES[key];
  });
  return updatePreferences(patch);
}

/**
 * Load preferences for the signed-in user from the server (authoritative),
 * falling back to this device's per-user local copy / defaults.
 */
export async function hydratePreferencesForCurrentUser() {
  const userId = currentUserId();
  if (!userId) {
    const defaults = { ...DEFAULT_PREFERENCES };
    publishPreferences(defaults);
    return defaults;
  }

  const local = readLocalPreferences(userId);
  const remote = await fetchMyPreferences();
  if (remote?.success && remote.data && typeof remote.data === 'object') {
    const next = normalize(remote.data);
    writeLocalPreferences(userId, next);
    return publishPreferences(next);
  }

  // No server row yet — keep local/defaults and seed the account record.
  writeLocalPreferences(userId, local);
  scheduleServerPersist(userId, local);
  return publishPreferences(local);
}

/** Reset the live UI to defaults without writing another user's store. */
export function clearActivePreferences() {
  if (persistTimer && typeof window !== 'undefined') {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  pendingPersistPrefs = null;
  return publishPreferences({ ...DEFAULT_PREFERENCES });
}

export function isSalesGpsEnabled() {
  return getPreferences().salesGps !== false;
}

export function isWarehouseBarcodeEnabled() {
  return getPreferences().warehouseBarcode !== false;
}

export function isWarehouseLowStockEnabled() {
  return getPreferences().warehouseLowStock !== false;
}

export function isSidebarCollapsedPref() {
  return getPreferences().sidebarCollapsed === true;
}

export function setSidebarCollapsedPref(collapsed) {
  return updatePreferences({ sidebarCollapsed: Boolean(collapsed) });
}

if (typeof document !== 'undefined') {
  applyPreferences(getPreferences());
}
