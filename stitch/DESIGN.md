---
name: Calm Financial Clarity
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#575f6a'
  on-secondary: '#ffffff'
  secondary-container: '#dce3f1'
  on-secondary-container: '#5d6570'
  tertiary: '#006243'
  on-tertiary: '#ffffff'
  tertiary-container: '#007d57'
  on-tertiary-container: '#bdffdc'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dce3f1'
  secondary-fixed-dim: '#c0c7d4'
  on-secondary-fixed: '#151c26'
  on-secondary-fixed-variant: '#404752'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  currency-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.01em
  currency-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.75rem
  margin: 1rem
  margin-md: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system is engineered for frictionless, voice-first expense management and peer balances in multilingual environments (English and Malayalam). The brand personality balances utmost transactional reliability with informal everyday agility: reassuring, approachable, crystal clear, and unobtrusive. 

The aesthetic is modern, fluid minimalism paired with delicate frosted glassmorphism. It strips away the ad-cluttered visual fatigue typical of regional payment platforms, delivering an uncluttered, premium white canvas that prioritizes quick balance comprehension and immediate voice interactions. High-contrast tabular numbers, friendly rounded geometry, soft ambient light, and distinct directional cues instill confidence without demanding visual effort.

## Colors

The color palette is built strictly for a dedicated light mode that feels airy, hygienic, and immediate.

- **Canvas & Surfaces:**
  - Base canvas: `#F5F7FB` provides a soothing, cool background that separates softly from floating layers.
  - Core card surfaces: `#FFFFFF` gives high-definition legibility and soft contrast against the canvas.
  - Border/Separators: `#E2E8F0` hairline strokes define subtle structural edges without visual noise.

- **Brand & Interaction Tokens:**
  - Primary Accent: `#2563EB` (confident royal blue) anchors actionable tap targets, active mic ripples, and primary touchpoints.
  - Secondary Tint: `#EAF1FF` acts as a soft companion for secondary button fills, active navigation backgrounds, pill tags, and transaction group markers.

- **Semantic Cashflow Tokens:**
  - Positive / Income / "Owes You": `#059669` (surface badge tint `#ECFDF5`). Always paired with a `+` symbol or an inward angled diagonal arrow (`↙`).
  - Negative / Expense / "You Owe": `#DC2626` (surface badge tint `#FEF2F2`). Always paired with a `-` symbol or an outward angled diagonal arrow (`↗`).

- **Typography & States:**
  - Primary text: `#0F172A` (deep slate navy) delivers WCAG AAA contrast against pure white cards.
  - Secondary & Muted text: `#64748B` anchors secondary timestamps, categories, and bilingual prompt guides.

## Typography

The type system blends **Plus Jakarta Sans** for welcoming, sculpted headings with **Inter** for readable body and data presentation. 

### Indian Currency & Number Formatting
- Currency amounts must consistently activate OpenType tabular figures (`font-variant-numeric: tabular-nums lining-nums`) to preserve alignment across scan lines.
- Indian numbering notation applies by default: `₹1,24,500` (thousands, lakhs, crores grouping).
- Suppress `.00` on whole integer sums (`₹450`, not `₹450.00`). Show fractional amounts only when balance paise exist (`₹450.50`).

### Script Handling & Vertical Metrics
- To accommodate Malayalam script diacritics and matras alongside English, body line-height tokens maintain a generous 1.55–1.6 ratio.
- Font clipping must be prevented by ensuring baseline vertical padding (`padding-top: 2px; padding-bottom: 2px`) inside compact list items and badge indicators.

## Layout & Spacing

This mobile-centric layout follows an elastic single-column approach optimized for one-hand operation:

- **Canvas Safe Envelopes:** Mobile viewport utilizes a consistent `16px` (`margin`) outer gutter, expanding to `24px` (`margin-md`) on larger viewports. Content rests constrained to a maximum centered width of `480px` on tablets/desktops to preserve natural ergonomics.
- **Rhythm & Grid:** Spacing adheres to a strict 4px/8px modular scale. Dense feed entries utilize `8px` (`space-sm`) vertical gaps, while grouped transactional cards isolate with `16px` (`space-lg`) to `24px` (`space-xl`) margins.
- **Dynamic Bottom Offset:** Bottom layout containers must reserve a permanent `96px` bottom inset clearance to account for the floating frosted glass navigation bar and iOS/Android home indicators.

## Elevation & Depth

Visual hierarchy uses soft ambient light and translucent glass rather than dark shadows or stark containment borders.

- **Surface Neutral (Ground):** Pure canvas `#F5F7FB`, flat, zero elevation.
- **Level 1 (Content Cards & Feeds):** Pure white `#FFFFFF` paired with an ultra-diffused, cool blue shadow: `box-shadow: 0 4px 20px -2px rgba(37, 99, 235, 0.04), 0 2px 6px -1px rgba(15, 23, 42, 0.02)`. Borders remain subtle via a 1px border of `#E2E8F0`.
- **Level 2 (Active/Hero Balance Card):** Frosted ambient illumination using `box-shadow: 0 12px 32px -4px rgba(37, 99, 235, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.03)`.
- **Level 3 (Floating Nav & Glass Sheets):** Translucent frosted glass defined by:
  - Background: `rgba(255, 255, 255, 0.72)`
  - Filter: `backdrop-filter: blur(16px) saturate(180%)`
  - Border: `1px solid rgba(255, 255, 255, 0.65)`
  - Shadow: `0 8px 32px 0 rgba(15, 23, 42, 0.08)`

## Shapes

The interface embraces organic, comfortable corner radii designed to feel friendly and safe:

- **Cards and Containers:** Primary surfaces feature a pronounced `20px` to `24px` corner radius (`rounded-xl` equivalent in this system), providing clean separation between cards.
- **Buttons & Interactive Chips:** All functional action buttons, pill tags, and filter triggers utilize a continuous pill radius (`rounded-full` / `9999px`).
- **Input Fields & Audio Waveform Bars:** Text and voice entry modules share `16px` rounded corners, keeping touch points inviting.

## Components

### Buttons
- **Primary Pill (48px):** Height `48px`, full pill radius, solid `#2563EB` fill, white `#FFFFFF` text, `label-md` weight. Subtle blue press state `#1D4ED8`.
- **Secondary Pill (48px):** Height `48px`, `#EAF1FF` background with `#2563EB` text.
- **Voice Action Button (Floating FAB):** Height and width `60px`, primary blue fill, circular with a 1.5px outline stroke microphone icon. When active/listening, it pulses with a multi-ring scale animation using `rgba(37, 99, 235, 0.2)`.

### Floating Glass Bottom Navigation
- Anchored 16px above the device bottom safe area. Width `calc(100% - 32px)`, max-width `420px`.
- Frosted glass finish (`rgba(255, 255, 255, 0.75)`, blur `16px`, hairline border `rgba(255, 255, 255, 0.6)`).
- 4 navigation items: **Home**, **Assistant**, **History**, **People**.
- Active tab features a subtle `#EAF1FF` pill background around icon and label with `#2563EB` coloring; inactive tabs use `#64748B`.

### Voice Input & Real-Time Waveform Sheet
- Bottom sheet slide-up using frosted backdrop. Displays real-time bilingual feedback ("Listening: ചായ 20 രൂപ..." / "Tea ₹20").
- Contains an audio visualizer composed of rounded pill bars (`3px` width) pulsing in `#2563EB` with `#EAF1FF` secondary peaks.

### Financial Feed & Transaction Lists
- White `20px` rounded cards housing item rows.
- Left-aligned clean outline category or contact avatar (`40px`, circle, `#F5F7FB` base).
- Right-aligned tabular currency:
  - Green `#059669` with `+ ₹450` for incoming splits / debts repaid.
  - Coral/Red `#DC2626` with `- ₹120` for self-spent expenses.
- Strictly no emojis. Visual categories rely on clean, monoline 1.75px stroke SVG icons.

### Split Chips & People Balances
- Contact list entries displaying shared balances:
  - "Owes you" tag: `#ECFDF5` background, `#059669` typography, subtle pill badge.
  - "You owe" tag: `#FEF2F2` background, `#DC2626` typography, subtle pill badge.
- Quick filter chips (`32px` height) with `#EAF1FF` fill when selected, `#FFFFFF` with `#E2E8F0` border when idle.