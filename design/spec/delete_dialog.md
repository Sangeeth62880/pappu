# Screen Specification: Delete Transaction Confirmation Dialog

This specification covers the standalone Delete Transaction Confirmation Dialog from `design/stitch/delete_dialog.html`.

## 1. Frame Geometry

- Viewport Width: 390px
- Viewport Height: 844px
- Presentation: Modal dialog centered vertically and horizontally over existing viewport
- Backdrop: Flat dim overlay in `ink` `#1F2937` at 40% opacity (no blur, no gradient)
- Dialog Card Container:
  - Width: 340px (or full width minus 40px side gutters)
  - Background: Surface white `#FFFFFF`
  - Border: 2px solid `border` `#F0E4C8`
  - Corner Radius: 20px (`rounded-[20px]`)
  - Padding: 20px (`p-5`)
  - Elevation: Flat 4px bottom edge (`shadow-[0_4px_0_#F0E4C8]`)

## 2. Element Hierarchy in Order

### Element 1: Warning Icon Anchor
- Container: 48px circle (`w-12 h-12 rounded-full`), centered horizontally, margin bottom 12px
- Background: Coral red tint `expense`/15 (`bg-[#E5484D]/15`)
- Icon: Lucide `trash_2` (24px, 2px stroke, `expense` `#E5484D`)

### Element 2: Heading
- Text: "Delete this transaction?"
- Typography: Baloo Chettan 2 Bold 18px, line height 22px, `ink` `#1F2937`, text center, margin bottom 6px

### Element 3: Transaction Echo Card
- Container: Background `bg` `#FFF8E7`, border 1px solid `border` `#F0E4C8`, radius 12px, padding 12px, margin bottom 12px
- Content:
  - Row 1: Title "Lunch" (Nunito 15px Bold `ink`), Amount "−₹250" (Baloo Chettan 2 Bold 16px `expense` `#E5484D`)
  - Row 2: Subtitle "14 Oct · Food" (Nunito 13px `ink_muted` `#6B7280`)

### Element 4: Explanatory Subtitle
- Text: "This cannot be undone. Your balances will update immediately."
- Typography: Nunito 14px, line height 20px, `ink_muted` `#6B7280`, text center, margin bottom 20px

### Element 5: Action Button Tray
- Layout: Flex row, equal width, gap 12px
- Left Button: "Keep it"
  - Height: 48px (`h-[48px]`)
  - Variant: Secondary Button
  - Fill: Surface white `#FFFFFF`
  - Border: 2px solid `border` `#F0E4C8`
  - Bottom Edge: 4px solid `border` `#F0E4C8` (`shadow-[0_4px_0_#F0E4C8]`)
  - Corner Radius: 16px (`rounded-2xl`)
  - Label: "Keep it", Baloo Chettan 2 Bold 16px, `ink` `#1F2937`
  - Action: Dismisses dialog modal without mutation over 140ms
- Right Button: "Delete"
  - Height: 48px (`h-[48px]`)
  - Variant: Destructive Button
  - Fill: `expense` `#E5484D`
  - Bottom Edge: 4px solid `expense_edge` `#B4232A` (`shadow-[0_4px_0_#B4232A]`)
  - Corner Radius: 16px (`rounded-2xl`)
  - Label: "Delete", Baloo Chettan 2 Bold 16px, text white `#FFFFFF`
  - Action: Dispatches delete API mutation, triggers 200ms row collapse in History feed, closes modal
- Stitch Code:
  ```html
  <div class="flex items-center gap-3">
    <button class="h-[48px] w-full bg-white border-2 border-[#F0E4C8] shadow-[0_4px_0_#F0E4C8] rounded-2xl flex items-center justify-center active:translate-y-1 active:shadow-none transition-all">
      <span class="font-baloo font-bold text-[16px] leading-none text-[#1F2937]">Keep it</span>
    </button>
    <button class="h-[48px] w-full bg-[#E5484D] shadow-[0_4px_0_#B4232A] rounded-2xl flex items-center justify-center active:translate-y-1 active:shadow-none transition-all">
      <span class="font-baloo font-bold text-[16px] leading-none text-white">Delete</span>
    </button>
  </div>
  ```

## 3. Motion & Transitions

- Entry: Background dim fades in over 150ms. Dialog container scales in from `0.94` to `1.0` with opacity `0` to `1` over 180ms (`cubic-bezier(0.16, 1, 0.3, 1)`).
- Exit: Dialog container scales down `1.0` to `0.96` with opacity `1` to `0` over 140ms while scrim fades.
