import os
from dotenv import load_dotenv

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(backend_dir, ".env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
if "[PROJECT-REF]" in SUPABASE_URL:
    SUPABASE_URL = ""

raw_jwks = os.getenv("SUPABASE_JWKS_URL", "").strip()
if not raw_jwks or "[PROJECT-REF]" in raw_jwks:
    if not SUPABASE_URL:
        raise RuntimeError(
            "Missing Supabase config: set SUPABASE_JWKS_URL or SUPABASE_URL "
            "(see backend/.env.example). Refusing to start without a JWKS endpoint."
        )
    SUPABASE_JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
elif "/.well-known/jwks.json" in raw_jwks and "/auth/v1/" not in raw_jwks:
    SUPABASE_JWKS_URL = raw_jwks.replace("/.well-known/jwks.json", "/auth/v1/.well-known/jwks.json")
elif raw_jwks.endswith("/auth/v1/jwks.json"):
    SUPABASE_JWKS_URL = raw_jwks.replace("/auth/v1/jwks.json", "/auth/v1/.well-known/jwks.json")
else:
    SUPABASE_JWKS_URL = raw_jwks


# Sarvam AI LLM config (PROJECT_SPEC.md §2)
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_MODEL = os.getenv("SARVAM_MODEL", "sarvam-105b")
SARVAM_API_URL = os.getenv(
    "SARVAM_API_URL", "https://api.sarvam.ai/v1/chat/completions"
)

# Sarvam AI STT config (PROJECT_SPEC.md §2, Saaras v3)
SARVAM_STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v3")
SARVAM_STT_API_URL = os.getenv(
    "SARVAM_STT_API_URL", "https://api.sarvam.ai/speech-to-text"
)

# Sarvam AI TTS config (PROJECT_SPEC.md §2, Bulbul v3)
SARVAM_TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
SARVAM_TTS_API_URL = os.getenv(
    "SARVAM_TTS_API_URL", "https://api.sarvam.ai/text-to-speech"
)
SARVAM_TTS_DEFAULT_SPEAKER = os.getenv("SARVAM_TTS_DEFAULT_SPEAKER", "kavitha")

# Sarvam Document AI (bill OCR, PROJECT_SPEC.md §2 and §5b Bill Split)
SARVAM_DOC_AI_URL = os.getenv("SARVAM_DOC_AI_URL", "https://api.sarvam.ai/doc-ai/v1").rstrip("/")


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


# Per-user calls per minute on the routes that cost money per call (app/rate_limit.py).
RATE_LIMITS_ENABLED = os.getenv("RATE_LIMITS_ENABLED", "true").strip().lower() not in ("0", "false", "no")
RATE_LIMITS = {
    "assistant": _int_env("RATE_LIMIT_ASSISTANT_PER_MIN", 30),
    "stt": _int_env("RATE_LIMIT_STT_PER_MIN", 30),
    "tts": _int_env("RATE_LIMIT_TTS_PER_MIN", 60),
    "bill_read": _int_env("RATE_LIMIT_BILL_READ_PER_MIN", 6),
    "bill_assign": _int_env("RATE_LIMIT_BILL_ASSIGN_PER_MIN", 30),
}

# Assistant traces older than this many days are deleted for a user whenever a new trace
# of theirs is saved. 0 keeps them forever (the default, so nothing is deleted unasked).
TRACE_RETENTION_DAYS = _int_env("TRACE_RETENTION_DAYS", 0)
