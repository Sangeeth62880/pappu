# Screen Specification: Me Screen & Dialog States

This specification covers the Me Screen (Profile & Settings) and its dialog states from `design/stitch/me.html`.

## 1. Frame Geometry

- Viewport Width: 390px
- Viewport Height: 844px
- Base Background: `bg` `#FFF8E7`
- Screen Border: 4px solid `ink` `#1F2937`, corner radius 40px
- Side Content Margins: 20px (`px-5`)
- Bottom Content Padding: 108px (`pb-[108px]`) to clear the 84px bottom tab bar

## 2. Element Hierarchy in Order: Me Main Screen

### Element 1: Status Bar
- Height: 47px (`h-[47px]`), horizontal padding 24px, top 12px
- Content: 9:41, cellular, wifi, battery glyphs

### Element 2: App Header
- Height: 64px (`h-[64px]`), horizontal padding 20px
- Left: Coin mark 32px ('P') and wordmark "Pappu", Baloo Chettan 2 Bold 20px, `ink` `#1F2937`
- Right: Blank

### Element 3: Profile Card
- Container: Surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, padding 16px, flex row items center, gap 16px
- Left Avatar: 72px diameter circle (`w-[72px] h-[72px] rounded-full`), background `gold` `#FFC83D`, perimeter 2px solid `ink` `#1F2937`, inner gold edge `#D99A00`, center ₹ glyph or Pappu avatar
- Center User Info:
  - User Name: "Sangeeth", Baloo Chettan 2 Bold 20px, line height 24px, `ink` `#1F2937`
  - User Email: "test@pappu.dev", Nunito 14px, line height 20px, `ink_muted` `#6B7280`
- Stitch Code:
  ```html
  <div class="card-white p-4 flex items-center space-x-4">
    <div class="w-[72px] h-[72px] relative flex-shrink-0 flex items-center justify-center">
      <div class="w-full h-full rounded-full bg-[#FFC83D] border-2 border-[#1F2937] flex items-center justify-center relative shadow-[0_3px_0_#D99A00]">
        <span class="font-baloo font-extrabold text-2xl text-[#1F2937]">₹</span>
      </div>
    </div>
    <div class="flex-1 min-w-0">
      <h2 class="font-baloo font-bold text-lg text-[#1F2937] truncate">Sangeeth</h2>
      <p class="text-xs font-bold text-[#6B7280] truncate">test@pappu.dev</p>
    </div>
  </div>
  ```

### Element 4: Settings Card
- Container: Surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, overflow hidden, internal rows separated by 1px solid `border` `#F0E4C8` dividers
- Rows in Order:
  1. Language Preference Row:
     - Height: 56px (`h-[56px]`), padding horizontal 16px, flex row items center justify between
     - Left Label: "Language", Nunito 15px Bold, `ink` `#1F2937`
     - Right Segmented Pill:
       - Container: Height 32px, background `bg` `#FFF8E7`, border 1px solid `border` `#F0E4C8`, radius 999px, padding 2px, flex row items center
       - Active Segment ("English"): Height 28px, padding horizontal 12px, background `gold` `#FFC83D`, 2px bottom edge `gold_edge` `#D99A00`, radius 999px, text Baloo Chettan 2 Bold 13px `ink`
       - Inactive Segment ("മലയാളം"): Height 28px, padding horizontal 12px, transparent fill, text Noto Sans Malayalam Bold 13px `ink_muted` `#6B7280`
  2. Dialect Row (Conflict Note):
     - Stitch shows a "Dialect" row with value "Manglish".
     - Decision in context document: "Dialect row is removed because the planner has no dialect input."
  3. Voice Replies Row:
     - Height: 56px (`h-[56px]`), padding horizontal 16px, flex row items center justify between
     - Left Label: "Voice replies", Nunito 15px Bold, `ink` `#1F2937`
     - Right Toggle Switch:
       - Width: 46px, height 26px, corner radius 999px
       - Active Track Fill: `gold` `#FFC83D` (Inactive: `border` `#F0E4C8`)
       - Border: 2px solid `gold_edge` `#D99A00` (Inactive: 2px `#D2C5AD`)
       - Circular Thumb: 20px circle, surface white `#FFFFFF`, border 1px solid `ink` `#1F2937`, translates 20px on active
  4. Clear Chat History Row:
     - Height: 56px (`h-[56px]`), padding horizontal 16px, flex row items center justify between, cursor pointer
     - Left Group: Lucide `trash_2` or `message_square` icon (18px, `expense` `#E5484D`), Title "Clear chat history", Nunito 15px Bold, `expense` `#E5484D`
     - Right: Lucide `chevron_right` icon (18px, `expense` `#E5484D`)
     - Action: Opens the "Clear chat history?" Dialog State

### Element 5: Sign Out Button
- Placement: Directly below Settings card, margin top 16px
- Width: Full width, height 52px (`h-[52px]`)
- Variant: Destructive Outline (`btn-destructive-outline`)
- Fill: Surface white `#FFFFFF`
- Border: 2px solid `expense` `#E5484D`
- Bottom Edge: 4px solid `expense` `#E5484D` (`shadow-[0_4px_0_#E5484D]`)
- Corner Radius: 16px
- Label: "Sign out", Baloo Chettan 2 Bold 17px, line height 22px, `expense` `#E5484D`
- Action: Opens the "Sign out?" Dialog State

### Element 6: Fixed Bottom Tab Bar
- Height: 84px, white, 2px top border `#F0E4C8`
- Slot 5 (Me Tab): Active state with Lucide `user` icon in `ink` `#1F2937`, label "Me" in Baloo 10px Bold `ink`, 6px circular gold dot underneath

---

## 3. Dialog State 1: "Clear chat history?"

- Presentation: Modal dialog centered over dimmed canvas
- Backdrop: Flat `#1F2937` at 40% opacity (no blur, no gradient)
- Dialog Card Container:
  - Width: 340px (or full width minus 40px side margins)
  - Background: Surface white `#FFFFFF`
  - Border: 2px solid `border` `#F0E4C8`
  - Corner Radius: 20px (`rounded-[20px]`)
  - Padding: 20px (`p-5`)
  - Elevation: Flat 4px drop edge (`shadow-[0_4px_0_#F0E4C8]`)
- Content Elements:
  - Heading: "Clear chat history?", Baloo Chettan 2 Bold 20px, line height 24px, `ink` `#1F2937`, margin bottom 8px
  - Description: "This removes all your messages with Pappu. Your transactions stay.", Nunito 15px, line height 22px, `ink_muted` `#6B7280`, margin bottom 20px
  - Action Button Tray (flex row, equal width, gap 12px):
    - Left Button: "Cancel", Secondary button (height 52px, white fill, 2px border `#F0E4C8`, 4px bottom edge `#F0E4C8`, radius 16px, Baloo 17px Bold `ink`)
    - Right Button: "Clear", Destructive button (height 52px, coral red `#E5484D`, 4px bottom edge `expense_edge` `#B4232A`, radius 16px, Baloo 17px Bold white)

---

## 4. Dialog State 2: "Sign out?"

- Presentation: Modal dialog centered over dimmed canvas
- Backdrop: Flat `#1F2937` at 40% opacity
- Dialog Card Container:
  - Width: 340px, surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, padding 20px
- Content Elements:
  - Heading: "Sign out?", Baloo Chettan 2 Bold 20px, line height 24px, `ink` `#1F2937`, margin bottom 8px
  - Description: "You can sign back in anytime with your email.", Nunito 15px, line height 22px, `ink_muted` `#6B7280`, margin bottom 20px
  - Action Button Tray (flex row, equal width, gap 12px):
    - Left Button: "Stay", Secondary button (height 52px, white fill, 2px border `#F0E4C8`, 4px bottom edge `#F0E4C8`, radius 16px, Baloo 17px Bold `ink`)
    - Right Button: "Sign out", Destructive button (height 52px, coral red `#E5484D`, 4px bottom edge `expense_edge` `#B4232A`, radius 16px, Baloo 17px Bold white)
