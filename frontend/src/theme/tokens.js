/**
 * Design Tokens for Pappu Tactile Mascot Design System
 * Visual source of truth: Stitch Project 9429203517741760676 & design/spec/tokens.md
 * Strictly flat: gradients, glass, blur, glows, and ambient elevation are completely banned.
 */

export const colors = {
  // Canvas & Surfaces
  bg: '#FFF8E7',
  surface: '#FFFFFF',
  border: '#F0E4C8',

  // Primary Brand Accent & Tactile Edge
  gold: '#FFC83D',
  gold_edge: '#D99A00',
  goldEdge: '#D99A00',

  // Typography & Hairlines
  ink: '#1F2937',
  ink_muted: '#6B7280',
  inkMuted: '#6B7280',

  // Cashflow & Destructive Semantics
  income: '#1F8A5B',
  expense: '#E5484D',
  expense_edge: '#B4232A',
  expenseEdge: '#B4232A',

  // Secondary Accent & Interactive Links
  teal: '#0E7C86',

  // Flat Scrim (zero blur)
  dim_overlay: 'rgba(31, 41, 55, 0.40)',
  dimOverlay: 'rgba(31, 41, 55, 0.40)',

  // Category Taxonomy
  categories: {
    food: '#F97316',
    shopping: '#0E7C86',
    transport: '#38BDF8',
    people: '#8B5CF6',
    other: '#9CA3AF',
    Food: '#F97316',
    Shopping: '#0E7C86',
    Transport: '#38BDF8',
    People: '#8B5CF6',
    Other: '#9CA3AF',
  },

  // Backward compatibility aliases for existing unmigrated components
  canvas: '#FFF8E7',
  surfaceSubtle: '#FFF8E7',
  borderSubtle: '#F0E4C8',
  text: {
    primary: '#1F2937',
    secondary: '#6B7280',
    tertiary: '#6B7280',
    muted: '#6B7280',
    inverse: '#FFFFFF',
  },
  brand: {
    default: '#FFC83D',
    edge: '#D99A00',
    dark: '#D99A00',
    tint: '#FFF8E7',
    tintBorder: '#F0E4C8',
  },
  semantic: {
    income: '#1F8A5B',
    incomeFill: '#1F8A5B',
    incomeBg: '#FFF8E7',
    incomeBorder: '#F0E4C8',
    expense: '#E5484D',
    expenseFill: '#E5484D',
    expenseEdge: '#B4232A',
    expenseBg: '#FFF8E7',
    expenseBorder: '#F0E4C8',
    neutral: '#1F2937',
    neutralBg: '#FFF8E7',
  },
};

export const buttonEdgeColors = {
  primary: '#D99A00',
  secondary: '#F0E4C8',
  destructive: '#B4232A',
  destructive_outline: '#E5484D',
  destructiveOutline: '#E5484D',
};

export const spacing = {
  space_1: 4,
  space_2: 8,
  space_3: 12,
  space_4: 16,
  space_5: 20,
  space_6: 24,
  space_8: 32,

  // Named aliases
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
  radius_pill: 999,
  radius_card: 20,
  radius_button: 16,
  radius_input: 16,
  radius_small: 12,
  radius_screen: 40,

  // Named aliases
  pill: 999,
  card: 20,
  button: 16,
  input: 16,
  small: 12,
  screen: 40,
  sm: 12,
  md: 16,
  lg: 16,
  xl: 20,
  '2xl': 20,
  '3xl': 24,
  full: 999,
};

export const borderWidth = {
  border_thin: 1,
  border_standard: 2,
  border_heavy: 4,
  edge_button: 4,

  thin: 1,
  standard: 2,
  heavy: 4,
  buttonEdge: 4,
};

export const typography = {
  display_amount: {
    fontFamily: 'BalooChettan2_800ExtraBold',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
  },
  headline_h1: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
  },
  headline_h2: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  body_amount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  button_label: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  body_main: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  body_secondary: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption_bold: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  tab_label: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },

  // Malayalam typography with increased line heights to prevent descender clipping
  malayalam_h1: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
  },
  malayalam_h2: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
  malayalam_body: {
    fontFamily: 'NotoSansMalayalam_600SemiBold',
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '600',
  },
  malayalam_caption: {
    fontFamily: 'NotoSansMalayalam_600SemiBold',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },

  // Legacy mappings for backwards compatibility during incremental refactoring
  display: {
    fontFamily: 'BalooChettan2_800ExtraBold',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
  },
  title1: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
  },
  title2: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  headline: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  body: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  callout: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  caption2: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
  fonts: {
    display: 'BalooChettan2_800ExtraBold',
    displayBold: 'BalooChettan2_700Bold',
    body: 'Nunito_600SemiBold',
    bodyBold: 'Nunito_700Bold',
    malayalam: 'NotoSansMalayalam_600SemiBold',
  },
};
