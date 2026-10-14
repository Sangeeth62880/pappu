# Screen Specification: Assistant Modal & Interaction States

This specification covers the Assistant Screen and all conversational interaction states from `design/stitch/assistant.html`.

## 1. Frame Geometry

- Viewport Width: 390px
- Viewport Height: 844px
- Presentation: Full screen modal bottom sheet presented over existing screen context
- Backdrop: Flat dim overlay in `ink` `#1F2937` at 40% opacity (no blur, no gradient)
- Sheet Background: `bg` `#FFF8E7` (or surface white `#FFFFFF` inner chat container)
- Sheet Top Border: 2px solid `border` `#F0E4C8`
- Sheet Corner Radius: Top left and top right 32px (`rounded-t-[32px]`)
- No Bottom Tab Bar: The bottom tab bar is completely hidden while Assistant is active

## 2. Element Hierarchy in Order

### Element 1: Sheet Header & Close Button
- Height: 56px (`h-[56px]`), padding horizontal 20px, flex row items center justify between
- Left Item: Blank
- Center Item: Small status pill or blank
- Right Item: Close Button
  - 40px circle (`w-10 h-10 rounded-full`)
  - Background: Surface white `#FFFFFF`
  - Border: 2px solid `border` `#F0E4C8`
  - Icon: Lucide `x` (20px, 2px stroke, `ink` `#1F2937`)
  - Action: Closes modal sheet with slide down transition over 240ms

### Element 2: Mascot Hero & State Caption
- Container: Flex col items center justify center, padding top 8px, padding bottom 16px
- Mascot Avatar: 120px diameter character container (`w-[120px] h-[120px]`)
- State Poses:
  - Listening State: 120px Pappu in Listening pose (hand cupped to ear)
  - Thinking State: 120px Pappu in Thinking pose (hand on chin, looking upward)
  - Speaking State: 120px Pappu in Speaking pose (gesturing hand, open mouth)
  - Confused State: 120px Pappu in Confused pose (tilted head with question mark)
- State Caption (directly beneath mascot):
  - Listening: "Listening…", Nunito 14px Bold, `ink_muted` `#6B7280`
  - Thinking: "One sec…", Nunito 14px Bold, `ink_muted` `#6B7280`
  - Speaking: "Pappu is talking", Nunito 14px Bold, `ink_muted` `#6B7280`
  - Confused: "Didn't catch that. Try again?", Nunito 14px Bold, `ink_muted` `#6B7280`
- Stitch Code:
  ```html
  <div class="flex flex-col items-center justify-center shrink-0">
    <div class="w-[120px] h-[120px] relative flex items-center justify-center mb-2">...</div>
    <span class="text-[13px] font-bold text-[#6B7280] tracking-wide uppercase">Listening…</span>
  </div>
  ```

### Element 3: Conversational Feed
- Container: Flex 1, overflow vertical scroll, padding horizontal 16px, gap 12px
- Message Components:

#### Component A: User Query Bubble
- Alignment: Right aligned (`self-end`)
- Max Width: 280px
- Background: `gold` `#FFC83D` (or surface white `#FFFFFF` with 2px `border` `#F0E4C8`)
- Border: 1px solid `ink` `#1F2937` (or 2px `#F0E4C8`)
- Bottom Edge: 3px solid `gold_edge` `#D99A00`
- Corner Radius: 20px, bottom right corner 4px (`rounded-2xl rounded-br-sm`)
- Padding: 12px 16px
- Text: Nunito 15px Semibold, line height 22px, `ink` `#1F2937`
- Timestamp: Nunito 11px, `ink_muted` `#6B7280`, right aligned beneath bubble

#### Component B: Pappu Response Bubble
- Alignment: Left aligned (`self-start`)
- Max Width: 300px
- Background: Surface white `#FFFFFF`
- Border: 2px solid `border` `#F0E4C8`
- Corner Radius: 20px, bottom left corner 4px (`rounded-2xl rounded-bl-sm`)
- Padding: 14px 16px
- Text: Nunito 15px Semibold, line height 22px, `ink` `#1F2937`
- Audio Replay Action: Trailing speaker icon (Lucide `volume_2`, 18px, `teal` `#0E7C86` or `ink_muted`), tapping replays `spoken_text`
- Timestamp: Nunito 11px, `ink_muted` `#6B7280`, left aligned beneath bubble

#### Component C: Thinking / Parsing Bubble
- Alignment: Left aligned
- Container: Surface white, 2px `border` `#F0E4C8`, radius 20px, padding 14px 20px
- Content: 3 horizontal animated dots (8px diameter circles, `ink` `#1F2937`, cycling bounce over 600ms)

#### Component D: Speaking & Waveform Indicator
- Container: Surface white card, 2px `border` `#F0E4C8`, radius 20px, padding 14px 16px
- Content:
  - Transcript Text: Nunito 15px Semibold `ink`
  - TTS Audio Indicator: 4 vertical bars oscillating heights between 8px and 20px next to "Playing audio"

#### Component E: Destructive Confirmation Card (Delete Transaction)
- Container: Surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, padding 16px, margin y 8px, gap 12px
- Heading: "Delete ₹300 to Rahul on 14 Oct?", Baloo Chettan 2 Bold 18px, line height 22px, `ink` `#1F2937`
- Meta Tags Row: Rahul, 14 Oct, Other (Nunito 13px bold pills in `bg` `#FFF8E7`, border 1px `#F0E4C8`)
- Action Button Tray (flex row, equal width, gap 12px, margin top 12px):
  - Left Button: "Delete", Destructive button (height 52px, coral red `#E5484D`, 4px bottom edge `expense_edge` `#B4232A`, radius 16px, Baloo 17px Bold white)
  - Right Button: "Keep it", Secondary button (height 52px, white fill, 2px border `#F0E4C8`, 4px bottom edge `#F0E4C8`, radius 16px, Baloo 17px Bold `ink`)
- Stitch Code:
  ```html
  <div class="bg-white border-2 border-borderCream rounded-[20px] p-4 flex flex-col gap-3">
    <h2 class="font-baloo font-bold text-[18px] text-ink leading-snug">Delete ₹300 to Rahul on 14 Oct?</h2>
    <div class="flex items-center gap-2">
      <span class="px-2.5 py-1 rounded-full bg-cream border border-borderCream text-xs font-nunito font-semibold text-ink">Rahul</span>
      <span class="px-2.5 py-1 rounded-full bg-cream border border-borderCream text-xs font-nunito font-semibold text-inkMuted">14 Oct</span>
    </div>
    <div class="flex items-center gap-3 mt-1">
      <button class="flex-1 h-[52px] bg-expense border-b-4 border-expenseEdge text-white font-baloo font-bold text-[17px] rounded-[16px] px-3 flex items-center justify-center">Delete</button>
      <button class="flex-1 h-[52px] bg-white border-2 border-borderCream border-b-4 text-ink font-baloo font-bold text-[17px] rounded-[16px] px-3 flex items-center justify-center">Keep it</button>
    </div>
  </div>
  ```

#### Component F: Confused / Retry Card
- Header: "Didn't catch that. Try again?"
- Action: "Try again" primary button (height 52px, gold fill `#FFC83D`, 4px edge `#D99A00`, Baloo 17px bold)

### Element 4: Suggestion Chips Bar
- Layout: Horizontal scroll list directly above input bar, gap 8px, padding horizontal 16px, padding y 8px
- Chip Items:
  - "Sent 500 to Pooja"
  - "ചായ 20 രൂപ"
  - "Food this week?"
- Chip Styling: Height 36px (`h-9`), padding horizontal 14px, surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, corner radius 999px, text Nunito / Malayalam 14px Semibold `ink` `#1F2937`

### Element 5: Input Bar (Thumb Reach Zone)
- Height: 68px, padding horizontal 16px, padding bottom 12px, flex row items center gap 10px
- Text Input Container:
  - Flex 1, height 52px (`h-[52px]`)
  - Background: Surface white `#FFFFFF`
  - Border: 2px solid `border` `#F0E4C8`
  - Corner Radius: 16px (`rounded-[16px]`)
  - Padding: Horizontal 16px
  - Placeholder: "Type or say anything…", Nunito 15px, `ink_muted` `#6B7280`
- Mic Coin Button:
  - Width: 52px, height 52px, circular (`rounded-full`)
  - Background: `gold` `#FFC83D`
  - Border: 2px solid `ink` `#1F2937`
  - Bottom Edge: 3px solid `gold_edge` `#D99A00` (`shadow-[0_3px_0_#D99A00]`)
  - Icon: Lucide `mic` (22px, 2px stroke, `ink` `#1F2937`)
  - Interaction: Press and hold streams audio capture; tap initiates audio capture.

## 3. Motion & State Machine Transitions

- Entry: Modal sheet translates upward from bottom over 280ms (`cubic-bezier(0.32, 0.72, 0, 1)`).
- Poses crossfade over 200ms when transitioning between Listening, Thinking, Speaking, and Confused.
- New message bubbles pop into feed over 180ms with subtle scale and translation.
