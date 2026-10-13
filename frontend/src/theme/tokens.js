/**
 * Design system tokens for Pappu (Light Theme).
 * All screens and UI primitives MUST use these tokens.
 * WCAG AA compliance verified for all text/background pairs.
 */

export const colors = {
  // Canvases & Surfaces
  canvas: '#F5F7FB',       // Calming cool canvas
  surface: '#FFFFFF',      // Pure white card
  surfaceSubtle: '#F1F5F9',// Slate 100
  border: '#E2E8F0',       // Slate 200 hairline
  borderSubtle: '#F1F5F9', // Slate 100

  // Text Hierarchy
  text: {
    primary: '#0F172A',    // Slate 900 (AAA contrast on white)
    secondary: '#475569',  // Slate 600
    tertiary: '#64748B',   // Slate 500
    inverse: '#FFFFFF',    // Pure white on brand fills
    muted: '#94A3B8',      // Slate 400
  },

  // Brand Accent (Blue)
  brand: {
    default: '#2563EB',    // Confident royal blue
    dark: '#1D4ED8',       // Active press
    darker: '#1E40AF',     // Hero gradient accent
    tint: '#EAF1FF',       // Soft secondary tint / active nav pill
    tintBorder: '#BFDBFE', // Accent border
    pressed: '#1D4ED8',    // Pressed state
  },

  // Semantic Status (Cashflow Tokens)
  semantic: {
    income: '#15803D',       // Emerald 700 (4.8:1 on white - WCAG AA compliant text)
    incomeFill: '#059669',   // Emerald 600 (bars, fills, icons from DESIGN.md)
    incomeBg: '#ECFDF5',     // Emerald 50 surface badge tint from DESIGN.md
    incomeBorder: '#A7F3D0', // Emerald 200

    expense: '#DC2626',      // Red 600 (Expense / "You Owe")
    expenseFill: '#EF4444',  // Red 500
    expenseBg: '#FEF2F2',    // Red 50 surface badge tint
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
    Salary: '#059669',       // Emerald
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
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
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
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  floatingNav: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 10,
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
