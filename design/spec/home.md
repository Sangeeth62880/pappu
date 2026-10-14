# Screen Specification: Home Screen

This specification covers the Home Screen (Week view and Month view) from `design/stitch/home.html` and `design/stitch/home_month.html`.

## 1. Frame Geometry

- Viewport Width: 390px
- Viewport Height: 844px (container scrolls vertically with full content)
- Base Background: `bg` `#FFF8E7`
- Screen Border: 4px solid `ink` `#1F2937`, corner radius 40px
- Side Content Margins: 20px (`px-5` in Stitch)
- Content Bottom Padding: 108px (`pb-[108px]`) to clear the 84px fixed bottom tab bar

## 2. Element Hierarchy in Order

### Element 1: Status Bar
- Height: 47px (`h-[47px]`)
- Padding: Horizontal 24px, top 12px (`px-6 pt-3`)
- Left Item: Time `9:41` (Nunito 12px Bold, `ink` `#1F2937`)
- Right Items: Cellular signal bars, Wi-Fi icon, battery level glyph (ink outlines)
- Stitch Code:
  ```html
  <div class="w-full h-[47px] px-6 pt-3 flex justify-between items-center z-20 shrink-0 select-none">
    <span class="text-xs font-bold text-[#1F2937]">9:41</span>
    <div class="flex items-center gap-1.5">...</div>
  </div>
  ```

### Element 2: App Header
- Height: 64px (`h-[64px]`)
- Padding: Horizontal 20px (`px-5`)
- Alignment: Flex row, center vertically, space between
- Left Item:
  - Coin Mark: 32px circle, `gold` `#FFC83D` fill, 2px `ink` `#1F2937` border, 2px bottom edge `gold_edge` `#D99A00`, letter "P" in Baloo Chettan 2 Bold 18px (`ink` `#1F2937`)
  - Wordmark: "Pappu", Baloo Chettan 2 Bold 20px, line height 24px, `ink` `#1F2937`, gap 8px from coin mark
- Right Item: Blank (no language switcher, no profile avatar, no status text)
- Stitch Code:
  ```html
  <header class="w-full h-[64px] px-5 flex items-center justify-between shrink-0 select-none">
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 rounded-full bg-[#FFC83D] border-2 border-[#1F2937] flex items-center justify-center relative shadow-[0_2px_0_#D99A00]">
        <span class="font-baloo font-bold text-xs text-[#1F2937] leading-none">P</span>
      </div>
      <span class="font-baloo font-bold text-xl text-[#1F2937]">Pappu</span>
    </div>
  </header>
  ```

### Element 3: Greeting Row
- Margin Bottom: 16px
- Layout: Flex row, items center, gap 12px (`gap-3`)
- Left Mascot: 48px circle container with Pappu avatar (Happy pose or server mood)
- Text Block:
  - Greeting Line: "Good evening, Sangeeth.", Baloo Chettan 2 Bold 20px, line height 24px, `ink` `#1F2937`
  - Subtitle: "You've spent ₹5,109 this week." (or "You've spent ₹21,539 this month." on Month view), Nunito 14px, line height 20px, `ink_muted` `#6B7280`
- Stitch Code:
  ```html
  <section class="flex items-center gap-3">
    <div class="w-12 h-12 rounded-full bg-[#FFC83D] border-2 border-[#1F2937] flex items-center justify-center shrink-0 shadow-[0_2px_0_#D99A00]">...</div>
    <div class="flex flex-col">
      <h1 class="font-baloo font-bold text-lg text-[#1F2937] leading-tight">Good evening, Sangeeth.</h1>
      <p class="text-[13px] text-[#6B7280] font-semibold">You've spent <span class="font-baloo font-bold text-[#1F2937]">₹5,109</span> this week.</p>
    </div>
  </section>
  ```

### Element 4: Segmented Period Control
- Dimensions: Full width, height 44px (`h-[44px]`), padding 2px
- Background: Surface white `#FFFFFF`
- Border: 2px solid `border` `#F0E4C8`
- Corner Radius: 999px (`rounded-[999px]`)
- Segments: 3 equal slots: "Week", "Month", "Year"
- Active Segment ("Week" or "Month"):
  - Fill: `gold` `#FFC83D`
  - Border: 1px `ink` `#1F2937`
  - Bottom Edge: 3px solid `gold_edge` `#D99A00` (`shadow-[0_3px_0_#D99A00]`)
  - Corner Radius: 999px
  - Text: Baloo Chettan 2 Bold 14px, `ink` `#1F2937`
- Inactive Segments:
  - Fill: Transparent
  - Text: Baloo Chettan 2 Bold 14px, `ink_muted` `#6B7280`
- Stitch Code:
  ```html
  <section class="w-full h-[44px] bg-white border-2 border-[#F0E4C8] rounded-[999px] p-[2px] flex items-center select-none">
    <button class="flex-1 h-full rounded-full bg-[#FFC83D] border border-[#1F2937] shadow-[0_3px_0_#D99A00] flex items-center justify-center font-baloo font-bold text-sm text-[#1F2937]">Week</button>
    <button class="flex-1 h-full rounded-full flex items-center justify-center font-baloo font-bold text-sm text-[#6B7280]">Month</button>
    <button class="flex-1 h-full rounded-full flex items-center justify-center font-baloo font-bold text-sm text-[#6B7280]">Year</button>
  </section>
  ```

### Element 5: Spend Card
- Container: Surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, padding 16px, vertical gap 12px
- Label: "Spent this week" (or "Spent this month"), Nunito 14px Bold, `ink_muted` `#6B7280`
- Hero Amount: "₹5,109" (Month: "₹21,539"), Baloo Chettan 2 Extrabold 32px, line height 36px, `ink` `#1F2937`, tabular numbers
- Delta Line: "₹4,759 more than last week" (Month: "₹3,120 more than last month"), Nunito 13px Bold, `ink_muted` `#6B7280`. Note: Percentage is strictly prohibited. Delta is omitted when previous period spend is under threshold.
- Divider: Horizontal 1px line in `border` `#F0E4C8`
- Metrics Row: Flex row with two equal columns:
  - Column 1: Label "Income" (Nunito 13px Bold, `ink_muted` `#6B7280`), Amount "+₹65,000" (Baloo Chettan 2 Bold 18px, `income` `#1F8A5B`)
  - Column 2: Label "Net" (Nunito 13px Bold, `ink_muted` `#6B7280`), Amount "+₹59,891" (Baloo Chettan 2 Bold 18px, `income` `#1F8A5B`)
- Stitch Code:
  ```html
  <section class="pappu-card flex flex-col gap-3">
    <div class="flex flex-col">
      <span class="text-[13px] font-bold text-[#6B7280] leading-[18px]">Spent this week</span>
      <span class="font-baloo font-extrabold text-[32px] text-[#1F2937] leading-[36px] font-num">₹5,109</span>
      <span class="text-[13px] font-bold text-[#6B7280] leading-[18px] mt-0.5">₹4,759 more than last week</span>
    </div>
    <div class="w-full h-[1px] bg-[#F0E4C8]"></div>
    <div class="flex items-center justify-between">
      <div>
        <span class="text-[13px] font-bold text-[#6B7280] block">Income</span>
        <span class="font-baloo font-bold text-[18px] text-[#1F8A5B] font-num">+₹65,000</span>
      </div>
      <div class="text-right">
        <span class="text-[13px] font-bold text-[#6B7280] block">Net</span>
        <span class="font-baloo font-bold text-[18px] text-[#1F8A5B] font-num">+₹59,891</span>
      </div>
    </div>
  </section>
  ```

### Element 6: Daily Spending Chart Card
- Container: Surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, padding 16px, vertical gap 12px
- Header:
  - Title: "Daily spending", Baloo Chettan 2 Bold 18px, line height 22px, `ink` `#1F2937`
  - Subtitle: "Avg ₹730/day" (Month: "Avg ₹717/day"), Nunito 13px Bold, `ink_muted` `#6B7280`
- Chart Canvas Geometry:
  - Total Height: 160px (`h-[160px]`)
  - Headroom: 48px (`pt-12`)
  - Maximum Bar Height: 112px (`h-[112px]`)
  - Tooltip: Positioned absolute in the 48px headroom above selected bar. Size: padding x 8px, padding y 2px. Fill: white `#FFFFFF`, border: 2px `#F0E4C8`, radius: 12px. Downward arrow: 8x8px square rotated 45 degrees, border bottom and right 2px `#F0E4C8`, negative margin top 4px. Text: "₹3,250", Baloo Chettan 2 Bold 13px, `ink` `#1F2937`.
  - Zero Days: 6px stub height (`h-[6px]`), width 24px (`w-6`), top radius 4px, flat fill `border` `#F0E4C8`.
  - Active Selected Bar (Tuesday): Height 112px, width 24px (`w-6`), fill `gold` `#FFC83D`, perimeter outline 2px solid `ink` `#1F2937` on top, left, and right (bottom border 0px), top radius 6px.
  - Active Non Selected Bar (Wednesday): Height 64px, width 24px, fill `gold` `#FFC83D`, no outline, top radius 6px.
  - Axis Line: Height 1px, width 100%, background `border` `#F0E4C8`.
  - Day Labels Row: Mon through Sun, Caption 13px Bold, padding top 6px. Tuesday label is `ink` `#1F2937`; all other day labels are `ink_muted` `#6B7280`.
- Stitch Code:
  ```html
  <div class="w-full h-[160px] relative flex flex-col justify-end pt-12 pb-0">
    <div class="absolute top-1 left-[21.4%] -translate-x-1/2 flex flex-col items-center z-10">
      <div class="bg-white border-2 border-[#F0E4C8] rounded-[12px] px-2 py-0.5 shadow-sm">
        <span class="font-baloo font-bold text-[13px] text-[#1F2937] leading-none">₹3,250</span>
      </div>
      <div class="w-2 h-2 bg-white border-b-2 border-r-2 border-[#F0E4C8] rotate-45 -mt-1"></div>
    </div>
    <div class="w-full h-[112px] flex items-end justify-between px-2">
      <!-- Mon: ₹0 -->
      <div class="w-8 flex flex-col items-center justify-end h-full">
        <div class="w-6 h-[6px] rounded-t-[4px] bg-[#F0E4C8]"></div>
      </div>
      <!-- Tue: ₹3,250 -->
      <div class="w-8 flex flex-col items-center justify-end h-full">
        <div class="w-6 h-[112px] rounded-t-[6px] bg-[#FFC83D] border-2 border-[#1F2937] border-b-0"></div>
      </div>
      <!-- Wed: ₹1,859 -->
      <div class="w-8 flex flex-col items-center justify-end h-full">
        <div class="w-6 h-[64px] rounded-t-[6px] bg-[#FFC83D]"></div>
      </div>
      <!-- Thu-Sun: ₹0 -->
      <div class="w-8 flex flex-col items-center justify-end h-full">
        <div class="w-6 h-[6px] rounded-t-[4px] bg-[#F0E4C8]"></div>
      </div>
    </div>
    <div class="w-full h-[1px] bg-[#F0E4C8]"></div>
    <div class="w-full flex justify-between px-2 pt-1.5">
      <span class="w-8 text-center text-[13px] font-bold text-[#6B7280]">Mon</span>
      <span class="w-8 text-center text-[13px] font-bold text-[#1F2937]">Tue</span>
      <span class="w-8 text-center text-[13px] font-bold text-[#6B7280]">Wed</span>
      <span class="w-8 text-center text-[13px] font-bold text-[#6B7280]">Thu</span>
      <span class="w-8 text-center text-[13px] font-bold text-[#6B7280]">Fri</span>
      <span class="w-8 text-center text-[13px] font-bold text-[#6B7280]">Sat</span>
      <span class="w-8 text-center text-[13px] font-bold text-[#6B7280]">Sun</span>
    </div>
  </div>
  ```

### Element 7: People Card
- Container: Surface white, 2px `border` `#F0E4C8`, radius 20px, padding 16px, vertical gap 12px
- Top Balances Row:
  - Left: "Owed to you", Nunito 13px Bold `#6B7280`, amount "₹6,700", Baloo Chettan 2 Bold 18px `#1F8A5B`
  - Right: "You owe", Nunito 13px Bold `#6B7280`, amount "₹1,000", Baloo Chettan 2 Bold 18px `#E5484D`
- Divider: 1px line in `border` `#F0E4C8`
- Top Debtors List:
  - Row 1: Avatar circle 36px with initial "P" (background `#8B5CF6`/15, text `#8B5CF6`), Name "Pooja" (Nunito 15px Bold `ink`), Net "+₹6,200" (Baloo 16px Bold `#1F8A5B`)
  - Row 2: Avatar circle 36px with initial "R" (background `#8B5CF6`/15, text `#8B5CF6`), Name "Rony" (Nunito 15px Bold `ink`), Net "+₹500" (Baloo 16px Bold `#1F8A5B`)
- Footer Link: "View all" button, Baloo Chettan 2 Bold 15px, `teal` `#0E7C86`, right aligned

### Element 8: Where It Went Card
- Container: Surface white, 2px `border` `#F0E4C8`, radius 20px, padding 16px, vertical gap 12px
- Title: "Where it went", Baloo Chettan 2 Bold 18px, line height 22px, `ink` `#1F2937`
- Category Rows (sorted by spending descending):
  - Row 1 (Food): Name "Food", percentage "63%", amount "₹3,225" (Month: 58%, ₹12,490). Bar: height 8px, background `#F0E4C8`, filled 63% with `category_food` `#F97316`, radius 999px.
  - Row 2 (Shopping): Name "Shopping", percentage "24%", amount "₹1,204" (Month: 22%, ₹4,740). Bar: filled 24% with `category_shopping` `#0E7C86`.
  - Row 3 (Other): Name "Other", percentage "10%", amount "₹500" (Month: 12%, ₹2,585). Bar: filled 10% with `category_other` `#9CA3AF`.
  - Row 4 (Transport): Name "Transport", percentage "3%", amount "₹180" (Month: 8%, ₹1,724). Bar: filled 3% with `category_transport` `#38BDF8`.

### Element 9: Recent Transactions Section
- Header Row: Title "Recent" (Baloo Chettan 2 Bold 18px `ink`), Link "See all" (Baloo Chettan 2 Bold 15px `teal` `#0E7C86`)
- Container: Surface white card or list, 2px `border` `#F0E4C8`, radius 20px, overflow hidden
- Rows:
  - Row 1: Avatar 40px circle `#8B5CF6`/15 with Users icon. Title "രാഹുൽ", subtitle "Received · 14 Oct", amount "+₹300" (Baloo 16px Bold `#1F8A5B`).
  - Row 2: Avatar 40px circle `#1F8A5B`/15 with Briefcase icon. Title "Salary", subtitle "Income · 14 Oct", amount "+₹15,000" (Baloo 16px Bold `#1F8A5B`).
  - Row 3: Avatar 40px circle `#38BDF8`/15 with Car icon. Title "auto", subtitle "Transport · 13 Oct", amount "-₹80" (Baloo 16px Bold `#E5484D`).

### Element 10: Fixed Bottom Tab Bar
- Dimensions: Full width, height 84px (`h-[84px]`), padding bottom 18px (`pb-[18px]`), padding horizontal 12px
- Background: Surface white `#FFFFFF`
- Top Border: 2px solid `border` `#F0E4C8`
- 5 Item Slots:
  - Slot 1: Home (Active: Lucide `home` icon 22px in `ink` `#1F2937`, label "Home" 10px Baloo Bold in `ink`, 6px circular gold dot `#FFC83D` beneath label)
  - Slot 2: History (Inactive: Lucide `clock` icon 22px in `ink_muted` `#6B7280`, label "History" 10px Baloo Bold in `ink_muted`)
  - Slot 3 (Center Raised Coin): 72px diameter circular button, raised 24px above tab bar (`top: -24px`), fill `gold` `#FFC83D`, perimeter 4px solid `ink` `#1F2937`, bottom edge 4px solid `gold_edge` `#D99A00` (`shadow-[0_4px_0_#D99A00]`), center ₹ coin glyph or mascot face
  - Slot 4: People (Inactive: Lucide `users` icon 22px in `ink_muted` `#6B7280`, label "People" 10px Baloo Bold in `ink_muted`)
  - Slot 5: Me (Inactive: Lucide `user` icon 22px in `ink_muted` `#6B7280`, label "Me" 10px Baloo Bold in `ink_muted`)
- Stitch Code:
  ```html
  <nav class="absolute bottom-0 left-0 right-0 h-[84px] bg-white border-t-2 border-[#F0E4C8] flex items-center justify-between px-3 pb-[18px] z-30 select-none">
    <div class="flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer">
      <svg width="22" height="22" ... stroke="#1F2937">...</svg>
      <span class="font-baloo font-bold text-[10px] text-[#1F2937] leading-tight">Home</span>
      <div class="w-1.5 h-1.5 rounded-full bg-[#FFC83D]"></div>
    </div>
    ...
    <button class="coin-tab-btn cursor-pointer">
      <span class="font-baloo font-extrabold text-2xl text-[#1F2937] leading-none mb-0.5 select-none">₹</span>
    </button>
  </nav>
  ```

## 3. Interactions and Implied Animations

1. Period Switch ("Week" / "Month" / "Year"):
   - Tapping an unselected segment triggers horizontal sliding transition of gold pill indicator over 180ms (`cubic-bezier(0.4, 0, 0.2, 1)`).
   - Spend total numerals count up over 400ms.
   - Chart bars scale up from bottom over 300ms staggered by 40ms per day column.
2. Selected Chart Bar:
   - Tapping any bar column changes active selection: the tapped bar acquires 2px `ink` outline and tooltip pops in above it over 150ms.
3. Center Coin Action:
   - Tap opens Assistant modal sheet immediately.
   - Press and hold begins voice capture; on release opens Assistant with audio query. Release under 300ms acts as tap.
