/**
 * CORVEX official brand palette — TORIL BH Marketing.
 * Primary: Deep Navy Blue (#153450), Midnight Blue (#0B2133), Soft White (#F5FAFC).
 * Use CSS variables in stylesheets; use these hex values in JS (charts, maps, inline styles).
 */
export const palette = {
  navy: '#153450',
  midnight: '#0B2133',
  softWhite: '#F5FAFC',
  white: '#FFFFFF',
  slate: '#475569',
  muted: '#64748B',
  border: '#E2E8F0',
  grid: '#E2E8F0',
  // Legacy keys mapped to official brand / neutral tones (no Ocean Teal or Ice Blue)
  cyan: '#153450',
  icy: '#F5FAFC',
  mint: '#F5FAFC',
  powder: '#CBD5E1',
};

/** Primary brand / headings / primary chart series */
export const brand = palette.navy;
/** Dark contrast — active states, strong text, selected map markers */
export const brandDark = palette.midnight;
/** Interactive / hover / secondary chart series */
export const brandHover = palette.midnight;
/** Soft borders, gridlines, supporting chart fills */
export const chartMuted = palette.border;
/** Subtle surface fill */
export const chartSoft = palette.softWhite;
/** Muted secondary text (inline styles) */
export const textMuted = palette.muted;
/** Semantic status colors */
export const statusSuccess = '#15803d';
export const statusWarning = '#b45309';
export const statusDanger = '#b91c1c';
export const statusInfo = palette.navy;

/** Default multi-series chart colors (official brand + neutral hierarchy) */
export const chartSeries = [
  palette.navy,
  palette.midnight,
  '#334E68',
  '#64748B',
  '#94A3B8',
  '#b45309',
];

/** Map / staff differentiation — stays within brand + restrained accents */
export const mapSeries = [
  palette.navy,
  palette.midnight,
  '#334E68',
  '#475569',
  '#15803d',
  '#b45309',
  palette.muted,
];

