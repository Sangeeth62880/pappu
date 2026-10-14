import os
from dotenv import load_dotenv

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(backend_dir, ".env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://mvobtveaewxgiczulyrq.supabase.co")
SUPABASE_JWKS_URL = os.getenv(
    "SUPABASE_JWKS_URL",
    f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json",
)

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

# Assistant v2 feature flag
ASSISTANT_V2 = os.getenv("ASSISTANT_V2", "true").lower() in ("true", "1", "yes")



