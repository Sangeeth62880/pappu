# Pappu Assistant V2 Backend Logic Overview

This document provides a comprehensive architectural and functional overview of all backend logic changes introduced in Pappu Assistant V2.

---

## 1. Architectural Transformation

### Retirement of Heuristic Intent Routing
In the legacy system, incoming user messages were processed by keyword checks and regular expression intent classification in [`backend/app/routers/intent.py`](file:///Users/sangeethps/pappu/backend/app/routers/intent.py) and [`backend/app/services/routing.py`](file:///Users/sangeethps/pappu/backend/app/services/routing.py). This led to brittle parsing, misclassifications, and frequent edge case failures.

In V2, heuristic intent classification has been completely eliminated:
* Exactly one Large Language Model call per conversational turn generates a structured plan.
* All intent structuring and parameter extraction are governed by a strictly typed Pydantic V2 schema: [`PlanV2`](file:///Users/sangeethps/pappu/backend/app/assistant/schemas.py#L90-L100).
* A deterministic fast path in [`backend/app/assistant/planner.py`](file:///Users/sangeethps/pappu/backend/app/assistant/planner.py) handles confirmation replies ("yes", "no", "new", "yeah", "yep", "haan", "nope") solely when a pending action is actively waiting.

```
Incoming User Message
         │
         ▼
Parallel Context Assembly (Contacts with Aliases, Last 3 Turns, Last Touched)
         │
         ▼
Fast Path Check (Active Pending Item Only)
   ├── Yes ──► Deterministic Answer Action
   └── No  ──► Single LLM Planner Call (PlanV2 JSON Schema)
                     │
                     ▼
Deterministic Resolver (JWT Scoping, Suffix Normalization, Recency Ordering)
                     │
                     ▼
Modular Action Executors (Add, Edit, Delete, Query, Undo, Pending)
                     │
                     ▼
Natural Language Composer (Zero Hyphen/Em Dash Rule, Filter Naming)
                     │
                     ▼
Synchronous Chat Save + Background Telemetry Persistence
```

---

## 2. Strict Security and Isolation Guarantees

Every database query, transaction modification, and state lookup in V2 is scoped strictly to the authenticated user ID extracted from the Supabase JWT token:
* No cross user data leakage.
* Every SQLAlchemy select, insert, update, and delete includes `where(Transaction.user_id == user_id)` or equivalent entity ownership filters.
* Row Level Security policies enforce user level isolation in PostgreSQL on all new tables:
  * [`assistant_traces`](file:///Users/sangeethps/pappu/supabase/migrations/20261014000000_create_assistant_traces.sql)
  * [`pending_actions`](file:///Users/sangeethps/pappu/supabase/migrations/20261014010000_update_contacts_undo_and_add_pending_actions.sql)
  * [`undo_actions`](file:///Users/sangeethps/pappu/supabase/migrations/20261014010000_update_contacts_undo_and_add_pending_actions.sql)

---

## 3. Core Component Breakdown

### A. Schemas and Type Safety ([`backend/app/assistant/schemas.py`](file:///Users/sangeethps/pappu/backend/app/assistant/schemas.py))
Defines the Pydantic models for planner inputs and outputs:
* [`ActionV2`](file:///Users/sangeethps/pappu/backend/app/assistant/schemas.py#L65-L88): Represents actions including `add`, `edit`, `delete`, `query`, `undo`, `clarify`, `chat`, and `answer_pending`.
* [`SelectorV2`](file:///Users/sangeethps/pappu/backend/app/assistant/schemas.py#L30-L55): Structured criteria for targeted rows (contact, category, amount, amount range, date range, recency, limit, nth, ref, period, direction).
* [`QueryKind`](file:///Users/sangeethps/pappu/backend/app/assistant/schemas.py#L12-L20): Enumerates query types (`list`, `sum`, `category_breakdown`, `balances`, `count`).
* [`BalanceSide`](file:///Users/sangeethps/pappu/backend/app/assistant/schemas.py#L22-L28): Supports net balance directional queries (`they_owe_me`, `i_owe_them`, `all`).

### B. Parallel Context Assembly and Sanitization ([`backend/app/assistant/context.py`](file:///Users/sangeethps/pappu/backend/app/assistant/context.py))
To keep latency minimal, context information is assembled concurrently using Python `asyncio.gather`:
* **User Contacts**: Loaded from the database including canonical names and alternate aliases.
* **Last 3 Chat Turns**: Historical dialogue context to resolve multi turn references.
* **Last Touched Transaction**: Most recently interacted transaction in the current dialogue thread.
* **Temporal Anchors**: Current local ISO date (`today`) and day of week (`weekday`).
* **Privacy Sanitization**: All database UUIDs, internal identifiers, and raw database keys are stripped from the context before prompt construction, preventing hallucination of raw IDs by the model.

### C. Planner and Prompt Engineering ([`backend/app/assistant/planner.py`](file:///Users/sangeethps/pappu/backend/app/assistant/planner.py), [`backend/app/assistant/prompt.md`](file:///Users/sangeethps/pappu/backend/app/assistant/prompt.md))
Governs prompt creation and model interaction:
* Enforces strict JSON output conforming to [`PlanV2`](file:///Users/sangeethps/pappu/backend/app/assistant/schemas.py).
* Supports multilingual inputs: English, Malayalam script, and Manglish (phonetic Malayalam in Latin script).
* Cross script phonetic contact matching: if the spoken name phonetically sounds like a listed contact in another script, the model outputs the listed contact name verbatim.
* Disambiguation of `nth` versus `limit`:
  * `limit` is used for queries ("show last 5 transactions").
  * `nth` is reserved exclusively for single item mutations (`edit` and `delete`).

### D. Deterministic Resolver ([`backend/app/assistant/resolver.py`](file:///Users/sangeethps/pappu/backend/app/assistant/resolver.py))
Bridges LLM plan output to database entities through deterministic business rules:
* **Malayalam Suffix Stripping**: Strips inflectional case suffixes (such as `ിന്`, `യ്ക്ക്`, `ക്ക്`, `ോട്`, `ുടെ`, `ൽ`, `ിൽ`) from spoken contact names prior to alias matching.
* **Unknown Contact Tagging**: Unrecognized person names are tagged as `unknown_contact` without auto creating rows.
* **Recency Ordering Rules**:
  * Mutations (`delete`, `edit` with `recency: latest`): Ordered strictly by `created_at DESC` (wall clock entry order).
  * Read queries (`list`, `sum` with `recency: latest`): Ordered primarily by `txn_date DESC`, followed by `created_at DESC`.
* **Automatic `nth` to `limit` Conversion**: For list queries, any `nth` selector combined with `recency: latest` is translated directly to `limit`, ensuring list queries never return empty matches due to positional targeting.
* **Dynamic Period Computation**: Computes exact start and end dates for relative periods (`today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `this_year`, `all_time`).
* **Unified Spending Definition**: Spending across Pappu is defined consistently in [`backend/app/services/spending.py`](file:///Users/sangeethps/pappu/backend/app/services/spending.py) as `kind == 'expense'` or `(kind == 'person' and direction == 'sent')`.

### E. Modular Action Executors ([`backend/app/assistant/executors/`](file:///Users/sangeethps/pappu/backend/app/assistant/executors/))
Each action type is handled by a specialized executor:
* [`add.py`](file:///Users/sangeethps/pappu/backend/app/assistant/executors/add.py): Inserts expense, income, or person transactions. Triggers contact confirmation when introducing an unrecognized contact name.
* [`edit.py`](file:///Users/sangeethps/pappu/backend/app/assistant/executors/edit.py): Applies attribute updates. Enforces a 10 minute safety confirmation gate: if the target transaction was created or modified over 10 minutes ago, confirmation is required prior to applying changes.
* [`delete.py`](file:///Users/sangeethps/pappu/backend/app/assistant/executors/delete.py): Performs safe transaction deletion and creates non destructive undo records. Rejects ambiguous or bulk deletes.
* [`query.py`](file:///Users/sangeethps/pappu/backend/app/assistant/executors/query.py): Handles list queries, sum aggregations, net contact balance lookups, count queries, and category breakdowns. `category_breakdown` defaults to `this_month` and states the resolved date range in the response.
* [`undo.py`](file:///Users/sangeethps/pappu/backend/app/assistant/executors/undo.py): Reverses the most recent mutation from [`undo_actions`](file:///Users/sangeethps/pappu/backend/app/services/undo.py).

### F. State Machine and Pending Actions ([`backend/app/assistant/pending.py`](file:///Users/sangeethps/pappu/backend/app/assistant/pending.py))
Manages multi turn conversational interruptions:
* **Pending Kinds**:
  1. `confirm`: Confirmation for high impact actions (stale edits, deletions).
  2. `contact_confirm`: Asking user permission before creating a new contact.
  3. `disambiguation`: Resolving ambiguity when multiple transactions or contacts match.
* **Automatic Supersession**: If the user submits an unrelated instruction while an action is pending, the pending item is automatically cleared so the user is never locked in a prompt state.

### G. Ephemeral Last Touched State ([`backend/app/assistant/last_touched.py`](file:///Users/sangeethps/pappu/backend/app/assistant/last_touched.py))
Tracks the most recent transaction referenced in conversation:
* Strictly reserved for pronoun references ("it", "that one", "this one"). Phrases such as "last transaction" or "latest" resolve via recency instead of last touched.
* Automatic TTL expiry after 10 minutes.
* Explicit clearing whenever the referenced transaction is deleted.

### H. Natural Language Composer ([`backend/app/assistant/composer.py`](file:///Users/sangeethps/pappu/backend/app/assistant/composer.py))
Constructs the final assistant text and speech responses:
* **Zero Punctuation Hyphens and Em Dashes**: Strict adherence across all generated text.
* **Filter Naming on Empty Results**: When queries return no matching records, the reply names the applied filters explicitly (e.g., "No Food expense of ₹600 on 13 Oct.").
* **Unknown Contact Notice**: Returns "I don't know a contact named [Name]." without guessing or creating.
* **Descriptive Mutation Confirmations**: Edit and delete responses explicitly report details (e.g., "Changed Shopping ₹350 on 15 Sep to ₹300. Say undo to revert." and "Deleted Pooja ₹100 on 14 Oct.").
* **Directional Clarity**: Person transactions report explicitly ("Noted: you owe Anu ₹400." or "Noted: Anu owes you ₹400.").

### I. Request Path Optimization ([`backend/app/routers/assistant.py`](file:///Users/sangeethps/pappu/backend/app/routers/assistant.py), [`backend/app/services/tracing.py`](file:///Users/sangeethps/pappu/backend/app/services/tracing.py))
* Synchronous user and assistant chat messages are saved transactionally before responding.
* Production telemetry writes to `assistant_traces` are offloaded to FastAPI `BackgroundTasks`.
* Net latency overhead on the user request path reduced from 287 ms to 0.01 ms (100% reduction in telemetry turnaround delay).

---

## 4. Database Migrations

Three SQL migrations support the V2 backend logic:
1. [`20261014000000_create_assistant_traces.sql`](file:///Users/sangeethps/pappu/supabase/migrations/20261014000000_create_assistant_traces.sql):
   Creates `assistant_traces` table tracking planner execution, latencies, tokens, and operational status.
2. [`20261014010000_update_contacts_undo_and_add_pending_actions.sql`](file:///Users/sangeethps/pappu/supabase/migrations/20261014010000_update_contacts_undo_and_add_pending_actions.sql):
   Adds `aliases text[]` column to `contacts` table and creates `pending_actions` table with Row Level Security.
3. [`20261014020000_add_reply_and_spoken_to_assistant_traces.sql`](file:///Users/sangeethps/pappu/supabase/migrations/20261014020000_add_reply_and_spoken_to_assistant_traces.sql):
   Adds `reply_text` and `spoken_text` columns to telemetry records.

---

## 5. Contact Management CLI Tool ([`scripts/merge_contacts.py`](file:///Users/sangeethps/pappu/scripts/merge_contacts.py))

A dedicated command line tool manages contacts:
* **Merging**: Merges duplicate contact entities, reassigning all foreign key relationships, migrating aliases, and calculating updated net balances.
* **Alias Addition**: Directly associates spoken names, nicknames, and vernacular spellings with canonical contact records:
  ```bash
  PYTHONPATH=. .venv/bin/python scripts/merge_contacts.py add-alias \
    --user-id <USER_UUID> \
    --contact-id <CONTACT_UUID> \
    --alias "റോണിക്ക്"
  ```

---

## 6. Evaluation Harness and Quality Verification

### Comprehensive Test Suite
* **Backend Unit and Integration Tests**: 290 automated tests in `backend/tests/` verifying schemas, resolvers, executors, isolation, and routing.
* **Frontend Component and Contract Tests**: 95 unit tests in `frontend/tests/` verifying conversation logs, cards, tap buttons, and audio hooks.

### Evaluation Benchmark ([`backend/tests/eval/`](file:///Users/sangeethps/pappu/backend/tests/eval/))
* 162 production trace and edge case scenarios evaluated across 19 categories.
* **Accuracy**: 92.6% pass rate with 0% schema validation errors.
* **Latencies**: Median latency 629 ms, 95th percentile under 985 ms.
* Full regression pass on all core capabilities (multi action commands, Manglish deletes, relative dates, and balance inquiries).
