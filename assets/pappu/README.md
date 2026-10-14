# Pappu Graphic Assets Manifest

This manifest catalogs all graphic assets extracted from the Stitch HTML design source (`design/stitch/character_sheet.html`, `home.html`, etc.) for the Pappu React Native Expo application.

All vector extractions adhere strictly to design fidelity rules: zero geometry changes, zero redraw/cleanup, zero gradients/shimmers, and full `react-native-svg` attribute compatibility (plain presentation attributes; no CSS classes, style blocks, or CSS variables).

---

## 1. Mascot Pose Catalog (SVG)

Extracted directly from `design/stitch/character_sheet.html`.
Base dimensions: `84px × 92px` (viewBox: `0 0 100 110`).

| Filename | Pose | Size | Contained Animation Groups (`id`) | Layer Separation Notes |
|:---|:---|:---|:---|:---|
| [`pappu-idle.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-idle.svg) | Idle | 1,638 B | `legs`, `arms`, `body`, `eyes`, `pupils`, `mouth` | Full clean separation across all groups. |
| [`pappu-listening.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-listening.svg) | Listening | 1,824 B | `legs`, `arms`, `extras`, `body`, `eyes`, `pupils`, `mouth` | `extras` contains sound wave arc (`#0E7C86`). Arm includes cupped ear gesture. |
| [`pappu-thinking.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-thinking.svg) | Thinking | 2,059 B | `legs`, `arms`, `body`, `eyes`, `pupils`, `mouth`, `extras` | Preserves 10° head tilt (`rotate(10 50 50)`). `extras` contains thought bubble circles. |
| [`pappu-speaking.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-speaking.svg) | Speaking | 1,750 B | `legs`, `arms`, `extras`, `body`, `eyes`, `pupils`, `mouth` | `extras` contains speech note glyph (`#0E7C86`). `mouth` is an open ellipse. |
| [`pappu-happy.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-happy.svg) | Happy | 1,733 B | `legs`, `extras`, `arms`, `body`, `eyes`, `mouth` | **Eyes note:** Eyes are joyful curved line arcs; no separate pupil elements exist in artwork. `extras` contains hop dust arcs. |
| [`pappu-excited.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-excited.svg) | Excited | 1,724 B | `legs`, `arms`, `extras`, `body`, `eyes`, `pupils`, `mouth` | `extras` contains pennant ribbon (`#1F8A5B`). Wide arms up celebration. |
| [`pappu-worried.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-worried.svg) | Worried | 1,992 B | `legs`, `arms`, `body`, `eyes`, `pupils`, `mouth`, `extras` | `extras` contains sweat drop (`#38BDF8`). `eyes` includes worried slanted eyebrows. |
| [`pappu-concerned.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-concerned.svg) | Concerned | 1,952 B | `legs`, `arms`, `extras`, `body`, `eyes`, `pupils`, `mouth` | `extras` contains held/floating coin prop (`#FFC83D` with ₹). `eyes` includes inward concern brows. |
| [`pappu-confused.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-confused.svg) | Confused | 1,887 B | `legs`, `arms`, `extras`, `body`, `eyes`, `pupils`, `mouth` | `extras` contains question mark (`?` in `#E5484D`). Asymmetrical brow and squint eye preserved. |
| [`pappu-sleepy.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/pappu-sleepy.svg) | Sleepy | 1,788 B | `legs`, `arms`, `extras`, `body`, `eyes`, `mouth` | **Eyes note:** Eyes are peaceful downward curved closed arcs; no separate pupil elements exist in artwork. `extras` contains "z" / "Z" float glyphs and snot bubble. |

---

## 2. Logo & Wordmark Specifications

### Coin Mark (Face Only)
- File: [`assets/pappu/svg/coin-mark.svg`](file:///Users/sangeethps/pappu/assets/pappu/svg/coin-mark.svg) (988 B)
- Dimensions: `100px × 100px` (viewBox: `0 0 100 100`)
- Visual: Mascot face mark only (Gold `#FFC83D` body circle `r=38`, dark slate border `#1F2937` stroke `4px`, inner rim `#D99A00` `r=30`, embossed ₹ forehead mark in `Baloo Chettan 2`, wide friendly eyes and curved smile).
- Scalability: Vector format scales losslessly to 32px (header mark), 48px (card avatar), 56px (tab bar center button), 200px (splash logo), and 1024px (icon master).

### Header Wordmark Treatment
Extracted from header component across Stitch HTML (`home.html`, `people.html`, `history.html`, `character_sheet.html`):
- Text: `Pappu`
- Font Family: `Baloo Chettan 2` (fallback: sans-serif)
- Font Weight: `800` (ExtraBold)
- Font Size:
  - Header Wordmark: `22px` (line-height: tight / leading-none)
  - Display Hero / Splash: `32px` (line-height: `36px`)
- Text Color: `#1F2937` (Ink Primary)
- Note: Wordmark is rendered directly as text in React Native with the custom font, accompanied by the coin mark.

---

## 3. Brand & App Icon Assets

| Filename | Purpose | Format / Resolution | Canvas / Safe Zone Notes |
|:---|:---|:---|:---|
| [`icon.svg`](file:///Users/sangeethps/pappu/assets/brand/icon.svg) | Master App Icon Vector | SVG (`1024×1024`) | Full-bleed gold background (`#FFC83D`) with centered face mark per sheet specification. |
| [`icon.png`](file:///Users/sangeethps/pappu/assets/brand/icon.png) | Master App Icon Raster | PNG (`1024×1024`, 62 KB) | High-resolution master raster export for iOS / Android store icons. |
| [`adaptive-icon-foreground.png`](file:///Users/sangeethps/pappu/assets/brand/adaptive-icon-foreground.png) | Android Adaptive Icon Foreground | PNG (`1024×1024`, 41 KB) | Transparent background. Mascot face mark centered within the 66% Android safe zone circle (diameter 640px) to prevent OS mask clipping. |
| [`splash-logo.png`](file:///Users/sangeethps/pappu/assets/brand/splash-logo.png) | Splash Screen Mascot Mark | PNG (`400×400`, 11 KB) | Transparent background with 200px coin mark centered, designed for display on the app's `#FFF8E7` splash background. |

---

## 4. PNG Fallback Renders

Transparent PNG exports generated at 120px and 360px:

| Pose | 120px Fallback (`120×132`) | 360px Fallback (`360×396`) |
|:---|:---|:---|
| Idle | [`pappu-idle-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-idle-120.png) (5.9 KB) | [`pappu-idle-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-idle-360.png) (21 KB) |
| Listening | [`pappu-listening-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-listening-120.png) (5.9 KB) | [`pappu-listening-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-listening-360.png) (21 KB) |
| Thinking | [`pappu-thinking-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-thinking-120.png) (6.5 KB) | [`pappu-thinking-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-thinking-360.png) (22 KB) |
| Speaking | [`pappu-speaking-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-speaking-120.png) (6.0 KB) | [`pappu-speaking-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-speaking-360.png) (21 KB) |
| Happy | [`pappu-happy-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-happy-120.png) (6.1 KB) | [`pappu-happy-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-happy-360.png) (19 KB) |
| Excited | [`pappu-excited-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-excited-120.png) (6.2 KB) | [`pappu-excited-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-excited-360.png) (22 KB) |
| Worried | [`pappu-worried-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-worried-120.png) (5.8 KB) | [`pappu-worried-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-worried-360.png) (21 KB) |
| Concerned | [`pappu-concerned-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-concerned-120.png) (5.8 KB) | [`pappu-concerned-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-concerned-360.png) (21 KB) |
| Confused | [`pappu-confused-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-confused-120.png) (6.0 KB) | [`pappu-confused-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-confused-360.png) (21 KB) |
| Sleepy | [`pappu-sleepy-120.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-sleepy-120.png) (6.6 KB) | [`pappu-sleepy-360.png`](file:///Users/sangeethps/pappu/assets/pappu/png/pappu-sleepy-360.png) (21 KB) |

---

## 5. Visual Quality & Rendering Verification

- Rendering Engine: Headless Google Chrome via Playwright (1x devicePixelRatio, standard browser SVG renderer).
- Comparison: Extracted SVGs vs Stitch HTML source crops.
- Result: **0.0000 mean difference, 0 differing pixels across all 10 poses** (100% bit-for-bit rendering match).
- Contact Sheet: [`design/spec/assets-contact-sheet.png`](file:///Users/sangeethps/pappu/design/spec/assets-contact-sheet.png) (`900×1350`, 84 KB).

---

## 6. Icon Library Mapping (Lucide Icons)

All UI icons across the Stitch HTML files follow Feather / Lucide icon conventions (`viewBox="0 0 24 24"`, stroke width 2px, rounded joins/caps).

### Icon Inventory

| Stitch Icon / Context | Screens Where Used | Matching Lucide Icon (`lucide-react-native`) |
|:---|:---|:---|
| Home Tab | `home.html`, `home_month.html`, `history.html`, `people.html`, `me.html` | `Home` |
| History Tab | `home.html`, `home_month.html`, `history.html`, `people.html`, `me.html` | `Clock` |
| People Tab | `home.html`, `home_month.html`, `history.html`, `people.html`, `me.html` | `Users` |
| Me Tab | `home.html`, `home_month.html`, `history.html`, `people.html`, `me.html` | `User` |
| Search (Header / Input) | `history.html`, `people.html` | `Search` |
| Plus (Add Person) | `people.html` | `Plus` |
| Close / Dismiss | `assistant.html`, `edit_transaction.html`, `edit_transaction_person.html` | `X` |
| Back Navigation | `people.html` (detail view) | `ArrowLeft` |
| Delete / Trash | `delete_dialog.html`, `history.html`, `edit_transaction.html` | `Trash2` |
| Microphone | `assistant.html`, `home.html` (center tab bar mark) | `Mic` |
| Audio Speaker | `assistant.html` (replay prompt) | `Volume2` |
| Email Input Prefix | `sign_in.html` | `Mail` |
| Password Input Prefix | `sign_in.html` | `Lock` |
| Password Toggle | `sign_in.html` | `Eye`, `EyeOff` |
| Chat History Action | `me.html` | `MessageSquare` |
| Share / Remind Action | `people.html` | `Share2` |
| Food & Dining Category | `home.html`, `history.html`, `edit_transaction.html` | `Coffee` |
| Shopping Category | `home.html`, `history.html`, `edit_transaction.html` | `ShoppingBag` |
| Transport Category | `home.html`, `history.html`, `edit_transaction.html` | `Truck` |
| Other / Tag Category | `home.html`, `history.html`, `edit_transaction.html` | `Tag` |
| Navigation Chevron | `me.html`, `people.html` | `ChevronRight` |
| Selection Checkmark | `edit_transaction.html`, `people.html` | `Check` |
| Phone / Contact | `people.html` | `Phone` |
| Payment / Card | `people.html` | `CreditCard` |
| Budget / Stats | `me.html` | `BarChart2` |
| Settings / Filters | `history.html` | `Sliders` |

### Proposed Package to Install
- Package: `lucide-react-native`
- Version: `^0.460.0` (compatible with `react-native-svg@15.8.0` and Expo SDK 52)
- Note: Do NOT install yet per prompt instructions until approved.
