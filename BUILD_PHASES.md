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

**Acceptance criteria**: Schema is in place, seed data verified, constraint tests pass.

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