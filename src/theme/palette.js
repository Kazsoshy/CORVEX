/**
 * CORVEX brand palette (TORIL-inspired).
 * Use CSS variables in stylesheets; use these hex values in JS (charts, maps, inline styles).
 */
export const palette = {
  navy: '#1A4162',
  cyan: '#408DAD',
  icy: '#DAF1F8',
  white: '#FFFFFF',
  midnight: '#0B1E30',
  mint: '#CEF3DF',
  powder: '#BADBE9',
};

/** Primary brand / headings / primary chart series */
export const brand = palette.navy;
/** Dark contrast — sidebar, strong text, selected map markers */
export const brandDark = palette.midnight;
/** Interactive / active / secondary chart series */
export const brandHover = palette.cyan;
/** Soft borders, gridlines, supporting chart fills */
export const chartMuted = palette.powder;
/** Subtle accent fill */
export const chartSoft = palette.icy;
/** Muted secondary text (inline styles) */
export const textMuted = '#5F7385';
/** Semantic status colors (text-only indicators) */
export const statusSuccess = '#047857';
export const statusWarning = '#b45309';
export const statusDanger = '#b91c1c';
export const statusInfo = palette.navy;

/** Default multi-series chart colors (brand-first) */
export const chartSeries = [
  palette.navy,
  palette.cyan,
  palette.midnight,
  textMuted,
  '#d97706',
  '#dc2626',
];

/** Map / staff differentiation — stays within brand + restrained accents */
export const mapSeries = [
  palette.navy,
  palette.cyan,
  palette.midnight,
  '#2A9B6A',
  '#d97706',
  '#0E7490',
  textMuted,
];
