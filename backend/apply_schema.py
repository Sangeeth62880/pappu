import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in backend/.env")
    sys.exit(1)

print(f"Connecting to database: {DATABASE_URL.split('@')[-1]}...")

engine = create_engine(DATABASE_URL)

SCHEMA_SQL = """
-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    preferred_language TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Contacts Table
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL
);

-- 4. Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    category_id INTEGER NOT NULL REFERENCES public.categories(id),
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    description TEXT,
    txn_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure contact_id column exists if table was created previously without it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'contact_id'
    ) THEN
        ALTER TABLE public.transactions ADD COLUMN contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Seed Categories (Fixed list per PROJECT_SPEC.md §4 & §7)
INSERT INTO public.categories (name, type) VALUES
    ('Food', 'expense'),
    ('Transport', 'expense'),
    ('Shopping', 'expense'),
    ('Bills', 'expense'),
    ('Entertainment', 'expense'),
    ('Salary', 'income'),
    ('People', 'expense'),
    ('Other', 'expense')
ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type;

-- 6. Row-Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
CREATE POLICY "Users can manage their own profile" ON public.profiles
    FOR ALL
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own contacts" ON public.contacts;
CREATE POLICY "Users can manage their own contacts" ON public.contacts
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own transactions" ON public.transactions;
CREATE POLICY "Users can manage their own transactions" ON public.transactions
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 7. Trigger to automatically provision profiles on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, preferred_language)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'User'),
    COALESCE(new.raw_user_meta_data->>'preferred_language', 'en')
  )
  ON CONFLICT (id) DO UPDATE
  SET name = COALESCE(EXCLUDED.name, profiles.name),
      preferred_language = COALESCE(EXCLUDED.preferred_language, profiles.preferred_language);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 8. Backfill profiles for any users already present in auth.users
INSERT INTO public.profiles (id, name, preferred_language)
SELECT id, COALESCE(raw_user_meta_data->>'name', 'User'), COALESCE(raw_user_meta_data->>'preferred_language', 'en')
FROM auth.users
ON CONFLICT (id) DO NOTHING;
"""

def apply_schema():
    with engine.connect() as conn:
        print("Executing SQL schema, RLS policies, and seed data...")
        conn.execute(text(SCHEMA_SQL))
        conn.commit()
        print("Schema applied successfully!")

        # Verify tables in information_schema.tables
        print("\n--- Verifying Tables in information_schema.tables ---")
        result = conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('profiles', 'contacts', 'categories', 'transactions')
            ORDER BY table_name;
        """))
        tables = [row[0] for row in result.fetchall()]
        print(f"Found public tables: {tables}")
        assert set(tables) == {'profiles', 'contacts', 'categories', 'transactions'}, f"Missing tables! Expected profiles, contacts, categories, transactions. Got {tables}"

        # Verify seed categories
        print("\n--- Verifying Seed Categories ---")
        result = conn.execute(text("SELECT id, name, type FROM public.categories ORDER BY id;"))
        categories = result.fetchall()
        for cat in categories:
            print(f"  Category #{cat[0]}: {cat[1]} ({cat[2]})")
        
        expected_categories = {"Food", "Transport", "Shopping", "Bills", "Entertainment", "Salary", "People", "Other"}
        actual_categories = {cat[1] for cat in categories}
        assert actual_categories == expected_categories, f"Category mismatch! Expected {expected_categories}, got {actual_categories}"
        print("Categories verified exactly matching PROJECT_SPEC.md §4 & §7!")

        # Verify profiles
        print("\n--- Verifying Profiles ---")
        result = conn.execute(text("SELECT id, name, preferred_language, created_at FROM public.profiles;"))
        profiles = result.fetchall()
        print(f"Found {len(profiles)} profile(s) in database:")
        for prof in profiles:
            print(f"  Profile ID: {prof[0]}, Name: {prof[1]}, Lang: {prof[2]}")

        # Verify RLS policies
        print("\n--- Verifying RLS Policies ---")
        result = conn.execute(text("""
            SELECT tablename, policyname, cmd 
            FROM pg_policies 
            WHERE schemaname = 'public' AND tablename IN ('profiles', 'contacts', 'transactions');
        """))
        policies = result.fetchall()
        for pol in policies:
            print(f"  Table: {pol[0]}, Policy: {pol[1]}, Cmd: {pol[2]}")

    print("\n✅ Supabase database setup and verification complete!")

if __name__ == "__main__":
    apply_schema()
