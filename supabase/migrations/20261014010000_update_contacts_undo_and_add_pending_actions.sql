-- Migration: Update contacts, undo_actions, and add pending_actions table
-- Scoped per-user with Row Level Security

-- 1. Add aliases text[] default empty to contacts table
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}'::text[];

-- 2. Add batch_id to undo_actions table
ALTER TABLE public.undo_actions 
ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_undo_actions_batch_id 
ON public.undo_actions (batch_id);

-- 3. Create pending_actions table
CREATE TABLE IF NOT EXISTS public.pending_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('confirm', 'disambiguate', 'contact_confirm', 'future_date')),
    plan_json JSONB NOT NULL,
    candidates_json JSONB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'expired', 'superseded')),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security on pending_actions
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own pending actions" ON public.pending_actions;
CREATE POLICY "Users can manage their own pending actions" ON public.pending_actions
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_pending_actions_user_status 
ON public.pending_actions (user_id, status, created_at DESC);
