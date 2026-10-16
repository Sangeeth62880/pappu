# Screen Specification: History Screen

This specification covers the History Screen and its interaction states from `design/stitch/history.html`.

## 1. Frame Geometry

- Viewport Width: 390px
- Viewport Height: 844px
- Base Background: `bg` `#FFF8E7`
- Screen Border: 4px solid `ink` `#1F2937`, corner radius 40px
- Side Content Padding: 20px (`px-5`)
- Content Bottom Padding: 108px (`pb-[108px]`) to clear the 84px fixed bottom tab bar

## 2. Element Hierarchy in Order

### Element 1: Status Bar
- Height: 47px (`h-[47px]`)
- Padding: Horizontal 24px, top 12px
- Left: Time `9:41` (Nunito 12px Bold, `ink` `#1F2937`)
- Right: System battery, wifi, cellular glyphs

### Element 2: Header with Search
- Height: 64px (`h-[64px]`)
- Padding: Horizontal 20px (`px-5`)
- Left:
  - Coin Mark: 32px circle, `gold` `#FFC83D` fill, 2px `ink` `#1F2937` border, 2px bottom edge `gold_edge` `#D99A00`, letter "P" in Baloo Chettan 2 Bold 18px
  - Wordmark: "Pappu", Baloo Chettan 2 Bold 20px, line height 24px, `ink` `#1F2937`
- Right: Search Button
  - 40px circle (`w-10 h-10 rounded-full`)
  - Background: Surface white `#FFFFFF`
  - Border: 2px solid `border` `#F0E4C8`
  - Icon: Lucide `search` icon (20px, 2px stroke, `ink` `#1F2937`)
  - Stitch Code:
    ```html
    <div class="w-10 h-10 rounded-full bg-white border-2 border-[#F0E4C8] flex items-center justify-center text-[#1F2937] active:scale-95 transition-transform cursor-pointer">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">...</svg>
    </div>
    ```

### Element 3: Filter Chips Carousel
- Height: 40px (`h-10`)
- Layout: Horizontal scroll list, negative margin horizontal 20px, padding horizontal 20px, gap 8px (`gap-2`)
- Chips:
  1. "All":
     - Active Fill: `gold` `#FFC83D`
     - Bottom Edge: 3px solid `gold_edge` `#D99A00` (`border-b-[3px] border-[#D99A00]`)
     - Text: Baloo Chettan 2 Bold 14px, `ink` `#1F2937`
     - Height: 40px, padding horizontal 20px (`px-5`), radius 999px
  2. "Expenses":
     - Fill: Surface white `#FFFFFF`
     - Border: 2px solid `border` `#F0E4C8`
     - Text: Baloo Chettan 2 Bold 14px, `ink_muted` `#6B7280`
  3. "Income":
     - Fill: Surface white `#FFFFFF`
     - Border: 2px solid `border` `#F0E4C8`
     - Text: Baloo Chettan 2 Bold 14px, `ink_muted` `#6B7280`
  4. "People":
     - Fill: Surface white `#FFFFFF`
     - Border: 2px solid `border` `#F0E4C8`
     - Text: Baloo Chettan 2 Bold 14px, `ink_muted` `#6B7280`
- Stitch Code:
  ```html
  <div class="pt-3 pb-4 overflow-x-auto no-scrollbar flex items-center gap-2 -mx-5 px-5 flex-shrink-0">
    <button class="h-10 px-5 rounded-full bg-[#FFC83D] border-b-[3px] border-[#D99A00] font-baloo text-sm font-bold text-[#1F2937]">All</button>
    <button class="h-10 px-5 rounded-full bg-white border-2 border-[#F0E4C8] font-baloo text-sm font-bold text-[#6B7280]">Expenses</button>
    <button class="h-10 px-5 rounded-full bg-white border-2 border-[#F0E4C8] font-baloo text-sm font-bold text-[#6B7280]">Income</button>
    <button class="h-10 px-5 rounded-full bg-white border-2 border-[#F0E4C8] font-baloo text-sm font-bold text-[#6B7280]">People</button>
  </div>
  ```

### Element 4: Monthly Summary Banner
- Container: Surface white card, 2px `border` `#F0E4C8`, radius 20px, padding 16px, margin bottom 16px
- Content:
  - Header Label: "October Total" (or "You've spent"), Nunito 13px Bold, `ink_muted` `#6B7280`
  - Total Figure: "₹21,539", Baloo Chettan 2 Extrabold 28px, line height 32px, `ink` `#1F2937`, tabular numbers

### Element 5: Chronological IST Day Groups
Each day group contains a section header and a grouped card container.

#### Day Group 1: "Today, 14 Oct"
- Group Header Row:
  - Left: Date "Today, 14 Oct", Baloo Chettan 2 Bold 16px, `ink` `#1F2937`
  - Right: Net Day Total "−₹2,859", Baloo Chettan 2 Bold 15px, `ink` `#1F2937`
- Card Container: Surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, overflow hidden, margin bottom 20px
- Rows (separated by 1px solid `border` `#F0E4C8` dividers):
  - Row 1:
    - Left Avatar: 40px circle, background `#8B5CF6`/15, icon `users` in `#8B5CF6`
    - Title: "രാഹുൽ", Nunito 15px Bold, `ink` `#1F2937`
    - Subtitle: "Received", Nunito 13px, `ink_muted` `#6B7280`
    - Right Amount: "+₹300", Baloo Chettan 2 Bold 16px, `income` `#1F8A5B`
  - Row 2:
    - Left Avatar: 40px circle, background `#1F8A5B`/15, icon `briefcase` in `#1F8A5B`
    - Title: "Salary", Nunito 15px Bold, `ink` `#1F2937`
    - Subtitle: "Income", Nunito 13px, `ink_muted` `#6B7280`
    - Right Amount: "+₹15,000", Baloo Chettan 2 Bold 16px, `income` `#1F8A5B`
  - Row 3:
    - Left Avatar: 40px circle, background `#38BDF8`/15, icon `truck` in `#38BDF8`
    - Title: "auto", Nunito 15px Bold, `ink` `#1F2937`
    - Subtitle: "Transport", Nunito 13px, `ink_muted` `#6B7280`
    - Right Amount: "−₹80", Baloo Chettan 2 Bold 16px, `expense` `#E5484D`

#### Day Group 2: "Yesterday, 13 Oct"
- Group Header Row: Date "Yesterday, 13 Oct", Net Day Total "−₹2,280"
- Rows:
  - Row 1: Lunch (Food, −₹250)
  - Row 2: Metro (Transport, −₹30)
  - Row 3: Groceries (Shopping, −₹2,000)

### Element 6: Fixed Bottom Tab Bar
- Height: 84px, white, 2px top border `#F0E4C8`
- Slot 2 (History Tab): Active state with clock icon in `ink` `#1F2937`, label "History" in Baloo 10px Bold `ink`, 6px circular gold dot underneath

## 3. Interaction State: Swipe to Delete

- Gesture: Horizontal drag leftwards on any list row.
- Motion Mechanics:
  - The foreground list row translates horizontally with user finger (`translateX(-dx)`).
  - The background container exposes coral red `expense` `#E5484D`.
  - Inside the red container, a white Lucide `trash_2` icon scales up from 0.7 to 1.0 as the drag passes 80px.
  - Releasing under 120px threshold snaps the row back smoothly over 160ms.
  - Releasing beyond 120px opens the Delete Transaction Confirmation Dialog.
- Stitch Code:
  ```html
  <div class="relative overflow-hidden rounded-[20px] mb-2 border-2 border-[#F0E4C8]">
    <!-- Revealed Delete Action Tray -->
    <div class="absolute inset-0 bg-[#E5484D] flex items-center justify-end pr-6">
      <svg class="w-6 h-6 text-white" ...>...</svg>
    </div>
    <!-- Foreground List Row -->
    <div class="relative bg-white h-16 px-4 flex items-center justify-between transform -translate-x-20 transition-transform">...</div>
  </div>
  ```

## 4. Empty State: Zero Transactions

- Trigger: Active filter (or empty database) returns 0 records.
- Visual:
  - Centered vertically in main viewport.
  - Mascot: 120px Pappu in Sleepy pose (closed eyes, drooping arms).
  - Headline: "Nothing here yet", Baloo Chettan 2 Bold 20px, line height 26px, `ink` `#1F2937`, margin top 16px.
  - Description: "Tap the coin or hold to record an expense.", Nunito 15px, line height 22px, `ink_muted` `#6B7280`, max width 240px, text center.
- Stitch Code:
  ```html
  <div class="flex-1 flex flex-col items-center justify-center text-center px-6">
    <div class="w-[120px] h-[120px] flex items-center justify-center mb-4">...</div>
    <h2 class="font-baloo font-bold text-xl text-[#1F2937] mb-1">Nothing here yet</h2>
    <p class="text-sm font-semibold text-[#6B7280] max-w-[220px]">Tap the coin or hold to record an expense.</p>
  </div>
  ```
