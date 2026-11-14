-- Bill split (Phase 14, PROJECT_SPEC.md §4 and §5b Bill Split).
-- bills, bill_items, bill_shares with RLS, plus profiles.upi_id. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    merchant TEXT,
    bill_date DATE NOT NULL,
    tax NUMERIC(12,2) NOT NULL DEFAULT 0,
    service_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL CONSTRAINT ck_bill_total_positive CHECK (total > 0),
    status TEXT NOT NULL DEFAULT 'draft'
        CONSTRAINT ck_bill_status CHECK (status IN ('draft', 'confirmed', 'cancelled', 'undone')),
    people JSONB NOT NULL DEFAULT '[]'::jsonb,
    undo_batch_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_bills_user_id ON public.bills (user_id);
CREATE INDEX IF NOT EXISTS ix_bills_undo_batch_id ON public.bills (undo_batch_id);
CREATE INDEX IF NOT EXISTS ix_bills_created_at ON public.bills (created_at);

CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity NUMERIC(8,2) NOT NULL DEFAULT 1,
    amount NUMERIC(12,2) NOT NULL,
    needs_check BOOLEAN NOT NULL DEFAULT false,
    assigned_to JSONB
);
CREATE INDEX IF NOT EXISTS ix_bill_items_bill_id ON public.bill_items (bill_id);

CREATE TABLE IF NOT EXISTS public.bill_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    is_self BOOLEAN NOT NULL DEFAULT false,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    transaction_id UUID,
    paid_transaction_id UUID
);
CREATE INDEX IF NOT EXISTS ix_bill_shares_bill_id ON public.bill_shares (bill_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS upi_id TEXT;

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own bills" ON public.bills;
CREATE POLICY "Users can manage their own bills" ON public.bills
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own bill items" ON public.bill_items;
CREATE POLICY "Users can manage their own bill items" ON public.bill_items
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid()));

ALTER TABLE public.bill_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own bill shares" ON public.bill_shares;
CREATE POLICY "Users can manage their own bill shares" ON public.bill_shares
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid()));
