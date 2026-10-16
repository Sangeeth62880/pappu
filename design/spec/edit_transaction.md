# Screen Specification: Edit Transaction Bottom Sheets

This specification covers both variants of the Edit Transaction Bottom Sheet: Expense version (`design/stitch/edit_transaction.html`) and Person version (`design/stitch/edit_transaction_person.html`).

## 1. Frame Geometry

- Viewport Width: 390px
- Viewport Height: 844px
- Presentation: Bottom sheet presented over dimmed canvas
- Backdrop: Flat `#1F2937` at 40% opacity (no blur)
- Sheet Container: Surface white `#FFFFFF`, top left and top right radius 32px (`rounded-t-[32px]`), 2px solid `border` `#F0E4C8`, padding 20px, anchored to bottom
- Top Handle: Width 36px, height 4px, radius 999px, background `border` `#F0E4C8`, centered, margin bottom 16px

## 2. Element Hierarchy: Expense Variant

### Element 1: Sheet Header
- Height: 44px, flex row items center justify between, margin bottom 16px
- Title: "Edit transaction", Baloo Chettan 2 Bold 24px, line height 28px, `ink` `#1F2937`
- Close Button: 40px circle (`w-10 h-10`), white fill, 2px border `#F0E4C8`, Lucide `x` icon (20px, `ink` `#1F2937`)

### Element 2: Amount Block
- Label: "Amount", Nunito 13px Bold, `ink_muted` `#6B7280`
- Amount Figure: "₹250", Baloo Chettan 2 Extrabold 32px, line height 36px, `expense` `#E5484D`, tabular numbers

### Element 3: Type Segmented Control
- Label: "Type", Nunito 13px Bold, `ink_muted` `#6B7280`, margin bottom 6px
- Segmented Pair (flex row, equal width, gap 10px):
  - "Expense" Segment:
    - Height: 44px (`h-11`)
    - Fill: `gold` `#FFC83D`
    - Border: 1px solid `ink` `#1F2937`
    - Bottom Edge: 3px solid `gold_edge` `#D99A00` (`shadow-[0_3px_0_#D99A00]`)
    - Corner Radius: 14px (`rounded-[14px]`)
    - Text: Baloo Chettan 2 Bold 16px, `ink` `#1F2937`
  - "Income" Segment:
    - Height: 44px (`h-11`)
    - Fill: Surface white `#FFFFFF`
    - Border: 2px solid `border` `#F0E4C8`
    - Corner Radius: 14px
    - Text: Baloo Chettan 2 Bold 16px, `ink_muted` `#6B7280`

### Element 4: Description Field
- Label: "Description", Nunito 13px Bold, `ink_muted` `#6B7280`
- Value Container: Height 52px, surface white, 2px `border` `#F0E4C8`, radius 16px, padding x 16px, flex items center
- Text: "Lunch", Nunito 15px Bold, `ink` `#1F2937`

### Element 5: Category Selector Chips
- Label: "Category", Nunito 13px Bold, `ink_muted` `#6B7280`, margin bottom 6px
- Layout: Horizontal scroll list, gap 8px
- Chips:
  - "Food" (Selected):
    - Height: 40px (`h-10`), padding horizontal 16px
    - Fill: `gold` `#FFC83D`
    - Border: 1px solid `ink` `#1F2937`
    - Bottom Edge: 3px solid `gold_edge` `#D99A00`
    - Radius: 999px
    - Dot: 10px circle, `category_food` `#F97316`
    - Label: Baloo Chettan 2 Bold 14px, `ink` `#1F2937`
  - "Shopping": White fill, 2px border `#F0E4C8`, 10px dot `#0E7C86`, label 14px `ink_muted`
  - "Transport": White fill, 2px border `#F0E4C8`, 10px dot `#38BDF8`, label 14px `ink_muted`
  - "Other": White fill, 2px border `#F0E4C8`, 10px dot `#9CA3AF`, label 14px `ink_muted`

### Element 6: Date Field
- Label: "Date", Nunito 13px Bold, `ink_muted` `#6B7280`
- Value Container: Height 52px, surface white, 2px `border` `#F0E4C8`, radius 16px, padding x 16px, flex items center
- Text: "14 Oct 2026", Nunito 15px Bold, `ink` `#1F2937`

### Element 7: Action Buttons (Vertical Stack)
- Save Button:
  - Width: Full width, height 52px (`h-[52px]`)
  - Variant: Primary Button
  - Fill: `gold` `#FFC83D`
  - Bottom Edge: 4px solid `gold_edge` `#D99A00` (`shadow-[0_4px_0_#D99A00]`)
  - Corner Radius: 16px
  - Label: "Save", Baloo Chettan 2 Bold 17px, `ink` `#1F2937`
- Delete Button:
  - Width: Full width, height 52px (`h-[52px]`), margin top 12px
  - Variant: Destructive Outline Button
  - Fill: Surface white `#FFFFFF`
  - Border: 2px solid `expense` `#E5484D`
  - Bottom Edge: 4px solid `expense` `#E5484D` (`shadow-[0_4px_0_#E5484D]`)
  - Corner Radius: 16px
  - Leading Icon: Lucide `trash_2` (20px, `expense` `#E5484D`)
  - Label: "Delete", Baloo Chettan 2 Bold 17px, `expense` `#E5484D`
  - Action: Opens the Delete Transaction Confirmation Dialog

---

## 3. Element Hierarchy: Person Variant

- Header: "Edit transaction" (same as Expense)
- Amount Block: "₹500"
- Direction Segmented Control:
  - Label: "Direction"
  - Active Segment: "You paid" (Gold fill, 3px edge `#D99A00`, Baloo 16px Bold `ink`)
  - Inactive Segment: "They paid" (White fill, 2px border `#F0E4C8`, Baloo 16px Bold `ink_muted`)
- Description: "Sent to Pooja"
- Person Selector Row:
  - Label: "Person"
  - Container: Height 52px, white, 2px `border` `#F0E4C8`, radius 16px, padding x 16px, flex items center gap 10px
  - Avatar: 28px circle `#8B5CF6`/15 with initial "P"
  - Name: "Pooja", Baloo Chettan 2 Bold 16px, `ink` `#1F2937`
- Date Field: "14 Oct 2026"
- Action Buttons: Save (Primary gold 52px) and Delete (Destructive outline 52px)
