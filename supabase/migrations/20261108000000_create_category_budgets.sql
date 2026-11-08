-- Migration: per-category monthly budgets
-- One row per (user, category); the amount applies to every IST calendar month.
-- Spending is computed from transactions at read time and never stored here.
-- Scoped per user. The backend filters by the verified user_id itself; RLS is a
-- secondary safeguard for any Data API path.

CREATE TABLE IF NOT EXISTS public.category_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES public.categories(id),
    amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_category_budget_user_category'
          AND conrelid = 'public.category_budgets'::regclass
    ) THEN
        ALTER TABLE public.category_budgets
        ADD CONSTRAINT uq_category_budget_user_category UNIQUE (user_id, category_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_category_budget_amount_positive'
          AND conrelid = 'public.category_budgets'::regclass
    ) THEN
        ALTER TABLE public.category_budgets
        ADD CONSTRAINT ck_category_budget_amount_positive CHECK (amount > 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_category_budgets_user_id
ON public.category_budgets (user_id);

ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own budgets" ON public.category_budgets;
CREATE POLICY "Users can manage their own budgets" ON public.category_budgets
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
