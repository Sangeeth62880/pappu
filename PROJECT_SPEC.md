# Pappu — Project Specification

This is the source of truth for the project. Any build task, prompt, or agent session should read this file first. If a decision here needs to change, update this file — do not silently diverge from it in code or in chat.

---

## 1. Overview

Pappu is a bilingual (Malayalam/English, code-mixed) voice-first financial assistant. Users speak naturally to add, edit, delete, and query financial transactions. An LLM layer converts speech-derived text into structured intents; the backend executes them against a database; results are spoken back via TTS and reflected live on a dashboard.

Scope: academic/mini project. Not a production financial product. Cost, latency optimization, and independent STT/TTS accuracy benchmarking are explicitly out of scope (STT/TTS are third-party services, not built in-house).

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React Native, Tailwind CSS (via NativeWind or similar), Recharts/Chart.js-equivalent for charts |
| Backend | FastAPI (Python) |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth (not custom-built) |
| STT | Sarvam AI — Saaras v3 |
| TTS | Sarvam AI — Bulbul v3 |
| LLM | Sarvam-30B or Groq Llama 3.3 70B |
| Backend testing | pytest |
| Frontend testing | Jest + React Native Testing Library |

---

## 3. Architecture (Six Layers)

1. **Frontend** — mic input, dashboard, transaction history, charts, language toggle, conversation log.
2. **STT Layer** — speech → raw text (English/Malayalam/code-mixed).
3. **LLM Intent Layer** — raw text → structured intent object (see §5). Does not touch the DB.
4. **Confirmation / Error-Recovery Layer** — routes the intent based on confidence and risk (see §6) before the backend executes anything.
5. **Backend (FastAPI)** — receives routed intents, performs CRUD/analytics operations, enforces per-user data isolation.
6. **Response Generation + TTS** — backend result → natural-language sentence (same language as input) → spoken audio → dashboard updates live.

Flow: `speech → STT → LLM intent → confirmation/error-recovery routing → backend execution → LLM response generation → TTS → live UI update`

---

## 4. Data Model

Auth is handled entirely by Supabase Auth — credentials, password hashing, and session/JWT issuance are not built by hand. The `users` table below is a **profile table**, not the credentials store: it holds app-specific data and links to Supabase's own `auth.users` table via a shared `id`.

```sql
-- User profiles (credentials live in Supabase's auth.users, not here)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    preferred_language TEXT NOT NULL DEFAULT 'en', -- 'en' | 'ml' | 'mixed'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories (fixed seed list, not open vocabulary)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL -- 'income' | 'expense'
);
-- Seed: Food, Transport, Shopping, Bills, Entertainment, Salary, Other

-- Transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'income' | 'expense'
    amount NUMERIC(12,2) NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    description TEXT,
    txn_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Row-Level Security (RLS):** enabled on `profiles` and `transactions` as a defense-in-depth safeguard. Policy: a user can only `SELECT`/`INSERT`/`UPDATE`/`DELETE` rows where `user_id` (or `id` on `profiles`) matches `auth.uid()`.

**Important — the actual enforcement mechanism is application-layer filtering, not RLS.** FastAPI connects to Postgres directly via the `postgres` role (the connection string from Supabase's dashboard), and that role bypasses RLS by default — RLS only applies automatically when a query goes through Supabase's own Data API (PostgREST) using the user's JWT, which this backend does not do. The real guarantee is: FastAPI verifies the JWT (§8), extracts `user_id` from the verified claims, and scopes every query with `WHERE user_id = :verified_user_id`. RLS stays enabled as a secondary safeguard in case anything ever queries the DB by another path (e.g. Supabase's Data API directly from the frontend for a future feature), but it is not what's protecting the backend's own queries today. The isolation test in Phase 2 of `BUILD_PHASES.md` should verify the *application-layer* filtering, not assume RLS is doing the work.

---

## 5. LLM Intent Schema

Every LLM output must conform to this JSON shape. This is the contract between the LLM layer and the confirmation/backend layers — nothing downstream should have to guess at the LLM's certainty.

```json
{
  "action": "add | edit | delete | query",
  "language": "en | ml | mixed",
  "fields": {
    "amount": 500,
    "category": "Food",
    "date": "2026-08-30",
    "description": "lunch"
  },
  "matched_transactions": ["txn_id_1"],
  "confidence": "high | low",
  "requires_confirmation": true,
  "missing_fields": []
}
```

Rules:
- `action: add` → `requires_confirmation: false` (executes immediately, confirmed verbally after the fact).
- `action: edit | delete` → `requires_confirmation: true` whenever exactly one transaction matches.
- If `matched_transactions` has more than one entry → do not set `requires_confirmation`; route to disambiguation instead (§6, Tier 3).
- If any required field for the action is unresolved → list it in `missing_fields`; route to clarification (§6, Tier 4).
- `confidence: low` on any field forces clarification regardless of action type.

---

## 6. Confirmation & Error-Recovery Tiers

| Tier | Trigger | System behavior |
|---|---|---|
| 1 | `add`, high confidence | Execute immediately. Speak confirmation. Support "undo last transaction." |
| 2 | `edit`/`delete`, single match, high confidence | Do not execute. Read back the target transaction. Wait for explicit affirmative before executing. |
| 3 | `edit`/`delete`, multiple matches | Do not execute or confirm-guess. Ask user to pick from the matched list. |
| 4 | `missing_fields` non-empty, or `confidence: low` | Ask a targeted clarifying question for exactly the missing/uncertain field. |

This is implemented as a single routing function the backend calls before any write: given an intent object, it returns one of `EXECUTE`, `ASK_CONFIRMATION`, `ASK_DISAMBIGUATION`, `ASK_CLARIFICATION`.

---

## 7. Ambiguity Resolution Rules

- **Dates**: "today" = server date, IST. "Yesterday" = today − 1. "This month" / "last month" = calendar month boundaries.
- **Amounts**: supports plain numbers, "k" shorthand (5k = 5000), common spoken Malayalam number words for everyday amounts. Anything outside this is a known limitation, not silently guessed.
- **Categories**: fixed list only (Food, Transport, Shopping, Bills, Entertainment, Salary, Other). Ambiguous cases default to "Other" or trigger one clarifying question — never silently misclassified.

---

## 8. API Contracts (Backend)

Login/registration happen client-side via the Supabase client SDK (React Native) — there are no custom `/auth/*` endpoints. The frontend obtains a Supabase session/JWT directly from Supabase, then sends it as a bearer token on every request below.

**JWT verification (important — this project uses asymmetric signing, not a shared secret):** This Supabase project signs tokens with an asymmetric ECC (ES256) key, not the legacy symmetric HS256 secret. There is no static secret string to store in `.env`. FastAPI must verify incoming tokens against Supabase's public JWKS endpoint instead:

```
https://mvobtveaewxgiczulyrq.supabase.co/auth/v1/.well-known/jwks.json
```

Use `PyJWT` (with the `[crypto]` extra) or `python-jose`, with their JWKS-client support, to fetch and cache the public key and verify tokens are signed with `ES256`. Do **not** implement HMAC/shared-secret verification against a `SUPABASE_JWT_SECRET` env var — that only works for the legacy key type this project isn't using. FastAPI extracts `user_id` from the verified token claims; it never accepts a `user_id` from the request body.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/intent/route` | Accepts an LLM intent object, returns routing decision (§6) + any data needed for confirmation/disambiguation prompts |
| POST | `/transactions` | Create transaction |
| PUT | `/transactions/{id}` | Update transaction |
| DELETE | `/transactions/{id}` | Delete transaction |
| GET | `/transactions` | List/filter transactions (by date range, category) |
| GET | `/summary` | Balance, totals, category breakdown, trends |

---

## 9. Repo Structure

```
pappu/
├── PROJECT_SPEC.md
├── CLAUDE.md
├── BUILD_PHASES.md
├── backend/
│   ├── app/
│   │   ├── models/        # SQLAlchemy models matching §4
│   │   ├── routers/       # auth, transactions, summary, intent
│   │   ├── services/      # confirmation routing logic (§6), category rules (§7)
│   │   └── llm/           # prompt templates, intent schema validation (§5)
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/    # dashboard, mic button, conversation log
│   │   ├── screens/
│   │   └── api/
│   └── tests/
```