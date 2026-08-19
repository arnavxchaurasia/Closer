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

// ─── UXPilot Theme Palettes (Matched to Togetherly / Dashboard Specs) ────────
export const darkColors = {
  bg: '#050510',              // Figma: Deep Space Black-Navy
  surface: '#0F0F22',         // Figma: Dark Navy Card Surface
  surface2: '#1A1A35',        // Figma: Secondary Card / Input Surface
  surface3: '#252545',        // Figma: Elevated Container Surface
  rose: '#F47B6A',            // Figma: Coral-Salmon Primary Accent
  roseDim: 'rgba(244,123,106,0.15)',
  gold: '#BFA67E',            // Champagne Gold Accent
  goldDim: 'rgba(191,166,126,0.15)',
  blue: '#6B6B9A',            // Muted Indigo
  blueDim: 'rgba(107,107,154,0.15)',
  green: '#7AB88A',
  greenDim: 'rgba(122,184,138,0.15)',
  text: '#F8FAFC',            // High Contrast Off-White
  textSec: '#9494B8',         // Secondary Text
  muted: '#6B6B8A',           // Figma: Muted Blue-Gray
  line: 'rgba(255,255,255,0.07)',
  lineStr: 'rgba(255,255,255,0.13)',
  overlay: 'rgba(5,5,16,0.94)',
};

export const lightColors = {
  bg: '#F9F7F2',              // UXPilot Cream Warm Paper
  surface: '#FFFFFF',         // Pure White Glass Card Surface
  surface2: '#F0EDE8',        // Soft Warm Secondary Input Surface
  surface3: '#E8E3DC',
  rose: '#D97B66',            // UXPilot Terracotta Rose Brand (#D97B66)
  roseDim: 'rgba(217,123,102,0.12)',
  gold: '#BFA67E',            // UXPilot Champagne Gold Accent (#BFA67E)
  goldDim: 'rgba(191,166,126,0.15)',
  blue: '#4F46E5',            // Indigo Accent
  blueDim: 'rgba(79,70,229,0.12)',
  green: '#5A8A6A',
  greenDim: 'rgba(90,138,106,0.12)',
  text: '#261C1A',            // UXPilot Deep Warm Dark Text (#261C1A)
  textSec: '#64748B',         // Secondary Text
  muted: '#94A3B8',           // Muted Metadata Text
  line: 'rgba(38,28,26,0.08)',
  lineStr: 'rgba(38,28,26,0.14)',
  overlay: 'rgba(249,247,242,0.92)',
};

export type Colors = typeof darkColors;

// ─── Typography factory (Figma & UXPilot matched metrics) ────────────────────
export function makeTypography(c: Colors): Record<string, TextStyle> {
  return {
    h1: { fontSize: 30, fontWeight: '700', color: c.text, letterSpacing: -0.5 },
    h2: { fontSize: 24, fontWeight: '700', color: c.text, letterSpacing: -0.3 },
    h3: { fontSize: 20, fontWeight: '600', color: c.text },
    h4: { fontSize: 18, fontWeight: '600', color: c.text },
    serifTitle: { fontSize: 24, fontWeight: '400', color: c.text, fontStyle: 'italic' },
    body: { fontSize: 15, fontWeight: '400', color: c.text, lineHeight: 22 },
    bodyMd: { fontSize: 14, fontWeight: '400', color: c.textSec, lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '400', color: c.muted, lineHeight: 16 },
    label: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.4, textTransform: 'uppercase' },
    eyebrow: { fontSize: 11, fontWeight: '700', color: c.rose, letterSpacing: 1.5, textTransform: 'uppercase' },
  };
}
