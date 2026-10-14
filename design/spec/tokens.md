# Design Tokens Specification

This document records all tokens extracted directly from the Stitch source of truth project (Project ID: `9429203517741760676`, "Pappu Mascot Design System").

## 1. Color Tokens

All colors are strictly flat. Gradients, glassmorphism, blurs, glows, and ambient drop shadows are completely banned.

| Token Name | Hex Value | Role in Stitch | Usage Constraints |
|:---|:---|:---|:---|
| `bg` | `#FFF8E7` | Canvas background | Screen container background only |
| `surface` | `#FFFFFF` | Card and input background | Cards, sheets, dialog surfaces, inputs |
| `border` | `#F0E4C8` | Border and divider stroke | 2px card borders, 1px list dividers, skeletons |
| `gold` | `#FFC83D` | Primary brand accent | Primary buttons, active tabs, mascot body, active chips |
| `gold_edge` | `#D99A00` | Tactile bottom edge | 4px bottom edge on primary buttons, mascot outline rim |
| `ink` | `#1F2937` | Primary text and dark outlines | High contrast headings, amounts, button text, coin 4px outline |
| `ink_muted` | `#6B7280` | Secondary and inactive text | Subtitles, timestamps, inactive tab icons, helper captions |
| `income` | `#1F8A5B` | Positive cashflow | Deposits, money owed to you, positive net balance |
| `expense` | `#E5484D` | Negative cashflow | Spends, money you owe, destructive button fill and text |
| `expense_edge` | `#B4232A` | Destructive bottom edge | 4px bottom edge on destructive action buttons |
| `teal` | `#0E7C86` | Secondary accent and links | Interactive link text ("See all", "View all"), Shopping category |
| `dim_overlay` | `rgba(31, 41, 55, 0.40)` | Modal scrim | Dialog backdrop, bottom sheet backdrop (flat, zero blur) |

### Category Taxonomy Tokens

| Category | Token Name | Hex Value | Usage |
|:---|:---|:---|:---|
| Food & Dining | `category_food` | `#F97316` | Food category pill dot, icon, breakdown bar |
| Shopping | `category_shopping` | `#0E7C86` | Shopping category pill dot, icon, breakdown bar |
| Transport & Mobility | `category_transport` | `#38BDF8` | Transport category pill dot, icon, breakdown bar |
| People & Social | `category_people` | `#8B5CF6` | People category avatar, filter tag |
| Other / Uncategorized | `category_other` | `#9CA3AF` | Other category pill dot, icon, breakdown bar |

## 2. Typography Tokens

Stitch source HTML links Google Fonts:
1. `Baloo Chettan 2` (weights: 600, 700, 800): Used for display amounts, headings, currency symbols, and primary button labels. Supports Malayalam and Latin digits.
2. `Nunito` (weights: 600, 700, 800): Used for body text, form labels, timestamps, and subtitles.
3. `Noto Sans Malayalam` (weights: 600, 700): Used as exact native Malayalam script fallback.

### Type Scale

| Style Token | Font Family | Size | Line Height | Weight | Stitch Class / Usage |
|:---|:---|:---|:---|:---|:---|
| `display_amount` | Baloo Chettan 2 | 32px | 36px | 800 | `font-baloo text-[32px] leading-[36px] font-extrabold font-num` (Home spend, Edit amount) |
| `headline_h1` | Baloo Chettan 2 | 24px | 28px | 700 | `font-baloo font-bold text-[24px] leading-[28px]` (Sheet titles, Greeting headline) |
| `headline_h2` | Baloo Chettan 2 | 18px | 22px | 700 | `font-baloo font-bold text-[18px] leading-[22px]` (Card headers: Daily spending, Where it went) |
| `body_amount` | Baloo Chettan 2 | 16px | 20px | 700 | `font-baloo font-bold text-base font-num` (Transaction list amounts, tile values) |
| `button_label` | Baloo Chettan 2 | 17px | 22px | 700 | `font-baloo font-bold text-[17px]` (52px button labels) |
| `body_main` | Nunito | 15px | 22px | 600 | `text-[15px] leading-[22px] font-semibold text-[#1F2937]` (Transaction descriptions, inputs) |
| `body_secondary` | Nunito | 14px | 20px | 600 | `text-[14px] leading-[20px] text-[#6B7280]` (Timestamps, secondary subtitles) |
| `caption_bold` | Nunito / Baloo | 13px | 18px | 700 | `text-[13px] leading-[18px] font-bold text-[#6B7280]` (Delta labels, chart axis labels) |
| `tab_label` | Baloo Chettan 2 | 10px | 12px | 700 | `text-[10px] font-baloo font-bold` (Bottom tab labels) |

Note on Numerals: Tabular figures (`font-variant-numeric: tabular-nums`) must be active for all amounts to eliminate layout jitter.

## 3. Spacing Scale

Stitch utilizes a 4px modular spacing scale:

| Token | Pixels | Common Stitch Uses |
|:---|:---|:---|
| `space_1` | 4px | Micro padding, tooltip offset, indicator gaps |
| `space_2` | 8px | Button item gap, chip inner padding, small card gap |
| `space_3` | 12px | Section gap, paired button gap, horizontal chip padding |
| `space_4` | 16px | Standard card inner padding, screen side margins |
| `space_5` | 20px | Large screen margin, top header padding |
| `space_6` | 24px | Center coin raise height, dialog padding |
| `space_8` | 32px | Section dividers, mascot clearance |

Screen Margins:
- Mobile screen side padding: 20px (`px-5` in Stitch)
- Status bar height: 47px (`h-[47px]` in Stitch)
- Bottom tab bar height: 84px (`h-[84px]` in Stitch)
- Bottom content safe padding: 108px (`pb-[108px]` in Stitch)

## 4. Corner Radii

| Token | Value | Stitch Uses |
|:---|:---|:---|
| `radius_pill` | 999px | Segmented controls, category chips, filter pills |
| `radius_card` | 20px | All standard `.pappu-card` containers, bottom sheet top corners |
| `radius_button` | 16px | 52px primary, secondary, and destructive action buttons |
| `radius_input` | 16px | Form input containers (text, phone, UPI) |
| `radius_small` | 12px | Small indicator badges, chart tooltips, avatar rounded corners |
| `radius_screen` | 40px | Mobile screen device border frame |

## 5. Border Widths

| Token | Value | Application |
|:---|:---|:---|
| `border_thin` | 1px | Inner list row dividers, axis lines |
| `border_standard` | 2px | Card perimeter, input perimeter, secondary button stroke |
| `border_heavy` | 4px | Center coin perimeter outline (`#1F2937`) |
| `edge_button` | 4px | Solid bottom edge on 3D tactile buttons (`#D99A00`, `#B4232A`, `#F0E4C8`) |

## 6. Button Variants

Stitch implements 4 explicit tactile button variants:

### Variant 1: Primary Button (Gold)
- Height: 52px
- Fill: `#FFC83D`
- Text: `#1F2937`, Baloo Chettan 2 Bold 17px, line height 22px
- Border: 1px or 2px `#1F2937` perimeter (or 2px `#D99A00`)
- Bottom Edge: 4px solid `#D99A00` (`shadow-[0_4px_0_#D99A00]` or bottom border)
- Corner Radius: 16px
- Active Press: translateY 4px, bottom edge collapses to 0px, duration 80ms

### Variant 2: Secondary Button (White)
- Height: 52px (in dialogs: 48px)
- Fill: `#FFFFFF`
- Text: `#1F2937`, Baloo Chettan 2 Bold 17px
- Border: 2px `#F0E4C8` perimeter
- Bottom Edge: 4px solid `#F0E4C8` (`shadow-[0_4px_0_#F0E4C8]`)
- Corner Radius: 16px
- Active Press: translateY 4px, bottom edge collapses to 0px, duration 80ms

### Variant 3: Destructive Button (Coral Red)
- Height: 52px (in dialogs: 48px)
- Fill: `#E5484D`
- Text: `#FFFFFF`, Baloo Chettan 2 Bold 17px
- Border: None
- Bottom Edge: 4px solid `#B4232A` (`shadow-[0_4px_0_#B4232A]`)
- Corner Radius: 16px
- Active Press: translateY 4px, bottom edge collapses to 0px, duration 80ms

### Variant 4: Destructive Outline Button (White with Coral Stroke)
- Height: 52px
- Fill: `#FFFFFF`
- Text: `#E5484D`, Baloo Chettan 2 Bold 17px
- Border: 2px `#E5484D` perimeter
- Bottom Edge: 4px solid `#E5484D` (`shadow-[0_4px_0_#E5484D]`)
- Corner Radius: 16px
- Active Press: translateY 4px, bottom edge collapses to 0px, duration 80ms

## 7. Differences Between Stitch and Context Document Lock

| Element | Value in Context Document | Actual Value in Stitch Code | Conflict Assessment |
|:---|:---|:---|:---|
| Primary Button Border | 2px `#D99A00` perimeter | In `edit_transaction.html` and `people.html`, Stitch uses `border border-[#1F2937]` with `shadow-[0_4px_0_#D99A00]`. In `assistant.html`, Stitch uses `border-b-4 border-goldEdge` without side border. | Stitch uses dark ink hairline in edit sheets, borderless with 4px edge in assistant. |
| Dialog Button Height | 52px | 48px (`h-[48px]`) in `delete_dialog.html` | Stitch uses 48px for compact dialog modals. |
| Language Selector Height | Standard button or 38px chip | 28px (`h-[28px]`) in `me.html` | Stitch uses micro pill selector inside list row. |
| Category Chip Height | 38px | 40px (`h-10`) in `edit_transaction.html` | Stitch uses 40px with 16px padding and 999px radius. |
| Tactile Bottom Edge Implementation | Implied physical border edge | Implemented in Stitch HTML via CSS `shadow-[0_4px_0_#EDGE_COLOR]` | Web CSS uses zero blur box shadow to simulate extrusion. React Native must render as a physical bottom edge layer. |
