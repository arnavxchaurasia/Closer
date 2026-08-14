import { Platform, TextStyle } from 'react-native';

// ─── Tab Bar Height ───────────────────────────────────────────────────────────
export const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 84 : 68;

// ─── Spacing & Radius ────────────────────────────────────────────────────────
export const space = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
} as const;

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 24, full: 999,
} as const;

// ─── Color Palettes ──────────────────────────────────────────────────────────
export const darkColors = {
  bg: '#12100E',
  surface: '#1C1916',
  surface2: '#251F1C',
  surface3: '#2E2722',
  rose: '#D97B66',
  roseDim: 'rgba(217,123,102,0.15)',
  gold: '#BFA67E',
  goldDim: 'rgba(191,166,126,0.15)',
  blue: '#6B9BF5',
  blueDim: 'rgba(107,155,245,0.15)',
  green: '#7AB88A',
  greenDim: 'rgba(122,184,138,0.15)',
  text: '#F5F0EC',
  textSec: '#C4AFA8',
  muted: '#7A6A64',
  line: 'rgba(245,240,236,0.08)',
  lineStr: 'rgba(245,240,236,0.14)',
  overlay: 'rgba(18,16,14,0.92)',
};

export const lightColors = {
  bg: '#F9F7F2',
  surface: '#FFFFFF',
  surface2: '#F0EDE8',
  surface3: '#E8E3DC',
  rose: '#D97B66',
  roseDim: 'rgba(217,123,102,0.12)',
  gold: '#BFA67E',
  goldDim: 'rgba(191,166,126,0.15)',
  blue: '#4B7BF5',
  blueDim: 'rgba(75,123,245,0.12)',
  green: '#5A8A6A',
  greenDim: 'rgba(90,138,106,0.12)',
  text: '#261C1A',
  textSec: '#6B5C58',
  muted: '#A89990',
  line: 'rgba(38,28,26,0.08)',
  lineStr: 'rgba(38,28,26,0.14)',
  overlay: 'rgba(249,247,242,0.92)',
};

export type Colors = typeof darkColors;

// ─── Typography factory (called by ThemeContext) ──────────────────────────────
export function makeTypography(c: Colors): Record<string, TextStyle> {
  return {
    h1: { fontSize: 30, fontWeight: '700', color: c.text, letterSpacing: -0.5 },
    h2: { fontSize: 24, fontWeight: '700', color: c.text, letterSpacing: -0.3 },
    h3: { fontSize: 20, fontWeight: '600', color: c.text },
    h4: { fontSize: 18, fontWeight: '600', color: c.text },
    body: { fontSize: 15, fontWeight: '400', color: c.text, lineHeight: 22 },
    bodyMd: { fontSize: 14, fontWeight: '400', color: c.textSec, lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '400', color: c.muted, lineHeight: 16 },
    label: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.4, textTransform: 'uppercase' },
    eyebrow: { fontSize: 11, fontWeight: '700', color: c.rose, letterSpacing: 1.5, textTransform: 'uppercase' },
  };
}
