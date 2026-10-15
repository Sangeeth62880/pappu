# PAPPU UI REDESIGN: CONTEXT

Purpose: give a fresh agent with no memory everything needed to replace the Pappu UI with the finished Stitch design and add the backend support it needs.

Last updated: 2026-10-14. Facts marked VERIFIED come from UI_AUDIT_REPORT.md. Anything else, read the real code before trusting it.

Source of truth order: (1) the Stitch project, (2) this file, (3) UI_AUDIT_REPORT.md for repo facts. Where Stitch and this file disagree, Stitch wins and the agent reports the conflict.

---

## 0. RULES FOR THE AGENT

1. Work one prompt at a time. Do not start a phase until the previous gate passes and the user says go.
2. The Stitch design is not changed, improved, restyled or reinterpreted. Same colors, sizes, radii, borders, fonts, spacing, copy, order, icons and states. Stitch HTML and CSS is reference only. Reimplement in React Native. Never paste web code.
3. No AI slop UI. Banned: gradients, glassmorphism, blur, glows, shadows, neon, sparkle, star or wand icons, robot, brain or circuit imagery, purple blue AI palettes, all caps labels, letter spacing, filler status pills (Active, Live, Sync, Voice sync active, Active cycle), decorative blobs, and the words AI, Engine, Sync, Neural, Smart, Ledger, Encrypted, Powered. Every element must have a function.
4. States Stitch does not show (loading, error, long names, zero data, large font) are derived strictly from existing tokens and listed in design/DERIVED_STATES.md for approval. If a whole screen is missing in Stitch, stop and tell the user.
5. No hard coded hex, font size, radius or spacing in screens. Tokens and ui primitives only.
6. Backend changes are additive and backward compatible. Every query filters by the verified JWT user_id. Cross user ids return 404.
7. Do not touch the assistant planner, its prompt or the LLM layer. Mood is derived in the composer from result kinds only.
8. Never run a migration or data script against the live database without approval. Show the SQL first.
9. Never delete or weaken tests. Baseline: backend 290 passed, frontend 95 passed. Update a test only where behavior intentionally changed, and say which.
10. One commit per task, tests passing.
11. Do not use em dashes or hyphens as punctuation in user facing text, docs or commit messages.
12. Reports are short and honest. State only what you verified. No flattery.

---

## 1. PROJECT SUMMARY

Pappu is a bilingual (Malayalam, English and Manglish) voice first personal finance assistant for India. Users speak or type ("ചായ 20 രൂപ", "Sent 500 to Pooja", "Delete the last transaction"). The backend parses intent, asks confirmation on destructive actions, writes to the ledger, and replies in text and speech. It also tracks money owed to and by friends (People).

Owner: Sangeeth, final year B.Tech IT student, Kochi. Solo builder, verifies by running tests and curling live endpoints. Prefers short, direct, honest reports.

### Stack (VERIFIED where noted)
| Layer | Tech |
|---|---|
| Frontend | React Native 0.86.3, Expo SDK 57, NativeWind 4.2.6, Reanimated 4.5.1, expo-audio (VERIFIED) |
| Backend | FastAPI (Python) |
| DB and auth | Supabase Postgres and Supabase Auth. JWT verified through the JWKS endpoint, ES256 only |
| Isolation | Application layer. Every query filters on user_id from the verified JWT |
| STT, TTS, LLM | Sarvam Saaras v3, Bulbul v3, Sarvam 105b |

### Current state (VERIFIED 2026-10-14)
- Branch work happens on ui-stitch-v3, created from v2.
- Assistant v2 is built and is the default path. Response shape: reply_text, spoken_text, language, results[], pending, changed.
- Already built in the backend: GET /summary (week, month, year, zero filled buckets), GET /summary/people, IST date utilities, PATCH and DELETE /transactions/{id} (JWT scoped, 404 cross user), GET and DELETE /chat/history, GET /assistant/pending, POST /assistant/pending/{id}/answer, last_touched with 10 minute expiry, recency ordering, client_msg_id idempotency, amount aware matching.
- Not built: POST /contacts, contact detail endpoint, GET and PATCH profile prefs, mood in the assistant response, delta_pct threshold, nothing for dialect.
- Frontend: no router installed. Navigation is hand rolled state (activeTab) in HomeScreen.js. Android back is handled manually. The tab bar is unmounted when the keyboard is visible (HomeScreen.js around line 373), which is the likely cause of the vanishing navbar. persistSession is false. react-native-gesture-handler, expo-haptics, expo-secure-store, react-native-svg and expo-font are not installed.
- The floating blue gear button is the Expo dev overlay, not app code. Ignore it.

---

## 2. DECISIONS (final unless the user changes them)

1. The current blue and glass UI is removed completely. Old tokens, GlassCard, Screen gradient washes, Balance gradient, shadow tokens, Inter font imports and hard coded pastel avatar colors are deleted, not layered over.
2. The center coin is the only assistant entry. Tap opens the Assistant as a full screen modal over the tabs and starts listening. Press and hold records from any screen; on release the Assistant opens and sends the recording. Release under 300 ms counts as a tap. There is no separate mic sheet and no Assistant tab.
3. Navigation: React Navigation (native stack and bottom tabs) with a custom tab bar for the raised coin. The Assistant is a modal stack screen. Android hardware back comes from the navigator. The tab bar is never unmounted by keyboard state.
4. Mascot: static poses with Reanimated animation (Step A). No Rive for now.
5. Dialect row is removed because the planner has no dialect input.
6. Remind button opens React Native's built in Share sheet with prewritten text. It is hidden when the balance is zero.
7. Session persistence on, using chunked expo-secure-store storage (Supabase sessions exceed SecureStore's roughly 2 KB value limit).
8. Shared data layer with @tanstack/react-query and named query keys: summary(period), people, contact(id), transactions(filters), profile, chatHistory. Any transaction create, edit, delete or assistant change invalidates summary, people, transactions and the affected contact.
9. Mood is derived in composer.py from result kinds, never by the LLM.
10. Backend naming: extend existing endpoints. Do not create /stats or /me. Use GET and PATCH /profile.
11. Approved dependencies (install with npx expo install): react-native-gesture-handler, expo-haptics, expo-secure-store, react-native-svg, expo-font, the @expo-google-fonts packages for the fonts Stitch actually uses, React Navigation packages, @tanstack/react-query.

---

## 3. STITCH PROJECT

Project: projects/9429203517741760676, "Pappu Mascot Design System".

Existing screens: Home (week), History with swipe and empty states, People with Add person sheet and Person detail, Me with Clear chat and Sign out dialogs, Assistant (listening, thinking, speaking, confused, delete confirmation card), Edit Transaction sheet (expense), Edit Transaction sheet (person), Delete confirmation dialog, Sign in and Create account, Character Reference Sheet (10 poses and app icon), Motion Specification.

To be added by the user before spec extraction: Home Month, Home Year, Assistant contact confirmation card (Yes and No) and its resolved state.

The user saves screenshots to design/stitch/ and mascot poses to assets/pappu/. The agent cannot create mascot art.

---

## 4. DESIGN SYSTEM (design lock)

If Stitch differs from any value here, Stitch wins and the agent reports it.

Frame: mobile 390 x 844. Side margins 20. Status bar 47. Light mode only. Currency ₹ with Indian grouping (₹65,000 and ₹2,41,860).

### Colors (only these, no tints, no gradients)
| Token | Hex | Use |
|---|---|---|
| bg | #FFF8E7 | screen background |
| surface | #FFFFFF | cards, inputs |
| border | #F0E4C8 | borders, dividers |
| gold | #FFC83D | primary actions, selection, mascot |
| gold-edge | #D99A00 | 4px bottom edge of gold buttons, mascot rim |
| ink | #1F2937 | text, outlines |
| ink-muted | #6B7280 | secondary text |
| income | #1F8A5B | money in only |
| expense | #E5484D | money out and destructive only |
| expense-edge | #B4232A | destructive button edge |
| teal | #0E7C86 | links, secondary accent |

Categories: Food #F97316, Shopping #0E7C86, Transport #38BDF8, Other #9CA3AF, People #8B5CF6. Dim overlay for dialogs: flat #1F2937 at 40%, no blur.

### Typography
Design lock: Baloo Chettan 2 (headings and all amounts), Nunito (body), Noto Sans Malayalam (fallback). The earlier audit mentioned Epilogue and Nunito Sans. The agent must report which families Stitch really uses and whether they support Malayalam. Neither Epilogue nor Nunito Sans supports Malayalam.

Scale: Display 32/36 800, H1 24/28 700, H2 18/22 700, Body 16/22 600, Caption 13/18 700. Sentence case only. No italics. Tabular numerals for money.

### Spacing and shape
Spacing scale 4, 8, 12, 16, 24, 32. Card padding 16, gap between cards 16. Radii: card 20, button 16, input 16, chip 999. Card is white with a 2px border, no shadow, no blur, no gradient.

### Buttons
- Primary: height 52, gold fill, ink text Baloo 700 17px, 4px bottom edge #D99A00, radius 16.
- Secondary: white fill, 2px border, 4px bottom edge in the border color.
- Destructive: #E5484D fill, white text, 4px bottom edge #B4232A.
- Destructive outline: white fill, 2px #E5484D border, 4px bottom edge #E5484D, coral text.
- Text never wraps or clips. Paired buttons are equal width with a 12px gap. Press: translateY 4px over about 80 ms, light haptic.

### Icons
One family, rounded outline, 24px, 2px stroke, ink.

### Header (Home, History, People, Me)
Height 64 on bg. Left: coin mark 32px and "Pappu" wordmark. Right: nothing, except History search and People gold plus (40px circles). No language switcher, no avatar, no status text.

### Tab bar (Home, History, People, Me; absent on Assistant and Login)
Height 84, white, 2px top border. Slots: Home, History, center coin, People, Me. Active: ink icon and label with a 6px gold dot. Inactive: ink-muted. Center coin: 72px, gold, 4px ink outline, 4px bottom edge, raised 24px, same size and position on every screen.

### Mascot
Gold coin character with face, noodle arms and short legs. Ten poses: Idle, Listening, Thinking, Speaking, Happy, Excited, Worried, Concerned, Confused, Sleepy. Never redesigned. Sizes 32, 48, 72, 120, 180.

---

## 5. SCREENS

Exact layouts and copy come from the Stitch screens and design/spec/. This is the order and key rules.

- Login and Create account: no tab bar, no header. Pappu waving, wordmark, tagline "Just say it. Pappu keeps track.", card with Email and Password (Name on Create account), primary button, link to the other mode. Removed: tip box, encryption banner, engine text, bilingual badge. Create account must have a way back.
- Home (Week, Month, Year): greeting row with Pappu pose from the server mood, segmented control, spend card, daily or monthly spending chart, people card, where it went, recent. The delta line shows delta_abs only and is omitted when delta_pct is null. No percent is ever rendered. Chart: 160px area, tallest bar 112px or less, at least 48px headroom, zero days show a 6px stub, tooltip above the selected bar and never overlapping a bar.
- Assistant (modal, no tab bar, no header): close button, Pappu with a state caption, chat list, suggestion chips, thumb zone input bar with the coin mic. All bubbles share one style and are sized to content, never empty. Every Pappu reply ends with a speaker icon that replays spoken_text. Cards render from the response: delete confirmation (Delete and Keep it), edit (Update and Keep it), disambiguation rows (max 5), contact confirmation (Yes and No), result cards.
- History: search icon, filter chips All, Expenses, Income, People, summary line, IST day groups with totals, shared row component, swipe left to delete with confirmation, tap row to open the edit sheet, empty state with the sleepy mascot. Income rows say Income. No arrow glyphs.
- People: gold plus opens the Add person sheet (Name, Phone optional, UPI ID optional), search, two tiles with correct plurals, net balance row, filter chips with counts, rows. Person detail: back arrow, balance with caption, Remind (share sheet), transaction list.
- Me: profile card, Language segmented control, Voice replies toggle, Clear chat history, Sign out. No Dialect row. Dialogs: Clear chat history and Sign out.
- Edit transaction sheet: expense version (amount, type, description, category chips, date, Save, Delete) and person version (direction, person). Delete uses the delete confirmation dialog.

---

## 6. KNOWN DATA BUGS TO VERIFY AND FIX

The backend computes net correctly and returns a raw type, so these are probably frontend bugs. Verify, then fix at the real cause.

1. Net sign: income 65,000 and spent 5,109 must show +₹59,891 (the old UI showed negative).
2. History subtitle shows "Expense" for an income row. It must derive from type.
3. Percent change shows values like 1359.71%. delta_pct becomes nullable and null when the previous period is under ₹500 (user to confirm). UI shows delta_abs only.
4. "2 friend" plural error. Counts come from the backend, plurals from the UI.
5. Filler labels (Monthly activity, Active period, Split overview, Active cycle) are removed.
6. "Last transaction" must be deterministic (latest by created_at) and every confirmation echoes name, amount, date and contact.

---

## 7. BACKEND WORK

Skip anything that already exists. Extend, do not duplicate.

1. GET /summary additions: delta_abs always, delta_pct nullable, avg_per_day, max_day, category breakdown percentages (expenses only, People excluded), people block (owed_to_you, you_owe, counts, top 3 by absolute net), mood (worried when spend is more than 1.5 times the previous period and above ₹500, otherwise neutral; user to confirm).
2. GET /profile: name, email, language, voice_replies. PATCH /profile for language (en or ml) and voice_replies. Language feeds the STT hint, TTS voice and composer language. Migration needed if columns are missing, show it first.
3. POST /contacts {name, phone?, upi_id?} rejecting duplicate names case insensitively, also checking aliases. Phone and UPI columns need a migration, show it first. Contact detail endpoint. GET /contacts/{id}/remind-text returning a reminder in the user's language.
4. AssistantResponse gets a mood field (neutral, happy, excited, concerned, confused). Expense added is happy, income added is excited, pending delete or edit is concerned, unsupported or clarify is confused, otherwise neutral. All existing fields stay.
5. Chat history: confirm pagination (latest 50, older on request) and structured pending payload so old cards render as resolved. DELETE removes only the caller's messages and leaves transactions intact.
6. Tests for each item, including user isolation, week boundary in IST on Sunday and Monday, month rollover, null delta, mood mapping, duplicate contacts. Run the assistant eval set before and after.

---

## 8. MASCOT MOOD MAPPING

Server decides, client renders.

| Event | mood |
|---|---|
| Expense logged | happy |
| Income received | excited |
| Delete or edit awaiting confirmation | concerned |
| Not understood or error | confused |
| Summary spend jump | worried |
| Everything else | neutral (Idle) |

Client only states: listening (mic held), thinking (awaiting response), speaking (TTS playing), sleepy (60 seconds idle). Client states override server moods. Poses swap with a 200 ms crossfade.

---

## 9. MOTION (every item must communicate something)

Button press down 4px over about 80 ms with light haptic. Home amount count up 400 ms. Bars grow with 40 ms stagger, 300 ms each. Tooltip pop 150 ms. Category bars fill. New row slide in 200 ms. Tab icon bounce 250 ms and coin tilt 10 degrees over 200 ms. Swipe delete follows the finger. Sheets slide up, dialogs fade and scale, flat dim overlay. Login: eyes look down on input focus, head shake on wrong password. Idle blink every 3 to 5 seconds. Typing dots and speaking mouth in the Assistant. Coin shower only on income or milestones (1.2 s, max 12 coins). Sleepy after 60 seconds idle. No decorative looping. Reduce Motion gives fade only fallbacks everywhere.

---

## 10. PHASE ORDER

1. Setup check (done once, then read only)
2. Design spec extraction from Stitch (no app code)
3. Foundations: tokens, fonts, primitives, mascot, react-query keys
4. Backend A: summary extensions, mood, read only profile, last transaction echo
5. App shell: React Navigation migration first, then header, tab bar, coin, back behavior
6. Login and session persistence
7. Home
8. Backend B: contacts, prefs, remind text
9. History and edit sheet
10. People
11. Me
12. Assistant
13. Mascot and motion
14. QA audit and cleanup

Each phase has acceptance gates in the prompt that starts it. Screenshots at 390x844, 360x780 and 1.3 font scale are compared to the Stitch screenshots with measured pixel offsets. Anything not verified on a real device is marked NOT VERIFIED.

---

## 11. OPEN ITEMS

1. Confirm the worried threshold (1.5 times previous and above ₹500) and the delta threshold (₹500).
2. Confirm the exact fonts Stitch uses and their Malayalam support.
3. Approve DB migrations for contact phone and UPI and for profile prefs when shown.
4. Malayalam confirmation keywords already handled by Assistant v2: verify coverage (ശരി, അതെ, വേണ്ട) rather than assuming.
5. Final copy for the Stitch screens the user generated (edit sheet, delete dialog, contact confirmation) is treated as final once approved.
