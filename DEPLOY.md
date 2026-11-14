# Deploying Pappu

Exact order for a release. Every env var name below was checked against the code
(`backend/app/config.py`, `backend/apply_schema.py`, `frontend/src/config/api.js`,
`frontend/src/api/supabase.js`), not copied from older docs.

Do the steps in order. The database must be migrated **before** the new backend
starts, because the backend reads columns the migrations add.

---

## 1. Database (Supabase Postgres)

All SQL below is idempotent (`IF NOT EXISTS` / guarded `DO $$` blocks), so re-running
it on an up-to-date database is safe.

You need the Postgres connection string (Supabase → Project Settings → Database).
It is the same value as the backend's `DATABASE_URL`.

```bash
export DATABASE_URL='postgresql://postgres:<PASSWORD>@db.<PROJECT-REF>.supabase.co:5432/postgres'
```

### 1a. Base schema, seed categories, RLS, signup trigger

The migrations folder does **not** create the base tables (`profiles`, `contacts`,
`categories`, `transactions`, `undo_actions`, `chat_messages`); only
`backend/apply_schema.py` does. It reads `DATABASE_URL` from `backend/.env`.

```bash
cd backend && .venv/bin/python apply_schema.py
```

It ends with `[SUCCESS] Supabase database setup and verification complete!` and
asserts that all tables and the 8 fixed categories exist.

### 1b. Migrations, in filename order

```bash
for f in supabase/migrations/*.sql; do echo "== $f"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break; done
```

Current files (the glob runs them in this order):

| File | What it does |
|---|---|
| `20261014000000_create_assistant_traces.sql` | `assistant_traces` + RLS + index |
| `20261014010000_update_contacts_undo_and_add_pending_actions.sql` | `contacts.aliases`, `undo_actions.batch_id`, `pending_actions` |
| `20261014020000_add_reply_and_spoken_to_assistant_traces.sql` | `assistant_traces.reply_text`, `spoken_text` |
| `20261015000000_add_contacts_phone_upi_and_profile_preferences.sql` | `contacts.phone`, `upi_id`; `profiles.voice_replies`, `haptic_feedback`, `sound_effects` |
| `20261107000000_assistant_idempotency_reservations.sql` | **Idempotency**: `status`, `reserved_at`, nullable `response_json`, `uq_user_client_msg_id`, status check, RLS |
| `20261108000000_create_category_budgets.sql` | **Budgets**: `category_budgets`, `uq_category_budget_user_category`, amount check, RLS |
| `20261114000000_create_bill_split.sql` | **Bill split**: `bills`, `bill_items`, `bill_shares`, RLS; `profiles.upi_id` |

No psql? Paste each file, in this order, into Supabase → SQL Editor and run it.

> The backend's startup `init_db()` runs `create_all`, which creates missing
> *tables* but never adds *columns* to existing ones. Don't rely on it instead of
> the migrations.

### 1c. Verify the idempotency unique constraint

Run in the SQL Editor (or `psql "$DATABASE_URL"`):

```sql
-- 1. Constraints: expect uq_user_client_msg_id = UNIQUE (user_id, client_msg_id)
--    and ck_assistant_idempotency_status = CHECK (status IN ('in_progress','done')).
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.assistant_idempotency'::regclass
  AND contype IN ('u', 'c')
ORDER BY conname;

-- 2. Columns: expect status, reserved_at NOT NULL; response_json nullable.
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'assistant_idempotency'
ORDER BY ordinal_position;

-- 3. No duplicate keys (must return 0 rows).
SELECT user_id, client_msg_id, count(*)
FROM public.assistant_idempotency
GROUP BY user_id, client_msg_id
HAVING count(*) > 1;

-- 4. The constraint actually rejects a duplicate (rolled back, leaves nothing behind).
--    The second INSERT must fail with:
--    duplicate key value violates unique constraint "uq_user_client_msg_id"
BEGIN;
INSERT INTO public.assistant_idempotency (user_id, client_msg_id, status)
SELECT id, 'deploy-check', 'in_progress' FROM public.profiles LIMIT 1;
INSERT INTO public.assistant_idempotency (user_id, client_msg_id, status)
SELECT id, 'deploy-check', 'in_progress' FROM public.profiles LIMIT 1;
ROLLBACK;
```

(Query 4 needs at least one row in `profiles`.)

---

## 2. Backend env vars (Render → pappu-backend → Environment)

`render.yaml` declares these. `sync: false` ones are secrets you type into the
Render dashboard; the rest have values in `render.yaml`.

| Name | Required | Value / notes |
|---|---|---|
| `DATABASE_URL` | **yes** (secret) | Postgres URL from step 1. `app/database.py` raises at import if unset. |
| `SUPABASE_URL` | yes* | `https://<PROJECT-REF>.supabase.co` (no trailing slash needed; it is stripped). |
| `SUPABASE_JWKS_URL` | yes* | `https://<PROJECT-REF>.supabase.co/auth/v1/.well-known/jwks.json` |
| `SARVAM_API_KEY` | **yes** (secret) | Sarvam subscription key. Used by planner, STT and TTS. |
| `SARVAM_MODEL` | no | default `sarvam-105b` |
| `SARVAM_API_URL` | no | default `https://api.sarvam.ai/v1/chat/completions` |
| `SARVAM_STT_MODEL` | no | default `saaras:v3` |
| `SARVAM_STT_API_URL` | no | default `https://api.sarvam.ai/speech-to-text` |
| `SARVAM_TTS_MODEL` | no | default `bulbul:v3` |
| `SARVAM_TTS_API_URL` | no | default `https://api.sarvam.ai/text-to-speech` |
| `SARVAM_TTS_DEFAULT_SPEAKER` | no | default `kavitha` |
| `PYTHON_VERSION` | yes (Render) | `3.12.0` (matches `backend/.python-version`) |

\* At least one of `SUPABASE_URL` / `SUPABASE_JWKS_URL` must be a real value, or
`app/config.py` raises `Missing Supabase config` and the service will not boot. If
only `SUPABASE_URL` is set, the JWKS URL is derived from it. JWTs must be ES256
with `aud = "authenticated"` (`app/auth.py`).

`TEST_USER_EMAIL` / `TEST_USER_PASSWORD` in `backend/.env.example` are only for
`backend/test_live_api.py`. Do not set them on Render.

Render service settings (from `render.yaml`): root dir `backend`, build
`pip install -r requirements.txt`, start
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/health`.

---

## 3. Deploy the backend

1. Run the tests locally first:
   ```bash
   cd backend && .venv/bin/python -m pytest -q
   ```
2. Push `master` (Render auto-deploys from it) or press **Manual Deploy** in Render.
3. Verify (the free plan cold-starts, so the first call can take ~30–60 s):
   ```bash
   curl -sS https://pappu-78n5.onrender.com/health
   ```
   Expect `{"status":"ok","database":"connected"}`. A 500 here means
   `DATABASE_URL` is wrong or the DB is unreachable.

---

## 4. Android build (EAS)

Frontend env vars actually read by the code:

| Name | Read in | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `src/config/api.js` | Must be `https://…` in non-dev builds (http is rejected). Set in `eas.json` → `preview.env` to `https://pappu-78n5.onrender.com`. |
| `EXPO_PUBLIC_SUPABASE_URL` | `src/api/supabase.js` | **Not in `eas.json`.** Falls back to a placeholder, which breaks sign-in. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `src/api/supabase.js` | **Not in `eas.json`.** Same fallback problem. |

`EXPO_PUBLIC_USE_RN_FETCH` and `EXPO_PUBLIC_ASSISTANT_V2` are set in `eas.json`
and `.env.example` but **no code reads them**; they have no effect.

`frontend/.env` is git-ignored, and EAS uploads only files git doesn't ignore
(there is no `.easignore`), so the cloud build never sees it. Make sure the two
Supabase vars exist as EAS environment variables for the `preview` environment:

```bash
cd frontend && npx eas-cli env:list --environment preview
```

If either is missing (the anon key is public by design, so `plaintext` is fine):

```bash
cd frontend && npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value 'https://<PROJECT-REF>.supabase.co' --visibility plaintext
```

```bash
cd frontend && npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value '<ANON_KEY>' --visibility plaintext
```

Run the tests, then build the installable APK (`preview` profile → `buildType: apk`):

```bash
cd frontend && npx jest
```

```bash
cd frontend && npx eas-cli build --platform android --profile preview
```

The `production` profile has no `env` block at all; don't use it until the three
vars above are configured for the `production` environment too.

---

## 5. After install

Run `VOICE_TEST_CHECKLIST.md` on a real phone.
