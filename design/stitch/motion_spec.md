# Pappu Motion Specification & Interaction Design System

## Core Motion Principles (Functional Only, Zero Slop)
Every motion in Pappu has a direct communicative function: confirming user agency, communicating computational or network state, clarifying spatial hierarchy, or reinforcing financial sentiment. **All decorative loops, gratuitous ambient floats, sparkles, and non-informative animations are strictly prohibited.**

---

## 1. Global & Shared Components Motion Spec

| Element | Trigger | Motion | Duration | Easing | Reduce-Motion Fallback | Communicates |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Button** (`#FFC83D`, 4px `#D99A00` bottom edge) | `pointerdown` / click / tap | `translateY(4px)` with bottom border height reducing from `4px` to `0px`. Light haptic pulse. On release: snaps back with `translateY(0px)`. | `80ms` down / `120ms` release | `cubic-bezier(0, 0, 0.2, 1)` (ease-out) | Instant state switch: border changes to pressed state with zero translation, haptic preserved. | Tactile affordance; physical confirmation of intentional press before dispatching payment or mutation. |
| **Secondary Button** (White, 4px `#F0E4C8` edge) | `pointerdown` / click / tap | `translateY(4px)` with 4px bottom edge collapsing to `0px`. Light haptic. | `80ms` down / `120ms` release | `ease-out` | Instant active state with zero translation. | Tactile confirmation of secondary cancellation or dismiss. |
| **Destructive Button** (`#E5484D`, 4px `#B4232A` edge) | `pointerdown` / click / tap | `translateY(4px)` with 4px bottom edge collapsing to `0px`. Medium haptic pulse. | `80ms` down / `120ms` release | `ease-out` | Instant active state with zero translation. | Critical tactile friction confirming destructive action (deletion, clearing). |
| **Bottom Tab Bar Item** (Home, History, People, Me) | Tap on inactive tab | Active icon scales up to `1.15` and snaps back to `1.0` (bounce). Active 6px gold indicator dot slides horizontally from previous tab slot into current tab slot. | `250ms` | `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring-like overshoot) | Instant icon switch and instant dot jump (`0ms`). | Clarifies viewport navigation and confirms new active context. |
| **Center Pappu Mic Tab Button** (72px raised coin) | Tap / Hold initiation | Coin tilts `10°` clockwise (`rotate(10deg)`), expands slightly `scale(1.06)`, then springs into active Assistant overlay. Light haptic. | `200ms` | `cubic-bezier(0.34, 1.3, 0.64, 1)` | No tilt/scale; instant Assistant modal presentation (`0ms`). | Acknowledges voice mode initiation and signals active listening readiness. |
| **Pappu Idle Mascot Blink** | Ambient idle (any idle state) | Eyelids close (`scaleY(0.1)` on pupils and eye shapes) for `120ms`, then snap back open. Random interval every `3–5s`. | `120ms` blink cycle | `ease-in-out` | Disabled entirely (`scaleY(1.0)` static). | Communicates that the assistant is awake, responsive, and ready for input. |
| **Pappu Inactivity Sleepy State** | `60s` of zero user touch or voice interaction | Pappu crossfades into the **Sleepy pose** (closed eye arcs, hanging arms). Single small "z" floats upward `12px` and fades out every `4s`. | `300ms` transition into pose; `2000ms` "z" drift | `ease-out` | Instant swap to static Sleepy pose without floating particles. | Communicates session standby; conserves user attention and prompts fresh action when returning. |
| **Mascot Pose Transition Engine** (idle ↔ listening ↔ thinking ↔ speaking ↔ happy / worried / confused) | State machine transition event | Simultaneous `opacity` crossfade (`1 → 0` outgoing, `0 → 1` incoming) with micro-scale adjustment `scale(0.96 → 1.0)`. | `200ms` | `cubic-bezier(0.2, 0, 0, 1)` | Instant frame replacement (`0ms` crossfade). | Immediately reflects system status (listening to input, parsing query, outputting audio, emotional validation). |
| **Coin Shower Celebration** | Income logged (e.g. Salary `+₹15,000`) or milestone achieved. **Strictly never on expenses.** | Exactly `10–12` flat vector gold coins (`24px` size) emit from the income amount card, fountain upward `60px`, and cascade off-screen with slight rotational physics (`-15°` to `+15°`). | `1200ms` total | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` gravity fall | Display a subtle static green flash `#1F8A5B` on the amount container (`150ms`). | Explicit positive reinforcement for earning/saving money without recurring visual fatigue. |

---

## 2. Screen: Pappu Home

| Element | Trigger | Motion | Duration | Easing | Reduce-Motion Fallback | Communicates |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Total Spend Amount Display** (`₹5,109`) | Screen mount / Period switch (Week/Month/Year) | Tabular numeral count-up from `0` to target amount (e.g., `0 → 5109`). | `400ms` | `cubic-bezier(0, 0, 0.2, 1)` (ease-out) | Instant display of target value (`0ms`). | Signals fresh calculation and dynamic data aggregation for the selected timeframe. |
| **Income & Net Amounts** (`+₹65,000`, `+₹59,891`) | Screen mount / Period switch | Tabular numerals count up in sync with Spend Card with `50ms` delay. | `400ms` | `ease-out` | Instant display (`0ms`). | Reassures that credit and net balance metrics are refreshed simultaneously. |
| **Segmented Control Pill** ("Week" / "Month" / "Year") | Segment tab press | Gold fill background slider slides horizontally under the selected label (`translateX`). | `180ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Instant background jump to selected segment (`0ms`). | Visual continuity of selection state across aggregated timeframes. |
| **Daily Spending Bar Chart** (Mon–Sun Bars) | Card enter viewport / Period toggle | Bars scale up vertically from base (`scaleY(0) → scaleY(1)` with `transform-origin: bottom`). Staggered per bar by `40ms` (Mon at `0ms`, Tue at `40ms`, Wed at `80ms`, etc.). | `300ms` per bar | `cubic-bezier(0.34, 1.25, 0.64, 1)` (ease-out-back with subtle settle) | Bars render at final heights instantly (`0ms`). | Conveys chronological daily distribution and highlights peak spending days. |
| **Selected Bar Tooltip** (Tuesday `₹3,250` pill) | Tuesday bar peak reached (`300ms` after Tuesday bar start) | Pops in above bar: `scale(0.8) → scale(1.0)` and `translateY(4px) → translateY(0px)`, opacity `0 → 1`. | `150ms` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | Tooltip appears statically at full opacity (`0ms`). | Directs focus to the primary outlier/peak transaction value of the week. |
| **"Where It Went" Progress Bars** (Food, Shopping, Other, Transport) | Section enters viewport | Horizontal bar width expands from `0%` to target percentage (63%, 24%, 10%, 3%). | `350ms` staggered by `30ms` per row | `ease-out` | Bars render at target width immediately (`0ms`). | Relative proportion of categorized outflow visually digested in hierarchy. |
| **Recent List Row Addition** | New transaction recorded | Newly added list row slides down and in from top: `translateY(-16px) → translateY(0px)` while opacity transitions `0 → 1`. Existing rows translate downward. | `200ms` | `cubic-bezier(0.2, 0, 0, 1)` | Instant insertion at top of list (`0ms`). | Confirms successful insertion of newly logged item into chronological history. |

---

## 3. Screen: Pappu Assistant (Voice & Chat Sheet)

| Element | Trigger | Motion | Duration | Easing | Reduce-Motion Fallback | Communicates |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Full-Sheet Entry** | Assistant invoked from Mic tab button | Bottom sheet slides up from screen bottom (`translateY(100%) → translateY(0)`). Dim background overlay fades to 40%. | `280ms` | `cubic-bezier(0.32, 0.72, 0, 1)` | Instant modal display (`0ms`). | Establishes modal focus layer dedicated to conversational AI interaction. |
| **Pappu Header Mascot** (Listening State) | Sheet opens | 120px Pappu transitions to Listening pose (hand to ear). Subtitle "Listening…" pulses subtly once (`opacity: 0.6 → 1.0`). | `200ms` | `ease-out` | Static Listening pose without text pulse. | Confirms audio input capture hardware is actively listening. |
| **User Message Bubble** | Speech processed / sent | Bubble pops into chat feed from bottom right: `scale(0.92) → scale(1.0)`, `translateY(12px) → translateY(0)`, opacity `0 → 1`. | `180ms` | `cubic-bezier(0, 0, 0.2, 1)` | Instant bubble appearance (`0ms`). | Confirms transcript accuracy of user utterance. |
| **Thinking Indicator** (Three-Dot Bubble) | Query submitted to backend | Mascot crossfades to Thinking pose (`200ms`). In Pappu bubble, 3 dots cycle vertical bounce (`translateY(-4px) → 0`) sequentially staggered by `120ms`. | `600ms` loop during processing | `ease-in-out` | Static three dots with zero bounce; static Thinking pose. | Reassures user that natural language inference and DB lookup are underway. |
| **Pappu Speaking State & TTS Waveform** | Assistant response stream begins | Mascot crossfades to Speaking pose (`200ms`). 4-bar waveform next to "Playing audio" oscillates heights (`8px ↔ 20px`). | `800ms` loop while audio plays | `ease-in-out` | Waveform renders as static bars; static Speaking pose. | Confirms live audio playback synchronization with on-screen transcript. |
| **Confirmation Card Slide-Up** ("Delete ₹300 to Rahul?") | Assistant requires dangerous confirmation | Card slides upward into view `translateY(16px) → translateY(0)` with opacity `0 → 1`. Action buttons lock into thumb reach. | `220ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Instant card appearance (`0ms`). | Demands conscious confirmation prior to state mutation. |
| **Suggestion Chips** | Conversation turn finishes | Suggestion pills slide horizontally from right edge staggered by `30ms`. | `200ms` | `ease-out` | Static pills appear without slide (`0ms`). | Offers one-tap subsequent quick follow-ups. |

---

## 4. Screen: Pappu History

| Element | Trigger | Motion | Duration | Easing | Reduce-Motion Fallback | Communicates |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Filter Chip Selection** ("All", "Expenses", "Income", "People") | Tap on unselected chip | Selected chip fill changes to `#FFC83D` with 3px `#D99A00` bottom edge; content list crossfades. | `150ms` | `ease-out` | Instant style swap and instant list update. | Confirms transactional filtering category. |
| **Swipe-to-Delete Action Reveal** | Horizontal finger drag leftwards on row | Row content tracks user finger 1:1 (`translateX(-dx)`). Beneath, destructive coral `#E5484D` container reveals with trash icon scaling from `0.7 → 1.0` as threshold is crossed (`80px`). | Direct touch tracking (`1:1` physics) | Linear during drag; `160ms` snap back if released under threshold | Discrete trash icon reveal without dynamic scale; swipe threshold triggers modal delete confirmation. | Physical feedback of intent to remove transaction; eliminates accidental deletions. |
| **Swipe-to-Delete Completion** | Finger release beyond `120px` threshold or "Delete" tapped | Row collapses height (`56px → 0px`), opacity fades `1 → 0`, items below glide up to close gap. Medium haptic. | `220ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Instant item removal from DOM (`0ms`). | Clear, satisfying confirmation of transaction removal. |
| **Empty State Appearance** ("Nothing here yet") | Filter returns 0 records / all items deleted | Pappu Sleepy pose (120px) fades in with text `opacity: 0 → 1` and micro `translateY(8px → 0)`. | `250ms` | `ease-out` | Instant static display of empty state (`0ms`). | Signals zero records exist for the selected criteria and prompts new input. |

---

## 5. Screen: Pappu People

| Element | Trigger | Motion | Duration | Easing | Reduce-Motion Fallback | Communicates |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Add Person (+) Button Press** (App Header Right) | Tap header `+` gold circular button | Button depresses `translateY(3px)` (`80ms`). "Add person" bottom sheet slides up from screen bottom. | Button: `80ms` / Sheet: `260ms` | `cubic-bezier(0.32, 0.72, 0, 1)` | Button state switches instantly; sheet appears without transition. | Direct connection between Add trigger and creation form. |
| **"Add person" Bottom Sheet Drag Dismiss** | Downward drag on top handle bar | Sheet follows downward drag (`1:1`). If dragged past `100px`, sheet dismisses downward off-screen. | `Direct` drag / `180ms` dismissal | `ease-in` | Tap close button (`×`) closes sheet immediately. | Natural spatial dismissal matching mobile OS modal primitives. |
| **Person Row Tap** (Pooja, Anu, Rony) | Row pressed | Row background shifts from `#FFFFFF` to `#EFF4FF` tint (`100ms`). Navigation pushes to Person Detail screen from right (`translateX(100% → 0%)`). | `240ms` | `cubic-bezier(0.2, 0, 0, 1)` | Instant screen replacement (`0ms`). | Confirms selection and transitions from aggregate balance to itemized ledger. |
| **"Remind Pooja" Primary Action** | Tap "Remind Pooja" button | Primary button press (`translateY(4px)`, `80ms`). Small Pappu mascot hops `6px` upward (`rotate(-5deg) → rotate(0deg)`). Success toast slides down from top. | `220ms` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Button press without mascot hop; static confirmation banner appears immediately. | Reassures that a friendly WhatsApp/UPI payment reminder was dispatched. |

---

## 6. Screen: Pappu Me (Profile & Settings)

| Element | Trigger | Motion | Duration | Easing | Reduce-Motion Fallback | Communicates |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Language Segment Switcher** ("English" / "മലയാളം") | Tap inactive language segment | Gold indicator pill slides horizontally from English to Malayalam. | `160ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Instant selection swap (`0ms`). | Direct confirmation of active localization mode. |
| **Voice Replies Switch Toggle** | Tap switch row | Thumb translates horizontally (`20px`), background track shifts between `#F0E4C8` (off) and `#FFC83D` (on). Light haptic. | `140ms` | `cubic-bezier(0, 0, 0.2, 1)` | Instant switch toggle state change (`0ms`). | Clear binary state confirmation for audio feedback. |
| **Confirmation Dialog Entry** ("Clear chat history?" / "Sign out?") | Tap "Clear chat history" row or "Sign out" button | Background dims with flat `#1F2937` at 40% (`150ms`). Dialog card scales in from `scale(0.94) → scale(1.0)` with `opacity: 0 → 1`. | `180ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Instant dialog display without scale (`0ms`). | Focuses visual attention squarely on critical destructive warning. |
| **Dialog Dismissal / Cancellation** | Tap "Cancel" or "Stay" | Dialog card scales out `scale(1.0) → scale(0.96)`, opacity `1 → 0`. Dim overlay fades away. | `140ms` | `ease-in` | Instant dialog closure (`0ms`). | Returns user safely to previous context without mutation. |

---

## 7. Reduced-Motion Implementation Rules (`prefers-reduced-motion`)

To ensure accessibility compliance (WCAG 2.1 Criterion 2.3.3):
1. **Zero Translation/Scale Jumps:** When `prefers-reduced-motion: reduce` is detected via `@media (prefers-reduced-motion: reduce)`:
   - All spatial movements (`translateY`, `translateX`, `scale`) are zeroed out (`transform: none !important`).
   - All multi-frame bounces and overshoots (tab bounce, bar chart ease-out-back, button hops) are disabled.
2. **Opacity Fades Only:** Where transitional states are required to prevent disorientation, replace spatial motion with a simple `100ms` opacity crossfade (`opacity: 0 → 1`).
3. **Haptics Retained:** Physical haptic responses on tactile presses are preserved across both standard and reduced-motion modes, ensuring physical feedback remains intact.
4. **Data Integrity:** Numeric count-ups render target amounts instantly to prevent screen readers and cognitive delays from reading interim numbers.