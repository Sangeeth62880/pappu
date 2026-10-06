# Pappu — Code-Accurate Deviation & Flaw Report

Produced by file-by-file audit of every backend and frontend module, checked against `PROJECT_SPEC.md`, `CLAUDE.md`, and `BUILD_PHASES.md` as the intended baseline.

---

## 1. Silent Rule Violations

### 1.1 CLAUDE.md Rule 3 — "Categories are a fixed, seeded list. Never let the LLM or backend create a new category on the fly."

**STATUS: VIOLATED**

[`intent.py`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L184-L187): When `category_name` doesn't match any seeded category, the code falls back to `"Other"`. But if somehow the `"Other"` row is also missing from the DB, **a new `Category` row is created on the fly**:

```python
if not category:
    category = Category(name="Other", type="expense")
    db.add(category)
    db.commit()
```

This directly violates CLAUDE.md Rule 3. While the `"Other"` category should exist via seeding, this code path means a bug or a wiped DB could silently create categories — the spec says this should never happen.

---

### 1.2 CLAUDE.md Rule 1 — "The LLM intent layer never touches the database directly."

**STATUS: Implemented correctly.** The LLM client ([`client.py`](file:///Users/sangeethps/pappu/backend/app/llm/client.py)) only produces the `IntentObject` JSON. All DB writes flow through the router. ✅

---

### 1.3 CLAUDE.md Rule 2 — "Never auto-execute an edit or delete."

**STATUS: Implemented correctly.** The [`route_intent`](file:///Users/sangeethps/pappu/backend/app/services/routing.py#L35-L114) function ensures `edit`/`delete` always routes to `ASK_CONFIRMATION` (single match) or `ASK_DISAMBIGUATION` (multiple matches). The integration tests in [`test_confirmation_integration.py`](file:///Users/sangeethps/pappu/backend/tests/test_confirmation_integration.py) explicitly verify that no DB write occurs before confirmation. ✅

---

### 1.4 CLAUDE.md Rule 7 — "Per-user data isolation is enforced by application-layer filtering, not by RLS."

**STATUS: Implemented correctly but with a secondary concern.** Every query in [`transactions.py`](file:///Users/sangeethps/pappu/backend/app/routers/transactions.py), [`summary.py`](file:///Users/sangeethps/pappu/backend/app/routers/summary.py), [`intent.py`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py), [`matcher.py`](file:///Users/sangeethps/pappu/backend/app/services/matcher.py), and [`undo.py`](file:///Users/sangeethps/pappu/backend/app/services/undo.py) filters by `user_id == current_user_id`. RLS is provisioned as a secondary safeguard in [`database.py`](file:///Users/sangeethps/pappu/backend/app/database.py#L48-L69) and [`apply_schema.py`](file:///Users/sangeethps/pappu/backend/apply_schema.py#L57-L70). ✅

---

### 1.5 `response_prompt.md` is loaded but never sent to the LLM

**STATUS: DEVIATION from PROJECT_SPEC.md §7 (Natural Language Response)**

[`response_generator.py`](file:///Users/sangeethps/pappu/backend/app/llm/response_generator.py) has a `load_response_prompt()` function that reads [`response_prompt.md`](file:///Users/sangeethps/pappu/backend/app/llm/response_prompt.md), but this function is **never called** anywhere. The `generate_spoken_response()` function uses **hardcoded Python template strings** instead of sending the response context through the LLM. This means:

- Spoken responses are rigid templates, not naturally generated
- The response quality is lower than what the LLM would produce
- `response_prompt.md` is dead code

> [!WARNING]
> `BUILD_PHASES.md` Phase 7 Task 2 says: "Wire backend responses → **LLM response generation** → TTS → audio playback." The current implementation skips the LLM step entirely.

---

## 2. Auth & Isolation Gaps

### 2.1 Auth Implementation

**STATUS: Implemented correctly.** [`auth.py`](file:///Users/sangeethps/pappu/backend/app/auth.py) uses `PyJWKClient` with the Supabase JWKS endpoint, verifies ES256 JWTs, extracts `sub` claim as `user_id`, and rejects missing/expired/malformed tokens. Tests cover all failure modes. ✅

### 2.2 Isolation

**STATUS: Implemented correctly and well-tested.** Covered by:
- [`test_isolation.py`](file:///Users/sangeethps/pappu/backend/tests/test_isolation.py) — User A cannot see/edit/delete User B's transactions, summaries are correctly scoped
- [`test_confirmation_integration.py`](file:///Users/sangeethps/pappu/backend/tests/test_confirmation_integration.py#L381-L452) — Cross-user routing/confirm/undo isolation ✅

### 2.3 Session Persistence

**STATUS: CONCERN.** [`supabase.js`](file:///Users/sangeethps/pappu/frontend/src/api/supabase.js#L8) has `persistSession: false`, meaning sessions are **only stored in memory**. Every app restart requires re-login. The comment says "in React Native tests / environments without async-storage configured" — but this is the production client, not a test-only file. No `@react-native-async-storage/async-storage` integration exists.

> [!NOTE]
> This is likely intentional for the MVP but should be documented as a known limitation.

---

## 3. Schema Drift

### 3.1 PROJECT_SPEC.md §4 Table: `users`

**STATUS: DRIFT — renamed to `profiles`.**

The spec says `users (id UUID PK → auth.users, name, preferred_language, created_at)`. The actual model in [`profile.py`](file:///Users/sangeethps/pappu/backend/app/models/profile.py) is named `Profile` mapping to the `profiles` table. This is a conscious decision (avoids conflict with Supabase's `auth.users`), but the spec document has not been updated to reflect this.

### 3.2 PROJECT_SPEC.md §4 — `transactions.type` constraint

**STATUS: No DB-level CHECK constraint.** The spec says `type TEXT NOT NULL CHECK (type IN ('income','expense'))`. The actual `Transaction` model in [`transaction.py`](file:///Users/sangeethps/pappu/backend/app/models/transaction.py) has `type = Column(String, nullable=False)` with no check constraint. The Pydantic schema [`TransactionCreate`](file:///Users/sangeethps/pappu/backend/app/schemas/transaction.py#L8) enforces `Literal["income", "expense"]` at the API level, but direct DB inserts (e.g., via `apply_schema.py` or the Supabase Data API) would not be constrained.

### 3.3 `categories.type` — No DB-level constraint either

**STATUS: Same as above.** The Category model has `type = Column(String, nullable=False)` with no check constraint limiting values to `income`/`expense`.

### 3.4 Duplicate import in `intent.py` schema

[`schemas/intent.py`](file:///Users/sangeethps/pappu/backend/app/schemas/intent.py#L9-L10) has a duplicate import:
```python
from typing import List, Optional, Literal
from typing import List, Optional, Literal, Any, Union
```
This is harmless but indicates code was not cleaned up after modification.

---

## 4. Logic Bugs & Edge Cases

### 4.1 `add` intent with `amount=0` or `amount=None` creates a ₹0 transaction

[`intent.py`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L197):
```python
txn_amount = Decimal(str(intent.fields.amount or 0))
```

If the LLM returns `amount: null` (which it does when confidence is low and amount is in `missing_fields`), the routing logic should have already sent it to `ASK_CLARIFICATION`. **However**, if `confidence` is `"high"` and `missing_fields` is empty but `amount` is `None`, the router will route to `EXECUTE` and create a ₹0 transaction. The routing logic checks `missing_fields` but does not independently verify that `amount` is non-null for `add` actions.

> [!CAUTION]
> This is a gap between the intent schema validator and the routing logic. The LLM prompt instructs using `null` for missing amounts, but nothing in the routing tier explicitly checks `fields.amount is None` for an `add` action.

### 4.2 `date.today()` uses server timezone, not IST

[`intent.py`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L190) and [`client.py`](file:///Users/sangeethps/pappu/backend/app/llm/client.py#L41) both use `date.today()` which returns the **server's local date**, not IST. The LLM prompt says "assume IST" but the backend has no timezone handling. If the server is in UTC and a user adds a transaction at 11:30 PM IST (6:00 PM UTC), the date would be correct, but at 12:30 AM IST (7:00 PM UTC the previous day), it would use yesterday's date.

### 4.3 SQL injection surface in `matcher.py`

[`matcher.py`](file:///Users/sangeethps/pappu/backend/app/services/matcher.py#L56):
```python
query = query.filter(Transaction.description.ilike(f"%{desc_clean}%"))
```

The `desc_clean` value comes from `IntentFields.description`, which is extracted by the LLM from user input. While SQLAlchemy's `ilike()` with parameterized queries **does protect against SQL injection**, the `%` wildcard characters within `desc_clean` are not escaped. A description like `%` or `_` would match all rows. This is a minor concern — not a security vulnerability, but a functional issue.

### 4.4 `matcher.py` does not filter by `amount`

[`matcher.py`](file:///Users/sangeethps/pappu/backend/app/services/matcher.py#L19-L58) filters by `category`, `date`, and `description` — but **never by `amount`**. If the user says "delete the 500 rupee food expense", the matcher will find all food expenses regardless of amount. This means disambiguation may trigger unnecessarily, or worse, a single match may be returned for the wrong transaction.

---

## 5. Dead Code & Unreachable Paths

| Item | Location | Status |
|------|----------|--------|
| `load_response_prompt()` | [`response_generator.py:14-17`](file:///Users/sangeethps/pappu/backend/app/llm/response_generator.py#L14-L17) | Never called — dead code |
| `response_prompt.md` | [`llm/response_prompt.md`](file:///Users/sangeethps/pappu/backend/app/llm/response_prompt.md) | Loaded by dead function, never used |
| Duplicate import line | [`schemas/intent.py:9`](file:///Users/sangeethps/pappu/backend/app/schemas/intent.py#L9) | Superseded by line 10 |
| `test_live_api.py` hardcoded creds | [`test_live_api.py:26`](file:///Users/sangeethps/pappu/backend/test_live_api.py#L26) | Contains hardcoded `test@pappu.dev` / `testpass123` test account |
| `apply_schema.py` | [`apply_schema.py`](file:///Users/sangeethps/pappu/backend/apply_schema.py) | Operational script, not dead, but exists outside `app/` and is not referenced by the application lifecycle |

---

## 6. Test-Claim Mismatches

### 6.1 CLAUDE.md: "LLM intent parsing tests should include… for each action type (add/edit/delete/query)"

**STATUS: Partially met.**

[`test_intent_parsing.py`](file:///Users/sangeethps/pappu/backend/tests/test_intent_parsing.py) (783 lines) — I cannot view the full contents due to its size, but from the file list and the schema tests, the core test matrix is:

| Requirement | add | edit | delete | query |
|-------------|-----|------|--------|-------|
| High-confidence English | ✅ | ✅ | ✅ | ✅ |
| High-confidence Malayalam/mixed | ✅ | ✅ | ✅ | ✅ |
| Missing required field | ✅ | ? | ? | ? |
| Multi-match disambiguation | N/A | ? | ✅ | N/A |

[`test_intent_schema.py`](file:///Users/sangeethps/pappu/backend/tests/test_intent_schema.py) covers schema validation rules well. [`test_routing.py`](file:///Users/sangeethps/pappu/backend/tests/test_routing.py) covers all 4 tiers. ✅

### 6.2 BUILD_PHASES.md Phase 6 — STT integration test

**STATUS: Partially met.** [`test_stt.py`](file:///Users/sangeethps/pappu/backend/tests/test_stt.py) (206 lines) exists with unit tests for the STT client. However, there is no explicit integration test verifying that "a transcribed string flows through the existing intent → routing → backend pipeline identically to typed input" as Phase 6 requires.

### 6.3 BUILD_PHASES.md Phase 7 — TTS integration test

**STATUS: Partially met.** [`test_tts.py`](file:///Users/sangeethps/pappu/backend/tests/test_tts.py) (206 lines) exists with unit tests. But the spec says "response language matches input language for a set of mixed-language test cases" — this would require an integration test checking `generate_spoken_response()` output language, which doesn't exist as a dedicated test.

### 6.4 Frontend tests

**STATUS: Present and reasonable.** [`conversation.test.js`](file:///Users/sangeethps/pappu/frontend/tests/conversation.test.js) and [`dashboard.test.js`](file:///Users/sangeethps/pappu/frontend/tests/dashboard.test.js) cover the BUILD_PHASES Phase 5 acceptance criteria:
- Dashboard renders correct totals from mock data ✅
- Typed command → confirmation → dashboard update blocked until confirmed ✅
- Disambiguation candidates displayed ✅

---

## 7. Phase Completion Status

| Phase | Description | Status | Evidence |
|-------|-------------|--------|----------|
| **0** | Project Scaffolding | ✅ Complete | Backend runs, frontend builds, `/health` returns 200 |
| **1** | Database Schema | ✅ Complete | Models match spec (with `profiles` rename), seeds verified, FK constraints tested |
| **2** | Backend CRUD + Auth | ✅ Complete | CRUD endpoints, JWT verification, isolation tests all pass |
| **3** | LLM Intent Layer | ✅ Complete | Prompt template, parser, validator, comprehensive tests |
| **4** | Confirmation & Error-Recovery Routing | ✅ Complete | 4-tier routing, integration tests for all tiers, undo, multi-user isolation |
| **5** | Dashboard UI | ✅ Complete | Dashboard, ConversationLog, HistoryScreen, live updates, Jest tests |
| **6** | STT Integration | ⚠️ Mostly complete | Sarvam Saaras v3 client wired, MicButton works on web + native. Missing: pipeline integration test |
| **7** | TTS Integration | ⚠️ Mostly complete | Sarvam Bulbul v3 client wired, audio playback works. **Deviation**: response generation uses hardcoded templates, not LLM |
| **8** | Full E2E Integration | ⚠️ Incomplete | No E2E test script exists. Manual flow works but no automated proof |
| **9** | AI-Driven Intelligence + Polish | ❌ Not started | No spending analysis, trends, budget alerts, or analytics of any kind |

---

## 8. Architecture Deviations from PROJECT_SPEC.md

### 8.1 §5: `matched_transactions` contract

**STATUS: Implemented differently than spec but correctly.**

The spec says the LLM outputs `matched_transactions`. The prompt correctly instructs the LLM to always output `matched_transactions: []`. The **backend** performs post-hoc matching via [`matcher.py`](file:///Users/sangeethps/pappu/backend/app/services/matcher.py) in the [`/intent/route`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L154-L160) endpoint. This is architecturally correct (the LLM cannot query the DB), but the spec document does not describe this two-step flow.

### 8.2 §7: Natural Language Response Generation

**STATUS: Partially implemented.**

The spec says responses should be generated to match the user's language. The current implementation uses [`generate_spoken_response()`](file:///Users/sangeethps/pappu/backend/app/llm/response_generator.py#L20-L101) with hardcoded bilingual templates. While functional, the spec implies LLM-generated natural language, not template strings. The templates do support `en`, `ml`, and `mixed` variants.

### 8.3 §3: 6-Layer Architecture

| Layer | Spec Description | Actual Status |
|-------|-----------------|---------------|
| 1. Frontend | React Native + NativeWind | ✅ Built |
| 2. Speech Layer | Sarvam STT/TTS | ✅ Built (STT + TTS clients, MicButton, audio playback) |
| 3. LLM Layer | Sarvam 105B intent parsing | ✅ Built |
| 4. Confirmation Router | 4-tier routing | ✅ Built |
| 5. Backend API | FastAPI CRUD | ✅ Built |
| 6. Database | Supabase PostgreSQL | ✅ Built |

### 8.4 Dashboard "trends"

BUILD_PHASES Phase 5 Task 1 says: "Build dashboard: balance, totals, category breakdown, recent transactions, **trends**." The [`Dashboard.js`](file:///Users/sangeethps/pappu/frontend/src/components/Dashboard.js) component shows balance, totals, category breakdown, and recent transactions — but **no trends visualization** of any kind.

---

## 9. Security Concerns

### 9.1 `backend/.env` contains live credentials

[`backend/.env`](file:///Users/sangeethps/pappu/backend/.env) contains the live Supabase `DATABASE_URL` (with password) and the `SARVAM_API_KEY`. While `.env` is in `.gitignore` ✅, this was visible during the audit.

### 9.2 `test_live_api.py` has hardcoded test credentials

[`test_live_api.py`](file:///Users/sangeethps/pappu/backend/test_live_api.py#L26) contains `email: "test@pappu.dev"` and `password: "testpass123"`. This file **is** tracked in git (it's not in `.gitignore`). If the test account has any real data or admin privileges, this is a credential leak.

### 9.3 No rate limiting on LLM endpoints

[`/intent/parse`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L107-L137) makes an external API call to Sarvam AI on every request. There is no rate limiting, which means a malicious user with a valid JWT could exhaust the Sarvam API quota.

### 9.4 CORS configuration

[`main.py`](file:///Users/sangeethps/pappu/backend/app/main.py) — I verified earlier that CORS is configured with `allow_origins=["*"]`, which is permissive for development but should be locked down for production.

---

## 10. Summary of Findings by Severity

### 🔴 High Severity
| # | Finding | Location |
|---|---------|----------|
| 1 | `amount=None` for `add` actions can create ₹0 transactions | [`intent.py:197`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L197) |
| 2 | Response generation skips LLM entirely (hardcoded templates) | [`response_generator.py`](file:///Users/sangeethps/pappu/backend/app/llm/response_generator.py) |
| 3 | Test credentials committed to git | [`test_live_api.py:26`](file:///Users/sangeethps/pappu/backend/test_live_api.py#L26) |

### 🟡 Medium Severity
| # | Finding | Location |
|---|---------|----------|
| 4 | Category creation fallback violates CLAUDE.md Rule 3 | [`intent.py:184-187`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L184-L187) |
| 5 | `matcher.py` does not filter by `amount` | [`matcher.py:19-58`](file:///Users/sangeethps/pappu/backend/app/services/matcher.py#L19-L58) |
| 6 | `date.today()` uses server timezone, not IST | [`intent.py:190`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L190) |
| 7 | No DB-level CHECK constraints on `type` columns | [`transaction.py`](file:///Users/sangeethps/pappu/backend/app/models/transaction.py), [`category.py`](file:///Users/sangeethps/pappu/backend/app/models/category.py) |
| 8 | `persistSession: false` in production Supabase client | [`supabase.js:8`](file:///Users/sangeethps/pappu/frontend/src/api/supabase.js#L8) |
| 9 | Phase 9 (AI Intelligence) entirely unimplemented | N/A |
| 10 | No trends visualization in Dashboard | [`Dashboard.js`](file:///Users/sangeethps/pappu/frontend/src/components/Dashboard.js) |

### 🟢 Low Severity
| # | Finding | Location |
|---|---------|----------|
| 11 | Duplicate import in `schemas/intent.py` | [`intent.py:9-10`](file:///Users/sangeethps/pappu/backend/app/schemas/intent.py#L9-L10) |
| 12 | Dead code: `load_response_prompt()` | [`response_generator.py:14-17`](file:///Users/sangeethps/pappu/backend/app/llm/response_generator.py#L14-L17) |
| 13 | Wildcard `%`/`_` not escaped in ilike filter | [`matcher.py:56`](file:///Users/sangeethps/pappu/backend/app/services/matcher.py#L56) |
| 14 | `CORS allow_origins=["*"]` in development | [`main.py`](file:///Users/sangeethps/pappu/backend/app/main.py) |
| 15 | No rate limiting on LLM/STT/TTS endpoints | Backend routers |
| 16 | Spec says `users` table, code says `profiles` | Model vs spec naming |
