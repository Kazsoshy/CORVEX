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
  appearance: ['theme', 'density'],
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

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
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

export function getPreferences() {
  const store = storage();
  if (!store) return { ...DEFAULT_PREFERENCES };
  try {
    const raw = store.getItem(PREFERENCES_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* fall through to defaults */
  }
  return normalize(readLegacySeeds());
}

function mirrorLegacy(prefs) {
  const store = storage();
  if (!store) return;
  store.setItem('corvex_sales_offline', prefs.salesOffline ? '1' : '0');
  store.setItem('corvex_sales_autosync', prefs.salesAutoSync ? '1' : '0');
  store.setItem('corvex_sales_gps', prefs.salesGps ? '1' : '0');
  store.setItem('corvex_collector_autosync', prefs.collectorAutoSync ? '1' : '0');
  store.setItem('corvex_warehouse_barcode', prefs.warehouseBarcode ? '1' : '0');
  store.setItem('corvex_warehouse_low_stock', prefs.warehouseLowStock ? '1' : '0');
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
  const previous = getPreferences();
  const next = normalize({ ...previous, ...patch });
  const store = storage();
  if (store) store.setItem(PREFERENCES_KEY, JSON.stringify(next));
  mirrorLegacy(next);
  applyPreferences(next);
  const turnedSyncOn = (!previous.salesAutoSync && next.salesAutoSync)
    || (!previous.collectorAutoSync && next.collectorAutoSync);
  if (turnedSyncOn && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('corvex-session-ready'));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: next }));
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
  const store = storage();
  return store?.getItem('corvex_sidebar_collapsed') === 'true';
}

export function setSidebarCollapsedPref(collapsed) {
  const store = storage();
  if (store) store.setItem('corvex_sidebar_collapsed', collapsed ? 'true' : 'false');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT, { detail: Boolean(collapsed) }));
  }
}

if (typeof document !== 'undefined') {
  applyPreferences(getPreferences());
}
