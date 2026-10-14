# Pappu — Build Phases

Build in this order. Do not start a phase until the previous phase's acceptance criteria are met. Each task includes the test to write/run immediately after building it — not deferred to later.

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
2. UI polish, avatar, language toggle refinement.
3. Final review against `PROJECT_SPEC.md` for any drift introduced during the build.

**Tests**
- Unit tests for each analytics computation against known seeded data (e.g., verify "highest spending category" logic against a hand-computed expected answer).
- Regression pass: re-run Phase 8's end-to-end test to confirm polish didn't break the core flow.

**Acceptance criteria**: Analytics features are correct against known test data, and the core voice flow still passes its end-to-end test after all polish work.

---

## Phase 10 — Light Design System & Analytics Redesign

*Note: This phase satisfies the previously unfinished Phase 5 "trends" requirement and implements key parts of Phase 9 analytics (spending patterns, highest category, period comparison, daily buckets, delta vs previous period). Phase 9 itself remains in progress for remaining predictive budgeting/alerts.*

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

Note: The compare and group_by operations implemented in this phase cover analytics capabilities of Phase 9. Phase 9 is not marked complete because budgets remain unsupported.

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