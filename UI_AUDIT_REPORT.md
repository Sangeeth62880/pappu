# UI Audit Report: Pappu Redesign

## 1. Repo State
* Git branch: `v2`
* Uncommitted changes: Clean working tree. No modified tracked files. Untracked files present:
  * `PLANNER_PROVIDER_REPORT.md`
  * `backend/tests/eval/eval_results/20261014_115859.json`
  * `backend/tests/eval/eval_results/20261014_120037.json`
  * `backend/tests/eval/eval_results/20261014_134704.json`
  * `backend/tests/eval/eval_results/20261014_135128.json`
  * `exports/`
* Backend tests: 290 passed, 0 failures (duration: 39.78s via pytest in `backend`)
* Frontend tests: 16 test suites passed, 95 tests passed, 0 failures (duration: 11.30s via jest in `frontend`)

## 2. Versions and Dependencies
* Expo SDK: `^57.0.19` (installed)
* React Native: `0.86.3` (installed)
* Router: Neither `expo-router` nor `@react-navigation/native` is installed. Currently uses custom state tab navigation inside `HomeScreen.js`. Would need adding if formal file-based or stack-based navigation is chosen.
* NativeWind: `^4.2.6` (installed)
* Reanimated: `4.5.1` (`react-native-reanimated`, installed)
* Gesture Handler: `react-native-gesture-handler` is NOT installed. Needs adding for swipe to delete gestures.
* expo-audio: `~57.0.4` (installed)
* expo-haptics: NOT installed. Needs adding for tactile physical button presses and feedback.
* expo-secure-store: NOT installed. Needs adding for persistent token storage.
* react-native-svg: NOT installed. Needs adding for mascot vector SVG rendering and custom coin marks.
* expo-font: NOT installed in package.json (transitive only). Needs adding to load Google Fonts (Epilogue and Nunito Sans).

## 3. File Map
* Navigation setup: `frontend/src/screens/HomeScreen.js` (lines 30 to 42, custom local state tab switcher `activeTab: 'dashboard' | 'assistant' | 'history' | 'people'`)
* Screens:
  * `frontend/src/screens/HomeScreen.js` (Root container with tab bar, dashboard, header, and dialogs)
  * `frontend/src/screens/AuthScreen.js` (Sign In and Sign Up authentication views)
* Components:
  * `frontend/src/components/Dashboard.js` (Home overview, period cards, quick actions)
  * `frontend/src/components/HistoryScreen.js` (Transaction list and filters)
  * `frontend/src/components/PeopleScreen.js` (Contacts list, balances, and contact detail)
  * `frontend/src/components/ConversationLog.js` (Chat message thread and assistant UI)
  * `frontend/src/components/MicButton.js` (Floating microphone trigger and voice recording)
  * `frontend/src/components/ui/GlassCard.js` (Frosted glass container using BlurView)
  * `frontend/src/components/ui/Card.js` (Base card container)
  * `frontend/src/components/ui/Button.js` (Base button with blue brand styles)
  * `frontend/src/components/ui/IconButton.js` (Icon action button)
  * `frontend/src/components/ui/BottomSheet.js` (Sliding bottom sheet modal)
  * `frontend/src/components/ui/VoiceListeningSheet.js` (Voice assistant sheet modal)
  * `frontend/src/components/ui/TransactionRow.js` (Single transaction list item)
  * `frontend/src/components/ui/TransactionEditSheet.js` (Transaction editing modal)
  * `frontend/src/components/ui/ConfirmationCard.js` (Action confirmation card)
  * `frontend/src/components/ui/QueryDataCard.js` (Data card for assistant queries)
  * `frontend/src/components/ui/Balance.js` (Hero balance card with linear gradient)
  * `frontend/src/components/ui/AmountText.js` (Monetary amount display)
  * `frontend/src/components/ui/Avatar.js` (Initials avatar with hardcoded pastel colors)
  * `frontend/src/components/ui/EmptyState.js` (Empty state display)
  * `frontend/src/components/ui/ListRow.js` (Generic list row)
  * `frontend/src/components/ui/MessageBubble.js` (Chat message bubble)
  * `frontend/src/components/ui/SectionHeader.js` (Section header text)
  * `frontend/src/components/ui/SegmentedControl.js` (Segmented tab selector)
  * `frontend/src/components/ui/Skeleton.js` (Loading skeleton placeholder)
  * `frontend/src/components/ui/Toast.js` (Notification banner)
  * `frontend/src/components/ui/Screen.js` (Screen wrapper with linear gradients)
* Hooks: None in `frontend/src/hooks/` (directory does not exist; logic is co-located in components)
* API client:
  * `frontend/src/api/client.js` (FastAPI backend client with all endpoints)
  * `frontend/src/api/supabase.js` (Supabase authentication and session helpers)
* State management: Local React component state (`useState`, `useEffect`) without external state libraries
* Theme and Tailwind config:
  * `frontend/src/theme/tokens.js` (Current blue and glass theme tokens)
  * `frontend/tailwind.config.js` (Tailwind color and font extensions)
  * `frontend/global.css` (Web font imports and CSS root variables)
* Fonts: No local fonts in assets. Fonts referenced via Google Fonts link in `frontend/global.css` (`Inter` and `Noto Sans Malayalam`)
* Assets:
  * `frontend/assets/icon.png` (Default blue Expo icon)
  * `frontend/assets/splash-icon.png`
  * `frontend/assets/favicon.png`
  * `frontend/assets/android-icon-background.png`
  * `frontend/assets/android-icon-foreground.png`
  * `frontend/assets/android-icon-monochrome.png`
* Supabase client config: `frontend/src/api/supabase.js` (configured with `persistSession: false`)

## 4. Current UI Inventory
Every component and token belonging to the old blue and glass design that will be deleted or replaced:

### Components and Files to Delete or Replace
* `frontend/src/components/ui/GlassCard.js`: To be deleted (violates Rule 5: glass, blur, translucent backgrounds banned).
* `frontend/src/components/ui/Screen.js`: Uses `LinearGradient` with blue and mint translucent washes (violates Rule 5: gradients banned).
* `frontend/src/components/ui/Balance.js`: Uses `LinearGradient` with blue gradient fills and translucent borders.
* `frontend/src/theme/tokens.js`: Contains old color palette (`#F5F7FB`, `#2563EB`, `#1D4ED8`, `#1E40AF`, `#EAF1FF`, etc.) and blurred shadow tokens (`shadows.sm`, `shadows.md`, `shadows.lg`, `shadows.hero`, `shadows.floatingNav`). Must be replaced with Tactile Neo-Playful tokens (`#FFF8E7`, `#FFC83D`, `#D99A00`, `#F0E4C8`, `#1F2937`, etc.).
* `frontend/tailwind.config.js`: Contains old blue palette (`brand: #2563EB`, `canvas: #F8FAFC`).
* `frontend/global.css`: Contains old CSS root variables and Inter font imports.
* `frontend/assets/icon.png`: Contains old blue icon.

### Hard Coded Colors in `frontend/src`
* `src/screens/HomeScreen.js`: line 319 (`#FFFFFF`), line 592 (`rgba(255, 255, 255, 0.75)`)
* `src/screens/AuthScreen.js`: lines 138, 140 (`#FFFFFF`)
* `src/components/ui/GlassCard.js`: line 61 (`rgba(255, 255, 255, 0.72)`), line 63 (`rgba(255, 255, 255, 0.9)`), line 70 (`#FFFFFF`)
* `src/components/ui/Screen.js`: line 16 (`rgba(219, 234, 254, 0.45)`, `rgba(238, 242, 255, 0.2)`), line 24 (`rgba(209, 250, 229, 0.2)`)
* `src/components/ui/Balance.js`: line 63 (`rgba(255,255,255,0.98)`, `rgba(255,255,255,0.90)`, `rgba(219,225,255,0.40)`), line 147 (`rgba(255, 255, 255, 0.9)`)
* `src/components/ui/Avatar.js`: lines 6 to 12 (`#EFF6FF`, `#1D4ED8`, `#F5F3FF`, `#5B21B6`, `#FDF2F8`, `#9D174D`, `#ECFDF5`, `#065F46`, `#FFFBEB`, `#92400E`, `#F0F9FF`, `#0369A1`, `#FAF5FF`, `#6B21A8`)
* `src/components/ui/SegmentedControl.js`: line 52 (`#EEF2F6`)
* `src/components/ui/Skeleton.js`: line 52 (`#E2E8F0`)
* `src/components/ui/Toast.js`: line 112 (`#0F172A`), line 121 (`#FFFFFF`), line 131 (`#60A5FA`)
* `src/components/ui/BottomSheet.js`: line 118 (`rgba(15, 23, 42, 0.4)`), line 150 (`#CBD5E1`)
* `src/components/ui/ConfirmationCard.js`: line 119 (`#FFFFFF`)
* `src/components/ui/TransactionEditSheet.js`: lines 184, 350 (`#FFFFFF`)
* `src/components/ConversationLog.js`: line 764 (`#FFFFFF`)
* `src/components/MicButton.js`: lines 338, 439 (`#FFFFFF`)
* `src/components/PeopleScreen.js`: lines 134, 260, 334, 622, 790, 1130 (`#FFFFFF`), lines 645, 647 (`rgba(255, 255, 255, 0.95)`, `rgba(255, 255, 255, 0.8)`)
* `src/components/HistoryScreen.js`: line 544 (`#000`), lines 561, 569 (`#FFFFFF`)
* `src/components/ui/VoiceListeningSheet.js`: line 390 (`#FFFFFF`)

## 5. Stitch MCP Tools and Project Inventory

### Available Stitch MCP Tools
1. `list_projects`: Lists all Stitch projects accessible to the user with title, update time, device type, and screen count.
2. `get_project`: Retrieves project details, designTheme, designMd, and list of screenInstances.
3. `create_project`: Creates a new Stitch project.
4. `delete_project`: Deletes a Stitch project.
5. `list_screens`: Lists all screens in a given Stitch project with resource names and titles.
6. `get_screen`: Retrieves screen metadata, screenshot downloadUrl, htmlCode downloadUrl, dimensions, and deviceType.
7. `generate_screen_from_text`: Generates new UI screens from text prompts.
8. `edit_screens`: Triggers batch edits to screens.
9. `generate_variants`: Generates design variants from screens.
10. `upload_design_md`: Uploads design system markdown to a project.
11. `list_design_systems`: Lists design systems.
12. `create_design_system` and `create_design_system_from_design_md`: Registers a new design system.
13. `update_design_system`: Updates design system color tokens and typography.
14. `apply_design_system`: Applies a design system to an existing project.

### Active Stitch Project
* Project ID: `projects/9429203517741760676`
* Project Title: Pappu Mascot Design System
* Screens in Project:
  1. `f4a3c608cccf43f09dfcbe295350ec0d`: Pappu Home Screen
  2. `1e9e066c225b4c388db96f83999d0ad5`: Pappu History Screens & Interaction States
  3. `4ff99cddd00f4d32a95091e13dccee64`: Pappu People Screens & Detail States
  4. `4fc2463a4cc64abc9a9af884d84aea92`: Pappu Me Screen and Dialog States
  5. `7fe009e4a12c4c8c83a8f7ebaf6a6f48`: Pappu Assistant Screens & Interaction States
  6. `62e2be0f35f4462ea24c03de05a504af`: Pappu Edit Transaction Bottom Sheet
  7. `47acaad917fe4aad9d75eaf3e388ad21`: Pappu Edit Transaction Bottom Sheet (Person)
  8. `2a93e9f4dae94b0fa5566954eebd7c43`: Pappu Delete Transaction Confirmation Dialog
  9. `25356181920b4f8fac87133e257b9de3`: Pappu Sign In and Create Account Screens
  10. `3c1a90870a094a11bb5e21127457be68`: Pappu Character Reference Sheet
  11. `c63036cf4e0b4ad889deb0538fff532d`: Pappu Motion Specification

### Audit of Requested Screens and States
* Login: EXISTS in `25356181920b4f8fac87133e257b9de3` (Frame 1: Sign In Default State)
* Create account: EXISTS in `25356181920b4f8fac87133e257b9de3` (Frame 3: Create Account Screen)
* Home week: EXISTS in `f4a3c608cccf43f09dfcbe295350ec0d` (Default view with Week selected)
* Home month: MISSING (Home screen shows segmented pill for Month, but no dedicated Month screen instance exists in Stitch)
* Home year: MISSING (Home screen shows segmented pill for Year, but no dedicated Year screen instance exists in Stitch)
* History: EXISTS in `1e9e066c225b4c388db96f83999d0ad5` (Frame 1: Main History Screen)
* History swipe state: EXISTS in `1e9e066c225b4c388db96f83999d0ad5` (Frame 2: Swiped to Delete State)
* History empty: EXISTS in `1e9e066c225b4c388db96f83999d0ad5` (Frame 3: Empty State with Sleepy Mascot)
* People list: EXISTS in `4ff99cddd00f4d32a95091e13dccee64` (Frame 1: Main People Screen)
* Add person sheet: EXISTS in `4ff99cddd00f4d32a95091e13dccee64` (Frame 2: Add Person Bottom Sheet Overlay)
* Person detail: EXISTS in `4ff99cddd00f4d32a95091e13dccee64` (Frame 3: Person Detail Pooja)
* Me: EXISTS in `4fc2463a4cc64abc9a9af884d84aea92` (Frame 1: Me Default Settings)
* Clear chat dialog: EXISTS in `4fc2463a4cc64abc9a9af884d84aea92` (Frame 2: Clear Chat History Dialog)
* Sign out dialog: EXISTS in `4fc2463a4cc64abc9a9af884d84aea92` (Frame 3: Sign Out Dialog)
* Assistant listening, thinking, speaking and confused: ALL 4 EXIST in `7fe009e4a12c4c8c83a8f7ebaf6a6f48` (States 1, 2, 3, and 4)
* confirmation card: EXISTS in `7fe009e4a12c4c8c83a8f7ebaf6a6f48` (Action Card: Delete transaction confirmation)
* contact confirmation card: MISSING (No contact disambiguation or contact confirmation card exists in Stitch)
* transaction edit sheet: EXISTS in `62e2be0f35f4462ea24c03de05a504af` and `47acaad917fe4aad9d75eaf3e388ad21`
* mascot poses: EXISTS in `3c1a90870a094a11bb5e21127457be68` (10 distinct poses: Idle, Listening, Thinking, Speaking, Happy, Excited, Worried, Concerned, Confused, Sleepy)
* app icon: EXISTS in `3c1a90870a094a11bb5e21127457be68` (Section A: 1024x1024 master app icon face mark)

## 6. Backend Gap Analysis

1. stats endpoint for week, month and year:
   * Status: EXISTS
   * Location: `backend/app/routers/summary.py:38-84` (`GET /summary?period=week|month|year`). Generates zero-filled buckets, period bounds, and totals.
2. net sign:
   * Status: PARTIAL
   * Location: `backend/app/routers/summary.py:147` (`net = total_income - total_spent`) and `backend/app/schemas/transaction.py:85`. The backend returns a signed Decimal, but does not provide an explicit string sign (`+` or `-`) field for direct display.
3. percent change threshold:
   * Status: MISSING
   * Location: `backend/app/routers/summary.py:156-160`. Calculates raw percentage delta when `prev_spent > 0`, but contains no suppression threshold for negligible change.
4. History income or expense label:
   * Status: PARTIAL
   * Location: `backend/app/schemas/transaction.py:32` and `backend/app/routers/transactions.py:129`. Returns raw `type: "income" | "expense"`, but no user facing formatted label.
5. IST handling:
   * Status: EXISTS
   * Location: `backend/app/services/date_utils.py:7-60`. Explicitly defines `IST = ZoneInfo("Asia/Kolkata")`, `get_current_ist_datetime()`, and `get_period_bounds()` for week, month, and year.
6. PATCH and DELETE transactions:
   * Status: EXISTS
   * Location: `backend/app/routers/transactions.py:142-224` (`PATCH /transactions/{id}`) and `backend/app/routers/transactions.py:226-254` (`DELETE /transactions/{id}`). Both filter strictly by verified `current_user_id` and return 404 for cross user IDs.
7. contacts POST and GET with balances and counts:
   * Status: PARTIAL
   * Location: `GET /summary/people` EXISTS (`backend/app/routers/summary.py:293-334`) returning contacts with balances, sent, received, and count. `POST /contacts` is MISSING (no REST endpoint to explicitly create contacts).
8. profile prefs:
   * Status: MISSING
   * Location: `backend/app/models/profile.py:8-13`. The database model exists, but there are no endpoints to fetch (`GET /profile`) or update (`PATCH /profile`) preferences.
9. GET and DELETE chat history:
   * Status: EXISTS
   * Location: `backend/app/routers/chat.py:49-76` (`GET /chat/history`) and `backend/app/routers/chat.py:110-125` (`DELETE /chat/history`). Both verify user ownership.
10. mood in the assistant response:
    * Status: MISSING
    * Location: `backend/app/assistant/schemas.py:214-224`. `AssistantResponse` does not contain a `mood` field, and `composer.py` does not output mood.
11. pending state returned to the client:
    * Status: EXISTS
    * Location: `backend/app/assistant/schemas.py:222` (`AssistantResponse.pending: Optional[PendingSummary]`), `backend/app/routers/assistant.py:535-561` (`GET /assistant/pending`), and `backend/app/routers/assistant.py:465-533` (`POST /assistant/pending/{id}/answer`).
12. last_touched expiry:
    * Status: EXISTS
    * Location: `backend/app/assistant/last_touched.py:41-48` and `lines 53-78`. Enforces strict 10 minute (600 seconds) expiration and verifies transaction existence.
13. recency ordering:
    * Status: EXISTS
    * Location: `backend/app/assistant/resolver.py:173-199`. For mutations, orders by `created_at.desc()`. For query results, orders by `txn_date.desc(), created_at.desc()`. Supports `recency: latest` and `earliest`.
14. session persistence in the Supabase client:
    * Status: PARTIAL
    * Location: `frontend/src/api/supabase.js:8`. Currently configured with `persistSession: false`, meaning user session is kept in memory only and is discarded on app restart.

## 7. Navigation Behavior
* Android hardware back: Implemented in `frontend/src/screens/HomeScreen.js` (lines 144 to 175). Closes sheets first, then returns from detail to list, then returns from sub-tab to dashboard, then exits at root. Also handled in `frontend/src/screens/AuthScreen.js` (lines 84 to 99).
* Screens with no exit:
  * `AuthScreen` in default Sign In state has no internal back button when rendered by `HomeScreen.js`, relying on Android hardware back to exit the app.
  * In `HomeScreen.js`, if an unauthenticated user enters, they are locked to `AuthScreen` until login succeeds.
* Known stuck navbar cause:
  * `HomeScreen.js` line 373: `{!keyboardVisible && (`. The bottom navigation bar is conditionally unmounted whenever `keyboardVisible` is true.
  * On Android, if the user dismisses the software keyboard via the hardware back button or backdrop tap without triggering `keyboardDidHide`, `keyboardVisible` remains permanently true, causing the entire bottom navigation bar to vanish with no way to restore it.

## 8. Floating Blue Gear Button
* Verified in codebase: There is zero application code in `frontend/src` rendering a gear button.
* Verdict: The floating blue gear button is exclusively a development overlay rendered by Expo development client or Expo Go runtime to toggle the developer menu. It does not exist in production code.

## 9. Blocking Questions
1. Context documentation: `PAPPU_UI_REDESIGN_CONTEXT.md` was not found in the workspace or git history. Is Stitch project `9429203517741760676` together with the prompt instructions sufficient as the complete source of truth?
2. Navigation library: Should we continue using the lightweight tab state container inside `HomeScreen.js` or install React Navigation or Expo Router?
3. Derived states approval: Since Stitch does not provide dedicated screens for Home Month, Home Year, and Contact Confirmation Card, can we confirm that flat token derivations based on existing Home Week and Transaction Confirmation cards are approved for `design/DERIVED_STATES.md`?
4. Backend contact creation: Can we add `POST /contacts` to allow manual contact creation from the Add Person sheet without violating the rule requiring approval for backend additions?
5. Backend mood addition: Can we add the optional `mood` field to `AssistantResponse` and derive it in `composer.py` based on result kinds?

## Risks
* Without `react-native-svg` installed, all 10 mascot poses and tactile vector marks cannot be rendered in React Native.
* Without `react-native-gesture-handler`, the Stitch swipe to delete interaction on History cannot be implemented natively.
* Without `expo-haptics`, the physical button press tactile snap required by the design system cannot trigger device haptics.
* `persistSession: false` in Supabase client causes users to be logged out every time the app reloads.
* Conditionally unmounting the navbar on `keyboardVisible` creates a known risk of a permanently missing navbar on Android devices when keyboard dismissal events fail to fire.
* Missing `POST /contacts` endpoint means the Add Person sheet in the new design has no backend method to persist contacts.
* Missing `mood` field in `AssistantResponse` prevents the assistant sheet from switching mascot poses (listening, thinking, speaking, confused) dynamically based on backend execution results.
* Missing local font files for `Epilogue` and `Nunito Sans` on native iOS and Android will cause fallback to system sans-serif fonts until `expo-font` is added and configured.
