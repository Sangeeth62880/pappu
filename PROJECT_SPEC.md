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
| LLM | Sarvam-105B (sarvam-30b is deprecated and no longer available via the Chat Completions API) |
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

-- Contacts (person-to-person tracking, scoped to user)
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories (fixed seed list, not open vocabulary)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL -- 'income' | 'expense'
);
-- Seed: Food, Transport, Shopping, Bills, Entertainment, Salary, People, Other

-- Transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'income' | 'expense'
    amount NUMERIC(12,2) NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL, -- nullable, set when category is 'People'
    description TEXT,
    txn_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Undo Action Log (sequential ledger for non-destructive reversions)
CREATE TABLE undo_actions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- 'add' | 'edit' | 'delete'
    target_id UUID NOT NULL,
    prior_state TEXT,          -- JSON serialized prior snapshot
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Chat Messages (persistent conversation history)
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL,        -- 'user' | 'assistant'
    text TEXT NOT NULL,
    payload TEXT,              -- JSON serialized metadata, cards, speech
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Row-Level Security (RLS):** enabled on `profiles`, `contacts`, `transactions`, and `chat_messages` as a defense-in-depth safeguard. Policy: a user can only `SELECT`/`INSERT`/`UPDATE`/`DELETE` rows where `user_id` (or `id` on `profiles`) matches `auth.uid()`.

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
    "category": "People",
    "contact_name": "Rahul",
    "date": "2026-08-30",
    "description": "lent money"
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
- `fields.contact_name` is nullable (string or null). When present, indicates a person-to-person transaction or query.

---

## 5b. Pappu Assistant v2 Architecture and Specification

Pappu Assistant v2 replaces legacy multi round intent routing with a single LLM planner architecture. Intent classification is the LLM planner's job. Resolution, execution, and replies are deterministic code. Zero keyword or regex intent classification is used.

### Plan Schema
Plans are strictly validated using Pydantic models. A plan consists of up to 5 actions executed in order:

```json
{
  "ops": [
    {
      "op": "add",
      "amount": 250.0,
      "category": "Food",
      "type": "expense",
      "description": "lunch",
      "contact_name": null,
      "date": "2026-10-14"
    }
  ]
}
```

Action operations include:
* `add`: requires `amount` (float), optional `category`, `type` (`expense` or `income`), `description`, `contact_name`, `date`.
* `edit`: requires `target` filter criteria and `patch` with fields to update.
* `delete`: requires `target` filter criteria.
* `query`: requires `query_type` (`balances`, `sum`, `list`, `compare`, `top`), with optional `filters` (`category`, `contact_name`, `date_range`, `search`), `group_by`, and `compare_with`.
* `clarify`: requires `question` and `missing_fields`.
* `chat`: requires `kind` (`greeting`, `help`, `off_topic`, `unsupported`). The composer generates the text reply.

### Endpoints
* `POST /assistant/message`: Primary conversational endpoint. Accepts `{ text: str, input: "text" | "voice", client_msg_id: str }`. Runs one LLM planner call, resolves entities, executes actions, and returns `{ reply, display_text, spoken_text, results, pending, changed }`.
* `POST /assistant/pending/{id}/answer`: Answers an active pending confirmation or disambiguation. Accepts `{ answer: "confirm" | "cancel" | "choose" | str, index: int | null }`. Deterministically executes or cancels the pending plan.
* `GET /assistant/pending`: Returns the single active pending action for the verified user.

### Pending State Machine
Destructive actions (edit, delete) or ambiguous contact references produce a pending state stored in `assistant_pending`.
* States: `pending`, `resolved`, `cancelled`.
* Exactly one active pending state exists per user. Submitting a new conflicting command cancels prior pending state.
* Actions requiring confirmation display a confirmation card with target transaction details.
* Actions with multiple matches display a disambiguation card with candidate selection buttons.

### Contact Aliases
Contacts support alternate names and nicknames stored in `contacts.aliases` as a JSON list.
* The planner returns the contact name or alias matching user input.
* The resolver matches names and aliases using exact matching followed by fuzzy similarity.

### Resolver Rules
* Dates: Relative expressions such as today, yesterday, last week, and weekday names resolve strictly in IST timezone.
* Contacts: Exact match attaches the contact id. Close similarity above 0.85 Jaro Winkler threshold prompts contact confirmation. New names prompt creation.
* Disambiguation: Single match for edit or delete creates a pending confirmation. Multiple matches create a pending disambiguation with up to 5 candidates. Zero matches returns a clear not found notice.

### Composer Templates
The response composer uses deterministic template generation for English and Malayalam.
* Zero secondary LLM calls. The composer formats results directly.
* Produces two distinct strings: `display_text` with currency formatting and styling, and `spoken_text` optimized for text to speech pronunciation without emojis.

### Latency Budget
* Roundtrip target: p50 under 1500ms, p95 under 2500ms.
* Parallel context loading: User context (IST date, top 30 contacts with aliases, last 3 chat turns, last touched transaction, active pending item) loads concurrently before prompt assembly.

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
- **Categories**: fixed list only (Food, Transport, Shopping, Bills, Entertainment, Salary, People, Other). Ambiguous cases default to "Other" or trigger one clarifying question — never silently misclassified.

### Person-to-Person Direction Semantics ("People" Category)
- **Category Seed**: "People" is a standard seeded category, not an ad-hoc or on-the-fly created category.
- **Direction Semantics**:
  - Money sent TO a contact (e.g. "lent John 500", "sent 200 to Rahul", "paid Sarah 1000") = `type: "expense"`, `category: "People"`, `contact_id` set to contact.
  - Money received FROM a contact (e.g. "John paid me back 500", "received 200 from Rahul", "Sarah returned 1000") = `type: "income"`, `category: "People"`, `contact_id` set to contact.
- **Net Balance Convention ("How much is owed to me by X")**:
  - Defined as: `net_balance = sum(money sent to X [expense]) - sum(money received from X [income])`.
  - **Positive (`net_balance > 0`)**: Contact owes the user money. Displays as **"X owes you ₹{net_balance}"**.
  - **Negative (`net_balance < 0`)**: User owes the contact money. Displays as **"You owe X ₹{|net_balance|}"**.
  - **Zero (`net_balance == 0`)**: All settled up with contact. Displays as **"Settled up with X (₹0.00)"**.
- **Query Action Routing**:
  - If `fields.contact_name` is present on a `query` intent (e.g., "how much did I send John", "how much does John owe me"), routing directs to the people summary path for that contact rather than the generic category/date summary.
- **Dashboard Category Breakdown**:
  - "People" appears in the category breakdown on Dashboard like any other category (showing aggregate expense/income under People). Individual contact net balances and transaction histories are accessed via the dedicated People tab/screen.

### System-Wide Spending Definition

Spending has a single consistent definition across the entire codebase (defined in backend/app/services/spending.py):
* Transaction type must be expense.
* The People category and any transaction with a contact attached are excluded from spending, unless the user explicitly asks about a person (selector specifies contact) or explicitly asks about money sent (selector specifies People).
* Biggest expense queries strictly use this definition: they only inspect expense transactions excluding People (unless a person is requested), ensuring income rows such as Salary and transfers to contacts are never returned.
* The same rule applies to sum, biggest, category breakdown / group by, and the Home dashboard summary calculations so that all reported metrics match exactly.

### Recency Ordering

* For delete and edit operations, "latest" orders strictly by created_at desc (physical wall clock insertion order), ensuring that recently entered or backdated records can be targeted accurately.
* For list and query results, ordering is strictly by txn_date desc then created_at desc, displaying transactions in chronological calendar order.

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
| POST | `/assistant/message` | Accepts user message, loads context, invokes LLM planner, resolves, executes, and returns composer reply |
| POST | `/assistant/pending/{id}/answer` | Answers active pending confirmation or disambiguation action |
| GET | `/assistant/pending` | Fetches active pending item for authenticated user |
| POST | `/transactions` | Create transaction |
| PATCH | `/transactions/{id}` | Update transaction |
| DELETE | `/transactions/{id}` | Delete transaction |
| GET | `/transactions` | List and filter transactions (by date range, category, search) |
| GET | `/summary` | Period scoped analytics: spent, income, net, previous period delta, daily chart buckets, expense category breakdown, people totals and top contacts, top expenses |
| GET | `/summary/people` | List of contacts with net balance, total sent, total received |
| GET | `/summary/people/{contact_id}` | Full transaction history with that contact plus net balance and contact details |

### GET `/summary` Query & Response Contract

- **Query Parameters**:
  - `period`: `week` | `month` | `year` (optional, default: `week`)
- **Period Boundaries (strictly in IST via `get_current_ist_datetime()`)**:
  - `week`: Monday 00:00:00 IST to Sunday 23:59:59 IST.
  - `month`: 1st day 00:00:00 IST to last day of current calendar month 23:59:59 IST.
  - `year`: Jan 1 00:00:00 IST to Dec 31 23:59:59 IST.
- **Data Semantics**:
  - `total_spent`: Sum of `type == 'expense'` transactions in the period **excluding** category `'People'` (peer loans/debts are not consumer expenses).
  - `total_income`: Sum of `type == 'income'` transactions in the period **excluding** category `'People'` (debt collections are not income).
  - `net`: `total_income - total_spent`.
  - `previous_period_spent`: Same expense sum over the immediately preceding period window (e.g. prior 7 days / prior month / prior year).
  - `spent_delta_percentage`: `((total_spent - previous_period_spent) / previous_period_spent) * 100` (or `null` if previous is 0).
  - `daily_buckets`: Array of daily data points zero-filled for all days in the period (7 days for week, each day of month for month, each month for year): `[{ date: "YYYY-MM-DD", label: "Mon", amount: float }]`.
  - `categories`: Expense-only category breakdown (`type == 'expense'`), aggregated, top 5 plus "Other", each with `{ category: str, amount: float, percentage: float }`.
  - `people`: `{ total_owed_to_user: float, total_user_owes: float, top_contacts: [{ id: uuid, name: str, net_balance: float }] }` (top 3 contacts by absolute net balance).
  - `top_expenses`: Top 3 single largest expense transactions in the period: `[{ id: uuid, description: str, amount: float, date: str, category: str }]`.
  - `recent_transactions`: At most 5 most recent transactions overall.

---

## 8.5. Design System & Frontend Architecture (Light Theme)

### Theme Policy
- **Light-only**: Modern, clean consumer fintech experience (white surfaces, brand blue accents). Dark theme is deferred.
- **Tokens**: All styles MUST use semantic design tokens and `components/ui/` primitives. Never hardcode colors, fonts, or ad-hoc spacing in screen components.

### Color Tokens & WCAG AA Contrast Ratios
- **Canvas**: `#F8FAFC` (soft cool off-white)
- **Surfaces**: `#FFFFFF` (pure white card)
- **Borders / Dividers**: `#E2E8F0` (faint cool border)
- **Text Primary**: `#0F172A` (deep slate navy, **16.5:1** contrast on white — AAA)
- **Text Secondary**: `#475569` (slate gray, **5.9:1** contrast on white — AA)
- **Text Tertiary**: `#64748B` (muted slate, **4.6:1** contrast on white — AA)
- **Brand Blue Accent**:
  - Fill / Button / Active: `#2563EB` (Blue 600)
  - Dark Accent Text on White: `#1D4ED8` (Blue 700, **4.8:1** contrast on white — AA)
  - Tint Background / Chip: `#EFF6FF` (Blue 50)
- **Semantic Status**:
  - Positive / Income / Owed to user: `#15803D` text on white (**4.8:1** contrast — AA), `#DCFCE7` chip background
  - Negative / Expense / User owes: `#DC2626` text on white (**4.6:1** contrast — AA), `#FEE2E2` chip background
- **Amounts**: Never rely on color alone. Always prefix with explicit `+` or `−` sign and standard ₹ currency symbol.

### Glassmorphism & Android Fallback Policy
- **Glass surfaces**: Limited strictly to the floating bottom navigation bar and modal sheets.
- **Implementation**: Uses `expo-blur` (`BlurView intensity={60} tint="light"`) with a 1px border (`#E2E8F0`) and soft elevation.
- **Android / Fallback**: When blur is unavailable or on Android devices where native blur creates visual artifacts, smoothly falls back to an opaque `#FFFFFF` surface with `elevation: 4` and border `#E2E8F0`.

### Typography
- Geometric sans for Latin paired with `Noto Sans Malayalam` for Malayalam script.
- Line heights tailored to Malayalam typography (1.4–1.5x) to eliminate vertical clipping.
- Monospace/tabular figure variants (`fontVariant: ['tabular-nums']`) for all financial amounts so digits align vertically.

### Screen Responsibilities & Interaction Architecture
- **Home (Dashboard)**: Glanceable overview, period selector, hero spend card, daily spend chart, people summary, expense category proportion bars, max 5 recent transactions with tap-to-edit triggers (`TransactionEditSheet`), and quick header voice action.
- **History**: Comprehensive filterable ledger, date-grouped sections with sticky headers, filter chips (All, Expense, Income, People), category filters, tap-to-edit triggers, and quick header voice action.
- **People**: Person-to-person tracker, contact avatars, net balance badges (owed vs owes), thread-style sent/received transaction detail view with manual edit/delete triggers, and quick header voice action.
- **Assistant**: Dedicated full-screen conversational interface with single conversation composer mic, persistent backend chat history, skeleton loaders, and inline action confirmation/undo cards.
- **Universal Voice Entry (`VoiceListeningSheet`)**: Quick header microphone button on Home, History, and People tabs that opens an overlay listening sheet to capture speech, route intents, and trigger immediate screen refresh without navigating away.
- **Android Back Handling & Toast Layering**: Android hardware `BackHandler` closes active bottom sheets and resets tab-specific filters before exiting to system; `Toast` unmounts completely when dismissed to ensure touch targets above the floating navbar remain 100% accessible.
- **Keyboard Avoidance**: Floating frosted navbar dynamically hides while software keyboard is visible (`keyboardWillShow`/`keyboardDidShow`).

### API Endpoints Summary
- **Transactions**:
  - `GET /transactions`: List transactions with filters (`type`, `category_id`, `contact_id`, `limit`, `offset`).
  - `POST /transactions`: Create new transaction.
  - `PATCH /transactions/{id}`: Manually edit transaction fields (`amount`, `category_id`, `category_name`, `contact_name`, `description`, `txn_date`). Returns 404 on foreign records.
  - `DELETE /transactions/{id}`: Manually delete transaction. Returns 404 on foreign records.
  - `POST /transactions/undo`: Reverts most recent mutation (restores prior state for edit, restores deleted record for delete, removes added record for add).
- **Analytics**:
  - `GET /summary?period=week|month|year`: Period-scoped analytics, zero-filled daily buckets, and category breakdowns.
  - `GET /people/summary` & `GET /people/{contact_id}`: Contact debt tracking and conversation ledgers.
- **Chat History**:
  - `GET /chat/history?limit=50&offset=0`: Paginated conversation messages in chronological order.
  - `POST /chat/message`: Persists message entry (`role`, `text`, `payload`).
  - `DELETE /chat/history`: Purges conversation messages for authenticated user.
- **Voice & AI**:
  - `POST /stt/transcribe`: Audio to text transcription via Sarvam Saaras v3.
  - `POST /tts/synthesize`: Text to speech synthesis via Sarvam Bulbul v3.
  - `POST /intent/parse`, `/intent/route`, `/intent/confirm`: Intent extraction and routing.

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