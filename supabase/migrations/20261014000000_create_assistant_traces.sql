-- Migration: Create assistant_traces table for Pappu Assistant v2
-- Scoped per-user with Row Level Security

CREATE TABLE IF NOT EXISTS public.assistant_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    input_type TEXT NOT NULL DEFAULT 'text',
    context_json JSONB,
    raw_llm_output TEXT,
    plan_json JSONB,
    resolver_filters_json JSONB,
    result_json JSONB,
    latency_ms_per_stage JSONB,
    schema_valid BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.assistant_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own traces" ON public.assistant_traces;
CREATE POLICY "Users can manage their own traces" ON public.assistant_traces
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_assistant_traces_user_created 
ON public.assistant_traces (user_id, created_at DESC);
