import os
from dotenv import load_dotenv

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(backend_dir, ".env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://mvobtveaewxgiczulyrq.supabase.co").strip().rstrip("/")

raw_jwks = os.getenv("SUPABASE_JWKS_URL", "").strip()
if not raw_jwks or "[PROJECT-REF]" in raw_jwks:
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


