# Pappu UI Derived States

This document tracks UI states, views, and screen adaptations derived from the Stitch design tokens and specifications where explicit Stitch screen mockups were not provided.

---

## 1. Home Screen: Year View (`period === 'year'`)

### Context
* **Stitch Source Screens**: Stitch provided explicit design mockups for `home_week_view` (7-bar daily chart, Mon–Sun) and `home_month_view` (30/31-bar daily chart, Day 1–31).
* **Missing Specification**: Stitch did not include a screen mockup for the **Year** view, despite Year being an active financial period option in the backend (`GET /summary?period=year`).

### Derivation Strategy & Architecture
The Year view was derived systematically by applying Stitch tokens, component structures, typography, and interactive behaviors established in the Week and Month screens:

1. **Period Selector Segmented Control**:
   * Added the third period tab `{ key: 'year', label: 'Year' }` matching the pill button styles (`typography.labelSmall`, `colors.primaryContainer`, `colors.onPrimaryContainer`).

2. **Hero Balance Card**:
   * **Total Spent**: Displays the aggregate spending for the calendar year (`curr_start = YYYY-01-01`, `curr_end = YYYY-12-31`).
   * **Delta Pill**: Compares current year spending against the full previous year (`prev_start = (YYYY-1)-01-01`, `prev_end = (YYYY-1)-12-31`). Displays delta percentage and absolute difference.
   * **Daily Average**: Computes `avg_per_day` across the full year (`total_spent / 365` or `366`).
   * **Mascot Mood**: Derived from annual spend velocity (`worried` if spend > 1.5x previous year and > ₹500, otherwise `neutral`).

3. **Spending Bar Chart (`SpendingChart.js`)**:
   * **Buckets**: 12 monthly buckets (`Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`, `Oct`, `Nov`, `Dec`) from `backend/app/services/date_utils.py`.
   * **Bar Layout**: 12 responsive columns with proportional spacing (`gap: 4`, rounded pill caps `borderRadius: 4`).
   * **Peak Indicator**: Automatically highlights the peak spending month in `colors.primary` (warm terracotta/orange) with a flame/peak icon and subtle glow.
   * **Subtitle**: Switches contextually from `"Daily spending"` to `"Monthly spending"`.
   * **Interactive Bar Selection**: Tapping any of the 12 monthly bars opens the floating popover displaying the 3-letter month label and exact formatted currency (`₹X,XXX`).

4. **Expense Categories**:
   * Renders the top 5 spending categories across the entire year plus `Other`, with percentage progress bars normalized against the annual total spend.

5. **People Section**:
   * Shows all active debt relations and top 3 counter-parties by absolute net balance over the annual period.
