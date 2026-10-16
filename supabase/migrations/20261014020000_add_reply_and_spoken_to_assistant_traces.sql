-- Migration: Add reply_text and spoken_text to assistant_traces
-- Captures what was displayed and spoken to the user for observability.

ALTER TABLE public.assistant_traces
    ADD COLUMN IF NOT EXISTS reply_text TEXT,
    ADD COLUMN IF NOT EXISTS spoken_text TEXT;
