# Derived States Specification

This document defines all interaction states, edge cases, and missing screens not explicitly drawn in Stitch. All derived states strictly follow the locked token palette (`bg` `#FFF8E7`, `surface` `#FFFFFF`, `border` `#F0E4C8`, `ink` `#1F2937`, `ink_muted` `#6B7280`, `expense` `#E5484D`, `gold` `#FFC83D`). Shimmer animations, gradients, blur filters, and new colors are strictly forbidden.

## 1. Loading States (Skeleton Placeholders)

All skeleton loaders are completely flat, static rectangles filled with `border` `#F0E4C8`. Shimmer effects and sweeping gradients are banned.

### Card Skeleton
- Container: Standard card (`pappu-card`) with white surface, 2px `#F0E4C8` border, 20px radius.
- Title placeholder: Height 18px, width 120px, radius 8px, flat `#F0E4C8`.
- Hero amount placeholder: Height 36px, width 160px, radius 10px, flat `#F0E4C8`.
- Secondary metric line: Height 14px, width 200px, radius 6px, flat `#F0E4C8`.

### Daily Spending Chart Skeleton
- Headroom: 48px blank space.
- Bar columns: 7 bars, width 24px each.
- Heights: Flat 6px stubs with 4px top radius in `#F0E4C8`.
- Axis line: 1px `#F0E4C8`.
- Day labels: Statically rendered Mon through Sun in `ink_muted` `#6B7280`.

### List Row Skeleton (History & Recent)
- Row container: Height 64px, horizontal padding 16px, white background, bottom 1px divider in `#F0E4C8`.
- Left icon avatar: 40px circle filled with `#F0E4C8`.
- Title block: Height 16px, width 120px, radius 6px, filled with `#F0E4C8`.
- Subtitle block: Height 12px, width 80px, radius 4px, filled with `#F0E4C8`, gap 4px below title.
- Right amount block: Height 18px, width 70px, radius 6px, filled with `#F0E4C8`.

## 2. Empty States (Zero Data)

When data arrays return empty, screens display clean informative fallbacks using the Sleepy mascot pose or concise contextual text.

### Home Screen: All Days Zero Spend
- Chart: All 7 bars display 6px stubs in `#F0E4C8`.
- Average label: "Avg ₹0/day" in `ink_muted` `#6B7280`.
- Tooltip: Hidden completely.
- Delta text: Hidden completely when previous and current spend are zero.

### Home Screen: People Card Empty (Zero Debts)
- Main title: "All settled up" in Baloo Chettan 2 Bold 18px (`ink` `#1F2937`).
- Subtitle: "No money owed or owing" in Nunito 14px (`ink_muted` `#6B7280`).
- Action: "Add person" link text in teal `#0E7C86`.

### Home Screen: Where It Went Empty
- Subtitle: "No spending logged yet this week" in Nunito 14px (`ink_muted` `#6B7280`).
- Progress tracks: Single empty track of height 8px in `#F0E4C8`.

### History Screen: Filter Returns Zero Records
- Visual: As shown in Stitch `history.html` frame 2.
- Mascot: Sleepy pose, 120px size, centered.
- Headline: "Nothing here yet" in Baloo Chettan 2 Bold 20px (`ink` `#1F2937`).
- Description: "Tap the coin or hold to record an expense." in Nunito 15px (`ink_muted` `#6B7280`).

### People Screen: Zero Contacts
- Visual: Sleepy pose mascot, 120px size, centered vertically.
- Headline: "No friends added yet" in Baloo Chettan 2 Bold 20px (`ink` `#1F2937`).
- Description: "Tap the + button to track money with friends." in Nunito 15px (`ink_muted` `#6B7280`).
- Action Button: None on body (directs user to top right header plus button).

### Person Detail Screen: Zero Transactions
- Card: White card with 2px `#F0E4C8` border.
- Text: "No transactions recorded with [Name] yet." in Nunito 14px (`ink_muted` `#6B7280`).

### Assistant Modal: Fresh Session (No Previous Chat)
- Mascot: Idle pose (120px), subtitle "How can I help with your money today?".
- Suggestions: 3 pills ("Sent 500 to Pooja", "ചായ 20 രൂപ", "Food this week?").

## 3. Error States

Errors must be explicit, functional, and non-disruptive.

### Network Error Banner (Global)
- Container: Surface card, 2px border in `expense` `#E5484D`, radius 16px, padding 12px.
- Text: "Could not connect to server. Check your internet connection." in Nunito 14px (`ink` `#1F2937`).
- Action: "Retry" button (height 40px, secondary white button style).

### Input Validation Error (Forms & Auth)
- Input border: Shifts from 2px `#F0E4C8` to 2px `expense` `#E5484D`.
- Error text: Sits directly beneath input, Nunito 13px bold, `expense` `#E5484D`.
- Error copy examples:
  - "Please enter a valid email address."
  - "Password must be at least 6 characters."
  - "A contact with this name already exists."

## 4. Text Truncation and Long Names

To prevent UI breakage on long Indian names and descriptions:

- Contact names: Single line with tail truncation (`numberOfLines={1} ellipsizeMode="tail"`).
- Transaction descriptions: Single line with tail truncation.
- Amounts: Amounts are never truncated. If an amount is very large (example: `₹12,45,000`), the font size shrinks or container wraps vertically.
- Category chips: Text never wraps. Container scrolls horizontally if chips overflow viewport width.

## 5. Accessibility and Large Font Scaling (1.3 Font Scale)

When user enables large font accessibility (1.3x):

- Button Heights: 52px target expands vertically with content (`minHeight: 52px`, `paddingVertical: 12px`). Labels never wrap to two lines.
- Card Heights: All cards use flexible height (`minHeight`) rather than fixed heights.
- Horizontal metric pairs (Income vs Net): Stacks vertically if width cannot accommodate both amounts.
- Tab bar: Tab labels (10px) expand up to 13px maximum. Icons scale proportionally. Center coin maintains 72px fixed boundary.
