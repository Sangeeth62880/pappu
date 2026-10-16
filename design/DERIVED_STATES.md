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

## 6. Authentication Derived States (Sign In & Create Account)

- Loading State:
  - Submit button switches into loading state showing ActivityIndicator in ink `#1F2937` with `loading={true}`.
  - Inputs are locked during submission (`editable={!loading}`).
  - No shimmer, no overlays, and no decorative spinners.
- Inline Field Validation:
  - Empty or invalid email: "Please enter a valid email address."
  - Empty password: "Password is required."
  - Short password on sign up: "Password must be at least 6 characters."
  - Empty name on sign up: "Please enter your name."
  - Field container border shifts to 2px expense `#E5484D`.
- Server Error State:
  - Wrong password or user not found: Banner displayed inside the card with 2px expense border `#E5484D` and Nunito 13px bold error copy.
  - Mascot head shake: Triggers 200ms subtle horizontal head shake sequence over `[-8, 8, -6, 6, 0]px`.
- Navigation Back State:
  - Top back button arrow (Feather `arrow-left` icon, 22px ink `#1F2937`) visible in Create Account mode to return to Sign In, alongside the footer switch link "Already have an account? Sign in".

## 7. Assistant Cards and Interaction Derived States

These cards derive directly from the Stitch Delete Confirmation Card (`7fe009e4a12c4c8c83a8f7ebaf6a6f48`) and maintain strict token fidelity.

### Contact Confirmation Card (`kind: contact_confirm`)
- Container: Surface card (`#FFFFFF`), 2px `#F0E4C8` border, 20px radius, 14px padding.
- Question / Title: Baloo Chettan 2 Bold 16px in `ink` `#1F2937` (e.g. `Add Priya as a new contact?`).
- Details Row:
  - Left avatar: 40px circle in Violet tint (`#8B5CF6` at 15% fill with `#8B5CF6` icon) indicating people.
  - Text block: Contact name in Nunito Bold 15px (`ink` `#1F2937`), subtitle "New contact" in Nunito 12px (`ink_muted` `#6B7280`).
- Actions:
  - Yes: Height 52px, Gold `#FFC83D` fill, 4px bottom edge `#D99A00`, font Baloo Chettan 2 Bold 17px in `ink` `#1F2937`. Sends answer `yes`.
  - No: Height 52px, White `#FFFFFF` fill, 2px border `#F0E4C8`, 4px bottom edge `#E2D3B0`, font Baloo Chettan 2 Bold 17px in `ink` `#1F2937`. Sends answer `no`.
- Resolved State: When confirmed or cancelled or superseded, buttons are replaced by an inline status badge (e.g. "Added" or "Resolved" or "Cancelled") in Nunito Bold 13px.

### Contact Disambiguation Card (`kind: disambiguate`)
- Container: Surface card (`#FFFFFF`), 2px `#F0E4C8` border, 20px radius, 14px padding.
- Question / Title: Baloo Chettan 2 Bold 16px in `ink` `#1F2937` (e.g. `Which Pooja?`).
- Candidate Rows: Up to 5 tappable rows, each 52px min height, 1px bottom divider in `#F0E4C8`.
  - Left avatar: 36px circle with contact initials or icon.
  - Name and details in Nunito Bold 15px and Nunito 12px.
  - Tapping sends answer `pick` with 1 based candidate index.
- "New Person" Row:
  - Specially styled disambiguation row with plus icon (`+`) inside a 36px gold circle.
  - Title: "New person" in Nunito Bold 15px.
  - Subtitle: "Add as a separate contact" in Nunito 12px.
  - Tapping sends answer `new` to V2 pending endpoint.
- Resolved State: After choice or supersession, candidates lock into read only state with the selected person highlighted.

### Edit Confirmation Card (`kind: confirm`, edit action)
- Container: Surface card (`#FFFFFF`), 2px `#F0E4C8` border, 20px radius, 14px padding.
- Title: Baloo Chettan 2 Bold 16px in `ink` `#1F2937` (e.g. `Change amount to ₹300?`).
- Details Row: Displays transaction title, previous amount, and target new value.
- Actions:
  - Update: Height 52px, Gold `#FFC83D` fill, 4px bottom edge `#D99A00`, font Baloo Chettan 2 Bold 17px in `ink` `#1F2937`. Sends answer `yes`.
  - Keep it: Height 52px, White `#FFFFFF` fill, 2px border `#F0E4C8`, 4px bottom edge `#E2D3B0`, font Baloo Chettan 2 Bold 17px in `ink` `#1F2937`. Sends answer `no`.
- Resolved State: Buttons replaced by "Updated" or "Resolved" pill.

### Results Cards (Balances, Totals, Category Breakdown)
- Container: Surface card (`#FFFFFF`), 2px `#F0E4C8` border, 20px radius, 14px padding.
- Balances Card: Displays peer list with avatars, names, and signed amounts (`+` in income `#1F8A5B`, `-` in expense `#E5484D`).
- Totals Card: Hero amount in Baloo Chettan 2 Bold 24px with period summary label.
- Category Breakdown Card: Category pills with progress bars and amounts.

## 8. Backend Discovery, Startup Health Check, and Cold Start States

These derived states handle backend connection health during app bootstrap without blank screens or generic errors.

### Hosting Cold Start Loading State ("Waking Pappu up")
- Trigger: Startup GET `/health` request takes longer than 3 seconds (e.g. Render free tier cold start).
- Background: Full-screen `bg` `#FFF8E7`.
- Mascot: Pappu Sleepy pose, 120px centered.
- Headline: "Waking Pappu up" in Baloo Chettan 2 Bold 22px (`ink` `#1F2937`).
- Description: "The server is waking up after being idle. This takes a few moments." in Nunito 15px (`ink_muted` `#6B7280`), centered, line-height 22px.
- Progress: Flat ActivityIndicator in `gold` `#FFC83D` (no shimmers, no gradients).

### Friendly Offline / Server Unreachable State
- Trigger: Startup GET `/health` request fails, server is unreachable, or network timeout occurs.
- Background: Full-screen `bg` `#FFF8E7` with 24px horizontal padding.
- Mascot: Pappu Concerned pose, 120px centered.
- Headline: "Can't reach Pappu" in Baloo Chettan 2 Bold 22px (`ink` `#1F2937`).
- Description: "Check your internet connection or verify the server is running." in Nunito 15px (`ink_muted` `#6B7280`), centered, line-height 22px.
- Action: "Retry" Button (height 52px, Gold `#FFC83D` fill, 4px bottom edge `#D99A00`, font Baloo Chettan 2 Bold 17px in `ink` `#1F2937`).

### Configuration Error State
- Trigger: Production build with insecure HTTP URL, or missing configuration without Metro dev host.
- Background: Full-screen `bg` `#FFF8E7`.
- Mascot: Pappu Confused pose, 120px centered.
- Headline: "Configuration Error" in Baloo Chettan 2 Bold 22px (`ink` `#1F2937`).
- Description: Plain sentence explanation (e.g. "Production builds require a secure HTTPS API URL...").
- Action: "Retry" Button (height 52px, White `#FFFFFF` fill, 2px border `#F0E4C8`, 4px bottom edge `#E2D3B0`).


