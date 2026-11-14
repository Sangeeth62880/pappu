# Pappu — Build Phases

Build in this order. Do not start a phase until the previous phase's acceptance criteria are met. Each task includes the test to write/run immediately after building it — not deferred to later.

## Status (verified 2026-11-08 against code and tests, not earlier claims)

Current suites (2026-11-15): **874 pytest passed** (`backend/tests`), **542 Jest passed in 51 suites** (`frontend/tests`). Test counts written inside the phase sections below are historical.

| Phase | Status | Evidence | Open |
|---|---|---|---|
| 0 Scaffolding | Done | `test_health.py`, `frontend/tests/App.test.js` | |
| 1 Schema | Done | `app/models/`, `services/category_seed.py`, `test_models.py`, `test_schema.py`; `apply_schema.py` asserts tables and the 8 categories on the target DB | Target DB not re-checked in this session |
| 2 CRUD + Auth | Done | `app/auth.py` (ES256 JWKS, `aud = authenticated`), `test_auth.py`, `test_transactions.py`, `test_isolation.py`, `test_summary.py` | |
| 3 LLM intent layer | Done, superseded by the v2 planner (Phase 12) | `test_intent_parsing.py` | Legacy path |
| 4 Confirmation routing | Done | `services/routing.py`, `test_routing.py`, `test_confirmation_integration.py`; v2 `assistant/pending.py`, `test_assistant_pending.py` | |
| 5 Dashboard UI | Done (automated tests) | `dashboard.test.js`, `conversation.test.js`, `home_screen.test.js` | Manual demo QA run has no record in the repo |
| 5.5 People | Done | `test_people.py`, `people_screen.test.js` | |
| 6 STT | Built and unit tested, **not accepted** | `app/stt/`, `test_stt.py`, `mic_button.test.js`, `voice_*.test.js` | Manual phone spot check: `VOICE_TEST_CHECKLIST.md` §3, §4 |
| 7 TTS | Built and unit tested, **not accepted** | `app/tts/`, `test_tts.py`, `test_reply_language.py`, `tts_language.test.js`, `audio_player.test.js` | Manual spoken check: checklist §3, §4, §7 |
| 8 End to end voice | **In progress** | Voice hardening (0a8967a, 434eead, b699a0c, 0b99bae, 31c9a54), retry idempotency (220de03) | No end to end voice script exists; acceptance is the manual run of `VOICE_TEST_CHECKLIST.md` |
| 9 Intelligence + polish | **In progress** | Category breakdown, highest category, period compare (`test_period_analytics.py`, `test_query_shapes.py`); budgets and budget alerts (`test_budgets.py`, `budgets_section.test.js`); UI polish via Phase 13 | Savings estimation not implemented; final spec drift review not done; Phase 8 regression pass blocked on Phase 8 |
| 10 Light design system | Done, theme later replaced by Phase 13 | `test_period_analytics.py`, `primitives.test.js` | |
| 11 Post Stitch polish | Done | `test_chat.py`, `transaction_edit.test.js`, `chat_history.test.js`, `voice_listening_sheet.test.js` | |
| 12 Assistant v2 | Done | `app/assistant/`, `test_assistant_*.py`; eval planner-only 93.8% (152/162) in `tests/eval/eval_results/20261015_162746.json`; with `--execute` 84.3% (145/172), budgets 14/14, in `20261108_085648.json` (local, eval_results is gitignored) | The `--execute` failures are pre-existing (same cases fail at 7daf7e6, before the budgets brief): disambiguation/undo cases that seed no pending or undo rows, and relative dates resolved against the real clock instead of the case's 2026-10-14. `generate_cases.py` lacks the 13 hand-added `trace_*` cases, so don't regenerate `cases.jsonl` from it |
| 13 Stitch redesign | Done (automated tests) | `home_stitch_fidelity.test.js`, `assistant_modal_fidelity.test.js`, `primitives.test.js`, `me_screen.test.js` | 390x844, 360x780 and 1.3 font scale not checked on a device in this session |
| 14 Bill split | **Built and unit tested, not accepted** (2026-11-15) | `test_bill_schema.py`, `test_bill_split_maths.py`, `test_bill_planner.py`, `test_bills_api.py`, `test_bill_extract.py`; `bill_split_flow.test.js`, `bill_api_and_upi.test.js`; live check of OCR, extraction and the split planner on one printed test receipt | Migration `20261114000000_create_bill_split.sql` not applied to the target DB; no eval suite cases; manual phone run (real bills, camera, QR scan in two UPI apps, voice on the Who had what screen) not done; QR is not shared as an image; needs a new dev build for the camera picker |

---

## Phase 0 — Project Scaffolding

**Tasks**
1. Initialize repo structure per `PROJECT_SPEC.md §9`.
2. Set up FastAPI backend skeleton + Supabase/PostgreSQL connection via env config.
3. Set up React Native frontend skeleton with Tailwind/NativeWind configured.

**Tests**
- Backend: a `/health` endpoint returns 200, confirmed with a pytest smoke test.
- Frontend: app builds and renders a placeholder screen without errors.

**Acceptance criteria**: Backend and frontend both run locally, backend connects to the DB successfully.

---

## Phase 1 — Database Schema

**Tasks**
1. Implement SQLAlchemy models for `users`, `categories`, `transactions` per `PROJECT_SPEC.md §4`.
2. Write migration to create tables + seed the fixed category list.

**Tests**
- pytest: migration runs cleanly on a fresh test DB.
- pytest: seeded categories match the fixed list exactly (no extras, no missing).
- pytest: creating a transaction with an invalid `category_id` or invalid `user_id` fails as expected (FK constraints hold).

**Acceptance criteria**: Schema is in place, seed data verified, constraint tests pass. Schema application must be verified against the actual target database (e.g. Supabase PostgreSQL via `information_schema.tables`), not just via passing unit tests against a test DB.

---

## Phase 2 — Backend CRUD + Auth (no LLM yet)

**Tasks**
1. Wire up Supabase Auth in the frontend (sign-up/sign-in via the Supabase client SDK) — no custom auth endpoints are built.
2. Enable and write RLS policies on `profiles` and `transactions` per `PROJECT_SPEC.md §4`.
3. Implement JWT verification middleware in FastAPI that extracts `user_id` from the Supabase-issued token on every request.
4. Implement `/transactions` (POST/PUT/DELETE/GET) and `/summary`, all scoped to the authenticated user via the verified JWT.

**Tests**
- pytest: a request with a valid Supabase JWT resolves to the correct `user_id`; a request with a missing/invalid JWT is rejected (401).
- pytest: each CRUD endpoint — happy path, plus rejection when accessed without a valid token.
- pytest: isolation test — using two seeded users, confirm user A cannot read/edit/delete user B's transactions via the API. This is enforced by FastAPI's `WHERE user_id = :verified_user_id` filtering (using the `user_id` extracted from the verified JWT), not by RLS — the backend connects via the `postgres` role, which bypasses RLS. Don't test this by trying to bypass application code directly against the DB; test it the way it's actually enforced, through the API with two different verified tokens.
- pytest: `/summary` returns correct totals/balance against a known seeded set of transactions.

**Acceptance criteria**: Full transaction lifecycle works end-to-end via API calls, sign-up/sign-in works through Supabase Auth, and isolation is enforced and verified at the application layer (JWT-derived `user_id` scoping on every query).

---

## Phase 3 — LLM Intent Layer (text input only, no voice)

**Tasks**
1. Write the intent-parsing prompt template producing the JSON shape in `PROJECT_SPEC.md §5`.
2. Implement a parser/validator that rejects any LLM output not conforming to the schema.
3. Feed it plain typed text (English, Malayalam, code-mixed) — no STT involved yet.

**Tests**
- Unit tests covering, for each action type (add/edit/delete/query):
  - a clean high-confidence English input
  - a clean high-confidence Malayalam/code-mixed input
  - an input missing a required field (→ `missing_fields` populated)
  - an ambiguous input matching multiple transactions (→ `matched_transactions` has >1 entry)
- Schema validation test: malformed/incomplete LLM output is rejected, not passed downstream.

**Acceptance criteria**: Given a batch of representative typed sentences, the LLM layer reliably produces schema-conformant intents with correct confidence/missing-field flags — verified against a hand-written expected-output test set, not just spot-checked manually.

---

## Phase 4 — Confirmation & Error-Recovery Routing

**Tasks**
1. Implement the routing function described in `PROJECT_SPEC.md §6`: intent in → one of `EXECUTE / ASK_CONFIRMATION / ASK_DISAMBIGUATION / ASK_CLARIFICATION` out.
2. Wire this in front of the Phase 2 backend write endpoints — no write happens without passing through this router.
3. Implement "undo last transaction."

**Tests**
- Unit tests for each of the 4 tiers from `PROJECT_SPEC.md §6`, using mock intent objects (no LLM/DB needed for these — pure logic tests).
- Integration test: an `add` intent flows straight through to a DB write.
- Integration test: a `delete` intent with one match stops at `ASK_CONFIRMATION` and does **not** write until a follow-up "yes" is sent.
- Integration test: a `delete` intent with multiple matches stops at `ASK_DISAMBIGUATION` and does not write.
- Integration test: "undo" correctly reverses the most recent transaction only.

**Acceptance criteria**: No destructive action (edit/delete) ever reaches the DB without going through confirmation or disambiguation first — proven by tests, not just manual trial.

---

## Phase 5 — Dashboard UI (wired to backend, text-only interaction for now)

**Tasks**
1. Build dashboard: balance, totals, category breakdown, recent transactions, trends.
2. Build a conversation log UI that accepts typed input (stand-in for voice) and displays Pappu's responses, including confirmation/disambiguation/clarification prompts.
3. Wire live updates — dashboard reflects new/edited/deleted transactions without manual refresh.

**Tests**
- Jest/RNTL: dashboard renders correct totals given mock API data.
- Jest/RNTL: submitting a typed command that requires confirmation shows the confirmation prompt in the conversation log and does not update the dashboard until confirmed.
- Manual QA checklist: full demo flow (from `PROJECT_SPEC.md`/original doc) run via typed input end-to-end, dashboard updates live at each step.

**Acceptance criteria**: The entire demo flow works via typed text, including confirmation and disambiguation prompts rendering correctly and the dashboard staying in sync.

---

## Phase 5.5 — Person-to-Person Transaction Tracking ("People" Category)

**Tasks**
1. Add `contacts` table (scoped to `profiles.id`, ON DELETE CASCADE), add nullable `contact_id` FK to `transactions`, and seed `People` category per `PROJECT_SPEC.md §4`.
2. Update LLM intent schema (`IntentFields.contact_name`) and intent prompt (`intent_prompt.md`) to extract `contact_name` and automatically categorize as `"People"`.
3. Implement create-if-not-exists (case-insensitive) contact resolution on `add` intent and link via `contact_id`.
4. Enforce direction semantics: money sent to contact = expense, money received from contact = income; compute `net_balance = sum(sent) - sum(received)`.
5. Implement `GET /summary/people` (contacts list with net balances) and `GET /summary/people/{contact_id}` (contact history and net balance).
6. Extend `query` intent routing to route queries with `contact_name` to people summary logic; extend matcher to filter by `contact_name` on edit/delete.
7. Build `PeopleScreen` in React Native with aggregate balances, contact list, and drill-down transaction history; add "People" tab to `HomeScreen`.

**Tests**
- pytest: creating a transaction with `contact_name` creates a new Contact if none exists, reuses existing Contact on repeat mentions (case-insensitive).
- pytest: two users with contacts of the same name ("John") remain isolated — user A's John balance never leaks into user B's query.
- pytest: net balance calculation is correct for a seeded mix of sent/received transactions to one contact.
- pytest: query intent "how much did I send John" / "how much does John owe me" routes to the people summary and returns correct figures.
- pytest: edit/delete with `contact_name` correctly narrows matcher results to that contact's transactions only.
- pytest: `GET /summary/people` and `GET /summary/people/{contact_id}` return expected balances, histories, and 404 for invalid contacts.
- Jest/RNTL: `PeopleScreen` renders aggregate balances, contact list, handles drill-down navigation into per-contact history, and empty state.

**Acceptance criteria**: Person-to-person transactions can be created, queried, and summarized end-to-end; contact records are case-insensitively deduplicated per user; data isolation holds across users; net balance convention accurately reflects who owes whom; and the dedicated People UI seamlessly integrates into navigation.

---

## Phase 6 — Speech-to-Text Integration

**Tasks**
1. Integrate Sarvam Saaras v3 for English + Malayalam speech input.
2. Wire mic button → STT → same text pipeline built in Phases 3–5.

**Tests**
- Manual spot-check: a handful of recorded English, Malayalam, and code-mixed sample utterances transcribe to reasonably correct text (this is a spot-check, not a benchmark — per project scope, STT accuracy isn't independently measured).
- Integration test: a transcribed string flows through the existing intent → routing → backend pipeline identically to typed input (i.e., STT is just swapping the input source, not a new code path).

**Acceptance criteria**: Speaking a command produces the same downstream behavior as typing the equivalent text.

---

## Phase 7 — Text-to-Speech Integration

**Tasks**
1. Integrate Sarvam Bulbul v3.
2. Wire backend responses (confirmations, clarifications, query answers) → LLM response generation → TTS → audio playback, in the same language as the input.

**Tests**
- Manual spot-check: confirmation/clarification/query-answer responses are spoken correctly in both English and Malayalam.
- Integration test: response language matches input language for a set of mixed-language test cases.

**Acceptance criteria**: A fully voice-driven interaction (speak → hear response) works for at least one instance of each action type (add/edit/delete/query), including a confirmation and a disambiguation case.

---

## Phase 8 — Full End-to-End Integration

**Tasks**
1. Run the full demo flow (from `PROJECT_SPEC.md`) purely via voice, no typed fallback.
2. Fix any gaps surfaced by chaining all layers together (timing, state handling between turns, edge cases in confirmation flow under voice).

**Tests**
- End-to-end test script covering the full demo flow, executed via voice, checked against expected dashboard state and expected spoken responses at each step.

**Acceptance criteria**: The complete demo flow (steps 1–7 in `PROJECT_SPEC.md`'s demo section) runs via voice without manual intervention.

---

## Phase 9 — AI-Driven Intelligence + Polish

**Tasks**
1. Spending pattern analysis, highest-category detection, month-over-month comparison, budget alerts, savings estimation.
   - Done: spending patterns / highest category / period compare (Phase 12 query kinds), per-category monthly budgets with set (confirmed when it changes an amount)/status by voice and the Me screen card (set, edit, remove), budget alert line on adds and on edits that raise spending (`PROJECT_SPEC.md` §5b Budgets).
   - Not done: savings estimation.
2. UI polish, avatar, language toggle refinement.
3. Final review against `PROJECT_SPEC.md` for any drift introduced during the build.

**Tests**
- Unit tests for each analytics computation against known seeded data (e.g., verify "highest spending category" logic against a hand-computed expected answer).
- Regression pass: re-run Phase 8's end-to-end test to confirm polish didn't break the core flow.

**Acceptance criteria**: Analytics features are correct against known test data, and the core voice flow still passes its end-to-end test after all polish work.

---

## Phase 10 — Light Design System & Analytics Redesign

*Note: This phase satisfies the previously unfinished Phase 5 "trends" requirement and implements key parts of Phase 9 analytics (spending patterns, highest category, period comparison, daily buckets, delta vs previous period). Phase 9 itself remains in progress (budgets and alerts are now done; savings estimation is not).*

**Tasks**
1. Document data semantics, light-only design system tokens, glass policy, and new `/summary?period=` contract in `PROJECT_SPEC.md`.
2. Build design system tokens and reusable UI primitives (`Screen`, `Card`, `GlassCard`, `Button`, `IconButton`, `Chip/SegmentedControl`, `Avatar`, `AmountText`, `ListRow`, `SectionHeader`, `EmptyState`, `Skeleton`, `Toast`, `BottomSheet`) in `frontend/src/components/ui/` with unit tests.
3. Extend backend `GET /summary` with `period=week|month|year` parameter, returning period-scoped totals (spent, income, net), previous period delta, zero-filled daily buckets, expense-only category percentages, top 3 contacts, and top 3 expenses.
4. Restructure `Dashboard` into an analytics-first overview: slim header + profile sheet, segmented period selector, blue gradient hero card, 7-day spending chart, people card, expense proportion bars, and capped recent activity (max 5) with "See all" navigation.
5. Rebuild bottom navigation bar with floating frosted-card styling and outline icons.
6. Restyle remaining screens (`Assistant`, `History`, `People`, `Auth`) using design tokens and primitives, ensuring zero old dark-navy/gold colors remain.
7. Add pull-to-refresh, skeleton loading states, and comprehensive test coverage.

**Tests**
- pytest: backend `/summary?period=` covers multi-week dataset totals, zero-filled buckets, IST calendar boundaries (Sunday/Monday and month rollover), previous-period delta, two-user isolation, and empty-data user handling.
- Jest/RNTL: UI primitive token tests (contrast validation, AmountText formatting variants, Button states), Dashboard period toggle re-rendering, Recent rows cap at 5, People empty states, and filter passing to History.

**Acceptance criteria**: Modern light-only design system fully replaces dark passbook theme across all screens, zero hardcoded legacy navy/gold colors, all frontend and backend tests pass, and complete data isolation and auth behaviors remain intact.

---

## Phase 11 — Post-Stitch Migration Polish, Manual CRUD, Persistent Chat & Universal Voice Access

**Tasks**
1. **Touch Targets & Exit Paths (Fix 2 & 3)**:
   - Fixed `Toast.js` unmount bug that permanently blocked touch targets above the floating nav bar.
   - Enhanced `BottomSheet.js` with swipe-down dismissal and accessible close button.
   - Added Android hardware `BackHandler` on `HomeScreen`, `AuthScreen`, `HistoryScreen`, and `PeopleScreen` to close active sheets or return to root dashboard before exiting.
   - Floating navbar dynamically hides during typing (`keyboardWillShow` / `keyboardDidShow`) and provides 48px touch targets at `zIndex: 100`.
2. **Accessible Microphone & Vector Iconography (Fix 4)**:
   - Replaced all raw unicode emojis ('🎤', '⏹', food emojis) with `MaterialIcons` (`mic`, `stop`, `restaurant`, etc.).
   - Added animated pulsing ring, clear error banner, and `Linking.openSettings()` on microphone permission denial.
3. **Manual Transaction Editing, Deletion & Non-Destructive Undo (Fix 1)**:
   - Implemented `PATCH /transactions/{id}` and `DELETE /transactions/{id}` in FastAPI with strict 404 user scoping (never 403 to prevent enumeration).
   - Added integer-ordered `undo_actions` model for deterministic sequential undo resolution across both SQLite and PostgreSQL.
   - Built frontend `TransactionEditSheet` accessible across Dashboard, History, and People screens.
4. **Persistent Chat History (Fix 5)**:
   - Added `chat_messages` model (`id`, `user_id`, `role`, `text`, `payload`, `created_at`) with PostgreSQL RLS.
   - Added `GET /chat/history?limit=50&offset=0`, `POST /chat/message`, and `DELETE /chat/history`.
   - Updated `ConversationLog.js` with skeleton loader on mount, automatic history sync, safe error fallbacks, and marked historical confirmation cards as resolved.
   - Added "Clear Chat History" action in Profile settings bottom sheet and ConversationLog header.
5. **Universal Voice Entry Points (Fix 6)**:
   - Added header microphone action on Home, History, and People screens that opens a unified `VoiceListeningSheet`.
   - Allows hands-free recording, transcription, intent routing, and real-time dashboard updates without leaving the current screen.
   - Kept Assistant tab dedicated to single conversation composer mic to prevent duplicate triggers.

**Tests**
- pytest: 171 backend tests passing (including `test_chat.py` pagination, user isolation, and `test_transactions.py` patch/delete/undo).
- Jest: 81 frontend tests passing (including `transaction_edit.test.js`, `chat_history.test.js`, `voice_listening_sheet.test.js`).

**Acceptance criteria**: All six UI/UX/logic issues resolved with root-cause fixes, zero regressions, full test coverage across frontend and backend.

---

## Phase 12: Pappu Assistant v2 Architecture and Intent Layer Migration

Note: The compare and group_by operations implemented in this phase cover analytics capabilities of Phase 9. Budgets were added later (2026-11-08); Phase 9 stays in progress for savings estimation and its Phase 8 regression pass.

**Tasks**
1. Evaluation Harness: Created golden dataset cases.jsonl (149 test cases covering English, Malayalam, and Manglish) and runner.py with pluggable planners.
2. Schemas and Context: Defined PlanV2 and ActionV2 schemas with strict Pydantic validation (max 5 operations per plan). Built parallel context loader gathering IST date, top contacts with aliases, recent chat turns, last touched transaction, and active pending state.
3. LLM Planner: Authored single call prompt.md generating declarative PlanV2 JSON. Handled add, edit, delete, query, clarify, and chat operations without regex or keyword classification.
4. Deterministic Resolver: Implemented multi candidate disambiguation, fuzzy alias matching with jaro winkler similarity, relative date parser, and contact confirmation routing.
5. Deterministic Executors: Implemented transactional add, edit, delete, and query executors with isolation guarantees and 404 responses for missing records.
6. Deterministic Response Composer: Implemented multilingual natural language generator producing concise display text and spoken text without secondary LLM calls.
7. Pending Action State Machine: Implemented pending item lifecycle supporting confirm, cancel, choose, and answer across text and voice interfaces.
8. Frontend Migration and Cleanup: Switched frontend to use /assistant/message, /assistant/pending/{id}/answer, and /assistant/pending. Removed ASSISTANT_V2 flag and retired obsolete v1 intent routing code.

**Tests**
* Backend: 239 pytest tests passing including assistant message, pending lifecycle, planner validation, executors, and security isolation.
* Frontend: 94 Jest tests passing across all 16 test suites.
* Evaluation Suite: 89.3 percent overall accuracy (133/149 test cases passing), zero schema failures, and 7/7 critical regression tests passing.

**Acceptance criteria**: Intent classification is entirely owned by the LLM planner. Resolution, execution, and replies are fully deterministic code. Zero keyword or regex intent classification remains. All unit and integration tests pass.

---

## Phase 13: Pappu UI Stitch Redesign & Final Audit

> **Standing Rule**: UI uses design tokens and ui primitives only. The Stitch design is not changed without approval.

**Tasks**
1. **Design System & Primitives Foundation**:
   - Replaced legacy blue/glass theme with Tactile Neo-Playful tokens (`#FFF8E7`, `#FFC83D`, `#D99A00`, `#F0E4C8`, `#1F2937`).
   - Built core primitives: `Button` (physical press and haptic feedback), `Card`, `Dialog`, `Input`, `MessageBubble`, `Chip`, `Skeleton`, `Toast`, `AmountText`.
   - Completely eradicated all gradients, blurs, glassmorphism, and ambient shadows.
2. **Navigation Shell & Visual Header/Tab Bar**:
   - Migrated from custom local state to React Navigation 7 stack and bottom tab bar.
   - Built global `AppHeader` (56px height, 32px coin mark with 'P' + Baloo 800 wordmark) identical across Home, History, People, and Me.
   - Built `CustomTabBar` (84px height, white surface, 2px top border) with centered 72px vector `CoinButton` raised 24px above bar.
3. **Screen Implementation (Stitch Fidelity)**:
   - **Auth**: Replaced legacy auth with Stitch Sign In and Create Account screens, input focus rings, chunked SecureStore session persistence, and mascot face.
   - **Home**: Built week, month, and year segmented views, hero spending balance, daily spend chart, and recent transaction list.
   - **History**: Built filterable transaction list, swipe-to-delete gesture, transaction edit bottom sheet, and sleepy mascot empty state.
   - **People**: Built contacts list with balances, Add Person bottom sheet (`POST /contacts`), Contact Detail with WhatsApp reminder generation.
   - **Me**: Built profile settings with language selector, audio/haptic preferences (`GET/PATCH /profile`), and confirmation dialogs for Clear Chat and Sign Out.
   - **Assistant**: Full-screen modal overlay with vector Pappu mascot (10 poses: Idle, Listening, Thinking, Speaking, Happy, Excited, Worried, Concerned, Confused, Sleepy), interactive pending action cards, and voice feedback.
4. **Final System Audit**:
   - Removed all dead code (`Balance.js`, `GlassCard.js`), obsolete components, and legacy blue tokens.
   - Tokenized all remaining hardcoded colors and eliminated all banned words and AI slop.
   - Verified back behavior across all sheets, dialogs, stack screens, and tab transitions.

**Tests**
* Backend: 312 passed in pytest (zero failures, zero warnings).
* Frontend: 197 passed across all 24 Jest test suites.
* Assistant Eval Suite: 93.8% overall accuracy (152/162 cases passed), 0.0% schema failures, 7/7 critical regression tests passing.

**Acceptance criteria**: All screens and states match Stitch design specifications at 390x844, 360x780, and 1.3 font scale; all user-facing backend strings strictly follow the no-hyphen and no-em-dash rule; backend, frontend, and assistant evaluation suites pass without regressions.
---

## Phase 14: Bill Split

Rules and contracts: `PROJECT_SPEC.md` §4 (tables), §5b Bill Split, §8 (endpoints). Screens: `design/stitch/bill_split.html` (approved 2026-11-14).

Phases 8 and 9 are still open. Tasks 1 to 6 and 8 are built. Task 7 is wired (the Who had what screen uses the existing `MicButton` and STT path, tested with the mic mocked) but, like Phases 6 to 8, it is not accepted until the manual phone run. Per `CLAUDE.md` rule 5 the whole flow is built and tested on typed input before voice is wired in.

**Tasks**
1. **Schema**: `bills`, `bill_items`, `bill_shares` models and `profiles.upi_id`; extend `apply_schema.py`; RLS on the new tables as the secondary safeguard.
2. **Split maths** (`app/services/bill_split.py`): pure functions for equal item division, proportional charges, whole rupee rounding with the user absorbing the remainder, and the adds up check. No LLM, no database.
3. **Split planner**: `backend/app/llm/split_prompt.md`, Pydantic schema, validation with one retry, name resolution through the existing contact resolver. Typed bill items and typed text only.
4. **Endpoints and writes**: `/bills` routes except image upload (a draft can be created from typed items for testing), confirm with one undo batch, idempotent confirm, cancel, mark paid.
5. **Bill extraction**: spot check Sarvam Document Intelligence on real restaurant bills first (latency, single image support, accuracy) and record the provider decision in `PROJECT_SPEC.md` §2; then `POST /bills` with the image, `backend/app/llm/bill_extract_prompt.md`, `needs_check` flags, image discarded after extraction.
6. **Frontend**: the eight approved screens using tokens and ui primitives only; receipt button in the People header; camera and gallery picker (new native dependency, needs a new dev build); UPI ID field on the Me screen.
7. **Voice**: mic on the Who had what screen through the existing STT path; spoken question for an unassigned item.
8. **Pay requests**: UPI link builder, QR on the Ask to pay sheet, share as image, mark paid.

**Tests**
- pytest, split maths: shared and single items, proportional tax and service charge, discount, rounding (shares always sum to the total), 1 person and 10 people, unassigned item rejected, mismatch above ₹1 rejected.
- pytest, split planner, each with a mocked LLM and a hand written expected output: a clean high confidence case, a missing assignment case (`missing_fields` populated, one targeted question), an ambiguous name case (two close contacts, asks which), and a code mixed Malayalam English case; malformed output and out of range item indexes are rejected.
- pytest, endpoints: nothing in `transactions` before confirm; confirm writes one Food expense plus one People expense per friend and totals match the bill; second confirm writes nothing; undo reverts the whole bill; budget alert fires on the user's share; mark paid writes the People income.
- pytest, isolation: with two verified users, user A cannot read, edit, assign, confirm, cancel or mark paid user B's bill (404), tested through the API.
- pytest, extraction: fixture OCR texts produce the expected items; a bill that does not add up returns `adds_up: false`; an unreadable image returns 422; OCR text containing instructions does not change the planner output.
- Eval: add bill split cases (en, ml, Manglish) to the eval harness as their own suite.
- Jest/RNTL: each screen renders its states (reading, adds up, mismatch blocked, unassigned item, preview, saved, ask to pay); Save split is the only action that calls confirm; UPI ID missing prompts for it.
- Manual on a phone: photograph three real bills; scan the QR in two UPI apps and confirm the amount and payee are prefilled.

**Acceptance criteria**: a real restaurant bill can be photographed, assigned by typed text and by voice in English and code mixed Malayalam, previewed and saved; the shares always equal the bill total; no transaction is written before the explicit confirm; the whole split can be undone; isolation holds across users; a friend can pay from the shared QR; all backend, frontend and eval suites pass without regressions.
