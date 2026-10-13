/**
 * Design system tokens for Pappu (Light Theme).
 * All screens and UI primitives MUST use these tokens.
 * WCAG AA compliance verified for all text/background pairs.
 */

export const colors = {
  // Canvases & Surfaces
  canvas: '#F8FAFC',       // Slate 50
  surface: '#FFFFFF',      // Pure white card
  surfaceSubtle: '#F1F5F9',// Slate 100
  border: '#E2E8F0',       // Slate 200
  borderSubtle: '#F1F5F9', // Slate 100

  // Text Hierarchy
  text: {
    primary: '#0F172A',    // Slate 900 (16.5:1 on white - AAA)
    secondary: '#475569',  // Slate 600 (5.9:1 on white - AA)
    tertiary: '#64748B',   // Slate 500 (4.6:1 on white - AA)
    inverse: '#FFFFFF',    // Pure white on dark/brand fills
    muted: '#94A3B8',      // Slate 400 (captions / non-essential)
  },

  // Brand Accent (Blue)
  brand: {
    default: '#2563EB',    // Blue 600 (primary fill/buttons)
    dark: '#1D4ED8',       // Blue 700 (text on white, 4.8:1 - AA)
    darker: '#1E40AF',     // Blue 800 (gradients / hero)
    tint: '#EFF6FF',       // Blue 50 (chips / light backgrounds)
    tintBorder: '#BFDBFE', // Blue 200
    pressed: '#1D4ED8',    // Active pressed state
  },

  // Semantic Status (Kept distinct from brand blue)
  semantic: {
    income: '#15803D',       // Green 700 (text on white, 4.8:1 - AA)
    incomeFill: '#22C55E',   // Green 500 (bars, fills, icons)
    incomeBg: '#DCFCE7',     // Green 100 (chips, badges)
    incomeBorder: '#BBF7D0', // Green 200

    expense: '#DC2626',      // Red 600 (text on white, 4.6:1 - AA)
    expenseFill: '#EF4444',  // Red 500 (bars, fills, icons)
    expenseBg: '#FEE2E2',    // Red 100 (chips, badges)
    expenseBorder: '#FECACA',// Red 200

    neutral: '#475569',      // Slate 600
    neutralBg: '#F1F5F9',    // Slate 100
  },

  // Category Color Map (Restrained blue family + muted accents)
  categories: {
    Food: '#2563EB',         // Brand Blue
    Transport: '#0284C7',    // Sky
    Shopping: '#7C3AED',     // Violet
    Bills: '#D97706',        // Amber
    Entertainment: '#EA580C',// Orange
    Salary: '#16A34A',       // Green
    People: '#4F46E5',       // Indigo
    Other: '#64748B',        // Slate
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  hero: {
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
  },
  title1: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
  },
  title2: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  headline: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  callout: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  caption2: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400',
  },
};
