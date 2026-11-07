import os
import subprocess
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Import app.config in a clean interpreter with .env loading disabled, so the
# developer's local backend/.env cannot mask a missing-config error.
_PROBE = (
    "import dotenv; dotenv.load_dotenv = lambda *a, **k: None\n"
    "import app.config as c; print(c.SUPABASE_JWKS_URL)\n"
)


def _import_config(**env_vars):
    env = {k: v for k, v in os.environ.items() if not k.startswith("SUPABASE_")}
    env.update(env_vars)
    return subprocess.run(
        [sys.executable, "-c", _PROBE],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )


@pytest.mark.parametrize(
    "env_vars",
    [
        {},
        {"SUPABASE_URL": "https://[PROJECT-REF].supabase.co"},
        {
            "SUPABASE_URL": "https://[PROJECT-REF].supabase.co",
            "SUPABASE_JWKS_URL": "https://[PROJECT-REF].supabase.co/auth/v1/.well-known/jwks.json",
        },
    ],
)
def test_missing_supabase_config_fails_at_startup(env_vars):
    res = _import_config(**env_vars)
    assert res.returncode != 0
    assert "RuntimeError" in res.stderr
    assert "SUPABASE_JWKS_URL or SUPABASE_URL" in res.stderr


def test_jwks_url_derived_from_supabase_url():
    res = _import_config(SUPABASE_URL="https://abc.supabase.co/")
    assert res.returncode == 0, res.stderr
    assert res.stdout.strip() == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"


def test_explicit_jwks_url_used_without_supabase_url():
    res = _import_config(SUPABASE_JWKS_URL="https://abc.supabase.co/auth/v1/.well-known/jwks.json")
    assert res.returncode == 0, res.stderr
    assert res.stdout.strip() == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
