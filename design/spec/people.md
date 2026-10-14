# Screen Specification: People Screen & Detail States

This specification covers the People Main Screen, the Add Person Bottom Sheet, and the Person Detail Screen (Pooja) from `design/stitch/people.html`.

## 1. Frame Geometry

- Viewport Width: 390px
- Viewport Height: 844px
- Base Background: `bg` `#FFF8E7`
- Screen Border: 4px solid `ink` `#1F2937`, corner radius 40px
- Side Content Padding: 20px (`px-5`)
- Bottom Content Padding: 108px (`pb-[108px]`) to clear the 84px bottom tab bar

## 2. Element Hierarchy in Order: People Main Screen

### Element 1: Status Bar
- Height: 47px (`h-[47px]`), padding x 28px, top 12px
- Content: 9:41, cellular, wifi, battery glyphs

### Element 2: Header with Add Person Button
- Height: 64px (`h-[64px]`), padding x 20px
- Left: Coin mark 32px ('P') and wordmark "Pappu" in Baloo Chettan 2 Bold 20px (`ink` `#1F2937`)
- Right: Add Person Button
  - 40px circle (`w-10 h-10 rounded-full`)
  - Fill: `gold` `#FFC83D`
  - Border: 2px solid `ink` `#1F2937`
  - Bottom Edge: 3px solid `gold_edge` `#D99A00` (`border-b-[3px] border-b-[#D99A00]`)
  - Icon: Lucide `plus` icon (20px, 2px stroke, `ink` `#1F2937`)
  - Stitch Code:
    ```html
    <div class="w-10 h-10 rounded-full bg-[#FFC83D] border-2 border-[#1F2937] border-b-[3px] border-b-[#D99A00] flex items-center justify-center cursor-pointer active:translate-y-0.5">
      <svg class="w-5 h-5 text-[#1F2937]" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">...</svg>
    </div>
    ```

### Element 3: Search Bar
- Height: 52px (`h-[52px]`)
- Background: Surface white `#FFFFFF`
- Border: 2px solid `border` `#F0E4C8`
- Corner Radius: 16px (`rounded-2xl`)
- Padding: Horizontal 16px
- Leading Icon: Lucide `search` (20px, `ink_muted` `#6B7280`)
- Placeholder: "Search people...", Nunito 15px, `ink_muted` `#6B7280`

### Element 4: Debt Overview Card
- Container: Surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, padding 16px, vertical gap 12px
- Two Top Tiles (Equal width, flex row, gap 12px):
  - Tile 1 (Owed to you):
    - Background: `bg` `#FFF8E7`
    - Border: 2px solid `border` `#F0E4C8`
    - Radius: 16px (`rounded-2xl`), padding 12px
    - Label: "Owed to you", Nunito 13px Bold, `ink_muted` `#6B7280`
    - Amount: "₹6,700", Baloo Chettan 2 Bold 20px, `income` `#1F8A5B`
    - Count: "2 friends", Nunito 12px, `ink_muted` `#6B7280`
  - Tile 2 (You owe):
    - Background: `bg` `#FFF8E7`
    - Border: 2px solid `border` `#F0E4C8`
    - Radius: 16px, padding 12px
    - Label: "You owe", Nunito 13px Bold, `ink_muted` `#6B7280`
    - Amount: "₹1,000", Baloo Chettan 2 Bold 20px, `expense` `#E5484D`
    - Count: "2 friends", Nunito 12px, `ink_muted` `#6B7280`
- Divider: Horizontal 1px line in `border` `#F0E4C8`
- Bottom Net Row:
  - Left Label: "Net balance", Nunito 14px Bold, `ink` `#1F2937`
  - Right Net Figure: "+₹5,700", Baloo Chettan 2 Bold 16px, `income` `#1F8A5B`

### Element 5: Filter Chips
- Height: 40px (`h-10`)
- Layout: Horizontal scroll flex row, gap 8px (`gap-2`)
- Chips:
  1. "All 4": Active gold fill `#FFC83D`, 3px bottom edge `#D99A00`, Baloo 14px bold `ink` `#1F2937`
  2. "Owed to you 2": White fill, 2px border `#F0E4C8`, Baloo 14px bold `ink_muted` `#6B7280`
  3. "You owe 2": White fill, 2px border `#F0E4C8`, Baloo 14px bold `ink_muted` `#6B7280`

### Element 6: People List Card
- Container: Surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, overflow hidden
- List Rows (separated by 1px solid `border` `#F0E4C8` dividers):
  - Row 1 (Pooja):
    - Avatar: 44px circle, background `#8B5CF6`/15, initial "P" in Baloo 18px Bold `#8B5CF6`
    - Center Block: Name "Pooja" (Nunito 16px Bold `ink`), subtitle "Owes you" (Nunito 13px `ink_muted`)
    - Right Amount: "+₹6,200", Baloo Chettan 2 Bold 17px, `income` `#1F8A5B`
  - Row 2 (Anu):
    - Avatar: 44px circle, background `#8B5CF6`/15, initial "A"
    - Center Block: Name "Anu", subtitle "Owes you"
    - Right Amount: "+₹500", Baloo Chettan 2 Bold 17px, `income` `#1F8A5B`
  - Row 3 (Rony):
    - Avatar: 44px circle, background `#8B5CF6`/15, initial "R"
    - Center Block: Name "Rony", subtitle "You owe"
    - Right Amount: "−₹700", Baloo Chettan 2 Bold 17px, `expense` `#E5484D`
  - Row 4 (Sneha):
    - Avatar: 44px circle, background `#8B5CF6`/15, initial "S"
    - Center Block: Name "Sneha", subtitle "You owe"
    - Right Amount: "−₹300", Baloo Chettan 2 Bold 17px, `expense` `#E5484D`

### Element 7: Fixed Bottom Tab Bar
- Height: 84px, white, 2px top border `#F0E4C8`
- Slot 4 (People Tab): Active state with Lucide `users` icon in `ink` `#1F2937`, label "People" in Baloo 10px Bold `ink`, 6px circular gold dot underneath

---

## 3. Element Hierarchy: Add Person Bottom Sheet

- Overlay Backdrop: Flat `#1F2937` at 40% opacity (no blur)
- Sheet Container: Surface white `#FFFFFF`, top left and right radius 24px, 2px border `#F0E4C8`, padding 20px, anchored to bottom
- Top Handle: Width 36px, height 4px, radius 999px, background `border` `#F0E4C8`, centered, margin bottom 16px
- Title: "Add person", Baloo Chettan 2 Bold 22px, line height 26px, `ink` `#1F2937`, margin bottom 16px
- Form Fields (vertical stack, gap 12px):
  1. Name Input: Height 52px, radius 16px, background white, 2px border `#F0E4C8`, padding x 16px, placeholder "Name"
  2. Phone Input: Height 52px, radius 16px, background white, 2px border `#F0E4C8`, padding x 16px, placeholder "Phone (optional)"
  3. UPI ID Input: Height 52px, radius 16px, background white, 2px border `#F0E4C8`, padding x 16px, placeholder "UPI ID (optional)"
- Button Tray: Flex row, equal width, gap 12px, margin top 20px:
  - Left Button: "Cancel", Secondary button (height 52px, white fill, 2px border `#F0E4C8`, 4px bottom edge `#F0E4C8`, radius 16px, Baloo 17px Bold `ink`)
  - Right Button: "Save", Primary button (height 52px, gold fill `#FFC83D`, 4px bottom edge `gold_edge` `#D99A00`, radius 16px, Baloo 17px Bold `ink`)

---

## 4. Element Hierarchy: Person Detail Screen (Pooja)

- Layout: Full screen view pushed via navigation stack
- Header:
  - Height: 64px (`h-[64px]`), padding x 20px
  - Back Button: 40px circle, white fill, 2px border `#F0E4C8`, Lucide `arrow_left` icon (20px, `ink` `#1F2937`)
  - Title: "Pooja", Baloo Chettan 2 Bold 20px, `ink` `#1F2937`
  - Right: Blank
- Balance Hero Card:
  - Container: Surface white `#FFFFFF`, 2px `border` `#F0E4C8`, radius 20px, padding 20px, flex col items center, text center, gap 8px
  - Amount: "+₹6,200", Baloo Chettan 2 Extrabold 32px, line height 36px, `income` `#1F8A5B`
  - Caption: "Pooja owes you", Nunito 14px Bold, `ink_muted` `#6B7280`
  - Action Button: "Remind Pooja"
    - Width: Full width, height 52px (`h-[52px]`)
    - Fill: `gold` `#FFC83D`
    - Bottom Edge: 4px solid `gold_edge` `#D99A00` (`shadow-[0_4px_0_#D99A00]`)
    - Corner Radius: 16px
    - Leading Icon: Lucide `share_2` (20px, `ink` `#1F2937`)
    - Label: "Remind Pooja", Baloo Chettan 2 Bold 17px, `ink` `#1F2937`
    - Behavior: Triggers React Native built-in Share sheet with prewritten friendly reminder text
- Transactions Ledger Section:
  - Section Header: "Transactions", Baloo Chettan 2 Bold 18px, `ink` `#1F2937`, margin y 12px
  - Card: Surface white, 2px `border` `#F0E4C8`, radius 20px, overflow hidden
  - Item 1: Title "Dinner at Paragon", subtitle "12 Oct · Food", amount "+₹2,200" (Baloo 16px Bold `#1F8A5B`)
  - Item 2: Title "Swiggy split", subtitle "10 Oct · Food", amount "+₹4,000" (Baloo 16px Bold `#1F8A5B`)
