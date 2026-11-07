import os

# app.config refuses to import without a Supabase JWKS endpoint. Tests never hit
# the network (jwks_client is patched), so a placeholder project URL is enough.
os.environ.setdefault("SUPABASE_URL", "https://test-project.supabase.co")
