-- Migration: retry-safe idempotency for POST /assistant/message
-- A (user_id, client_msg_id) row is reserved with status 'in_progress' BEFORE any
-- work runs; the unique constraint decides the winner when retries race. The row
-- becomes 'done' with the stored response once the request finishes.
-- Must be applied BEFORE deploying the backend that reads status/reserved_at.

-- 1. Create the table if it does not exist yet (until now only init_db's create_all made it)
CREATE TABLE IF NOT EXISTS public.assistant_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    client_msg_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'done',
    response_json JSONB,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Upgrade a table created earlier by create_all.
-- Existing rows already hold their stored response, so they backfill as 'done'.
-- The backend always sets status explicitly; the 'done' default only keeps rows
-- written by older code valid during a deploy or rollback.
ALTER TABLE public.assistant_idempotency
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done';

ALTER TABLE public.assistant_idempotency
ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- in_progress rows have no response yet
ALTER TABLE public.assistant_idempotency
ALTER COLUMN response_json DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_user_client_msg_id'
          AND conrelid = 'public.assistant_idempotency'::regclass
    ) THEN
        ALTER TABLE public.assistant_idempotency
        ADD CONSTRAINT uq_user_client_msg_id UNIQUE (user_id, client_msg_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_assistant_idempotency_status'
          AND conrelid = 'public.assistant_idempotency'::regclass
    ) THEN
        ALTER TABLE public.assistant_idempotency
        ADD CONSTRAINT ck_assistant_idempotency_status CHECK (status IN ('in_progress', 'done'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_assistant_idempotency_user_id
ON public.assistant_idempotency (user_id);

CREATE INDEX IF NOT EXISTS ix_assistant_idempotency_client_msg_id
ON public.assistant_idempotency (client_msg_id);

CREATE INDEX IF NOT EXISTS ix_assistant_idempotency_created_at
ON public.assistant_idempotency (created_at);

-- 3. Row Level Security (secondary safeguard; the backend scopes by user_id itself)
ALTER TABLE public.assistant_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own idempotency keys" ON public.assistant_idempotency;
CREATE POLICY "Users can manage their own idempotency keys" ON public.assistant_idempotency
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
