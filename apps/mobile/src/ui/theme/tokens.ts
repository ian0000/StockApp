export const colors = Object.freeze({
  accent: '#16794a',
  accentPressed: '#0f623c',
  accentSoft: '#e4f2e9',
  background: '#f6f7f4',
  border: '#dde3dc',
  danger: '#a13b2b',
  onAccent: '#ffffff',
  surface: '#ffffff',
  surfaceMuted: '#eef1ec',
  text: '#19221c',
  textSecondary: '#667169',
});

export const spacing = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxxl: 40,
});

export const radii = Object.freeze({
  sm: 10,
  md: 14,
  lg: 20,
});

export const typography = Object.freeze({
  size: {
    caption: 12,
    body: 16,
    section: 18,
    display: 30,
    metric: 22,
  },
  weight: {
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
});
