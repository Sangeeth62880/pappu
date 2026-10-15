# Investigation Report: Planner Provider and Model Verification

## Executive Context and Core Finding

This read-only investigation was launched to determine why the Assistant v2 completion report stated that the planner runs on Gemini 2.5 Flash, despite the original project plan specifying Sarvam AI (sarvam-105b).

### Primary Finding
The planner never switched to Gemini. The codebase, configuration, evaluation suite, and git history confirm that the planner runs exclusively on **Sarvam AI (`sarvam-105b`)**. No Gemini SDK, API key, endpoint, or configuration exists anywhere in the repository or git history. 

The reference to Gemini 2.5 Flash originated entirely as an erroneous statement in conversational report text generated during a previous assistant response (conversation step 2645). Zero code or infrastructure changes were ever made to introduce Gemini.

---

## 1. Where the Provider is Set

### Current Planner Provider and Model Selection
The planner provider and model are instantiated in [backend/app/assistant/planner.py](file:///Users/sangeethps/pappu/backend/app/assistant/planner.py#L21-L24) and [backend/app/assistant/planner.py](file:///Users/sangeethps/pappu/backend/app/assistant/planner.py#L72-L75):

Lines 21 to 24 of `backend/app/assistant/planner.py`:
```python
from app.assistant.schemas import Plan, ClarifyAction, AnswerPendingAction
from app.assistant.context import AssistantContext
from app.llm.client import SarvamLLMClient, _extract_json_from_response
from app.services.tracing import AssistantTracer
```

Lines 72 to 75 of `backend/app/assistant/planner.py`:
```python
class AssistantPlanner:
    def __init__(self, llm_client: Optional[SarvamLLMClient] = None):
        self.llm_client = llm_client or SarvamLLMClient()
        self.prompt_template = _load_prompt_template()
```

Lines 126 to 128 of `backend/app/assistant/planner.py`:
```python
        t0 = time.perf_counter()
        raw_output = self.llm_client._make_request(messages)
        t_first = (time.perf_counter() - t0) * 1000.0
```

The underlying client is defined in [backend/app/llm/client.py](file:///Users/sangeethps/pappu/backend/app/llm/client.py#L81-L96):
```python
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        api_url: str | None = None,
    ):
        self.api_key = api_key or SARVAM_API_KEY
        self.model = model or SARVAM_MODEL
        self.api_url = api_url or SARVAM_API_URL

        if not self.api_key:
            raise ValueError(
                "SARVAM_API_KEY is required. Set it in backend/.env or pass it directly."
            )

        self._system_prompt = _inject_today_date(_load_prompt_template())
```

### Configuration Source and Environment Variable Names
The provider and model are read from environment variables defined in [backend/app/config.py](file:///Users/sangeethps/pappu/backend/app/config.py#L15-L21):

```python
# Sarvam AI LLM config (PROJECT_SPEC.md §2)
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_MODEL = os.getenv("SARVAM_MODEL", "sarvam-105b")
SARVAM_API_URL = os.getenv(
    "SARVAM_API_URL", "https://api.sarvam.ai/v1/chat/completions"
)
```

The configuration relies on the following environment variable names:
* `SARVAM_API_KEY` (authentication key for Sarvam AI)
* `SARVAM_MODEL` (defaults to `"sarvam-105b"`)
* `SARVAM_API_URL` (defaults to `"https://api.sarvam.ai/v1/chat/completions"`)

No Gemini or Google configuration variables exist in `backend/app/config.py` or `backend/.env`.

### Status of Legacy Sarvam Paths
The legacy Sarvam intent parser path is still present in the repository and remains functional:
1. `POST /intent/parse` in [backend/app/routers/intent.py](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L43-L60): Calls `SarvamLLMClient.parse_intent()`. It is active and mounted on the FastAPI application in [backend/app/main.py](file:///Users/sangeethps/pappu/backend/app/main.py#L20). Any client sending an HTTP POST to `/intent/parse` with a valid JWT reaches this path.
2. Baseline evaluation adapter in [backend/tests/eval/runner.py](file:///Users/sangeethps/pappu/backend/tests/eval/runner.py#L150-L178): Instantiates `SarvamLLMClient` directly. It is reachable by executing `python -m tests.eval.runner --planner baseline`.

### Complete Inventory of Backend AI Calls
Every external AI call in the backend is listed below:
1. **Assistant v2 Planner**
   * Provider: Sarvam AI
   * Model: `sarvam-105b` (configurable via `SARVAM_MODEL`)
   * Location: [backend/app/assistant/planner.py](file:///Users/sangeethps/pappu/backend/app/assistant/planner.py#L73-L74), lines 127 and 159
   * Endpoint: `https://api.sarvam.ai/v1/chat/completions` via `SarvamLLMClient._make_request`
2. **Legacy Intent Parser**
   * Provider: Sarvam AI
   * Model: `sarvam-105b` (configurable via `SARVAM_MODEL`)
   * Location: [backend/app/routers/intent.py](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L59-L60), calling `client.parse_intent` in [backend/app/llm/client.py](file:///Users/sangeethps/pappu/backend/app/llm/client.py#L176-L235)
   * Endpoint: `https://api.sarvam.ai/v1/chat/completions`
3. **Speech to Text (STT)**
   * Provider: Sarvam AI
   * Model: `saaras:v3` (configurable via `SARVAM_STT_MODEL`, default `"saaras:v3"`)
   * Location: [backend/app/stt/client.py](file:///Users/sangeethps/pappu/backend/app/stt/client.py#L17-L21) and [backend/app/stt/client.py](file:///Users/sangeethps/pappu/backend/app/stt/client.py#L81-L97)
   * Endpoint: `https://api.sarvam.ai/speech-to-text` via `SARVAM_STT_API_URL`
4. **Text to Speech (TTS)**
   * Provider: Sarvam AI
   * Model: `bulbul:v3` (configurable via `SARVAM_TTS_MODEL`, default `"bulbul:v3"`)
   * Location: [backend/app/tts/client.py](file:///Users/sangeethps/pappu/backend/app/tts/client.py#L18-L23) and [backend/app/tts/client.py](file:///Users/sangeethps/pappu/backend/app/tts/client.py#L118-L135)
   * Endpoint: `https://api.sarvam.ai/text-to-speech` via `SARVAM_TTS_API_URL`

There are no other external AI or LLM integrations in the entire backend.

---

## 2. History of the Change

### Git History of Planner and Client Files
The relevant planner and configuration files have the following commit history:

#### `backend/app/assistant/planner.py`
* Commit `1c6988b` (2026-10-14 08:54:11 +0530): `feat(assistant): implement v2 planner, parallel context loader, prompt, and evaluation suite`. Planner authored directly using `from app.llm.client import SarvamLLMClient`.
* Commit `8750a58` (2026-10-14 09:07:37 +0530): `feat(assistant): wire POST /assistant/message, reply composer, and end to end evaluation`. Modified `check_fast_path` argument type handling only.

#### `backend/app/llm/client.py`
* Commit `46ddd15` (2026-08-31 13:51:14 +0530): `Phase 3 Task 2: Prompt template + Sarvam LLM client`. Introduced `SarvamLLMClient` targeting `sarvam-105b`.
* Commit `3d9f1bc` (2026-09-02 16:51:30 +0530): `fix: handle empty/None content from Sarvam LLM in parse_intent`.
* Commit `70a5738` (2026-10-14 07:44:48 +0530): `feat(eval): add evaluation harness, assistant_traces table, and baseline results`. Enhanced `SarvamLLMClient._make_request` with `reasoning_effort: None`, 45s timeouts, and retry backoff.

#### `backend/app/config.py`
* Commit `e6911ed` (2026-08-30 08:56:49 +0530): Initial FastAPI config.
* Commit `46ddd15` (2026-08-31 13:51:14 +0530): Added `SARVAM_API_KEY`, `SARVAM_MODEL`, `SARVAM_API_URL`.
* Commit `59e06c4` (2026-09-01 11:34:02 +0530): Added `SARVAM_STT_*` and `SARVAM_TTS_*` settings.
* Commit `359da17` (2026-10-14 14:03:16 +0530): Removed unused legacy intent routing constants.

#### `backend/requirements.txt`
* Commit `e6911ed` (2026-08-30): Initial dependencies.
* Commit `46ddd15` (2026-08-31): Added `httpx>=0.27.0`.

#### `backend/app/assistant/prompt.md`
* Commit `1c6988b` (2026-10-14 08:54:11 +0530): Created v2 prompt template for structured JSON plan generation.

### First Commit Introducing Gemini
* Result: **NONE**.
* Searching git diff history for Gemini (`git log -S gemini -p`) produces zero commits across the entire repository. Gemini was never introduced into code, config, or documentation.

### Stated Reason for Provider Change
* Result: **No stated reason found**.
* No provider change was made. The prompt instructions given in prompt 0 explicitly specified: `"3. Invokes Sarvam LLM via existing client."` That specification was followed precisely in commit `1c6988b`.

### Origin of the "Gemini 2.5 Flash" Claim
During conversation turn 6 (step 2645 in the local transcript), the assistant answered a high-level question about remaining gaps and architectural constraints. In that summary paragraph, the assistant wrote:
> `"The audio pipeline uses sequential turn execution: full audio upload, STT transcription via Sarvam Saaras v3, single planner call via Gemini 2.5 Flash, deterministic execution, and TTS synthesis via Sarvam Bulbul v3."`

This was an unintended hallucination in conversational prose by the model. The actual implementation in code remained strictly on Sarvam AI throughout.

---

## 3. Evidence Behind the Switch

### Evaluation Results Inventory
All evaluation runs located in [backend/tests/eval/eval_results/](file:///Users/sangeethps/pappu/backend/tests/eval/eval_results) were inspected. Every file was generated using Sarvam AI (`sarvam-105b`):

| Result File | Timestamp (UTC) | Planner | Cases Passed / Total | Overall Accuracy | Schema Failure Rate | Latency p50 | Latency p95 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `20261013_185634.json` | 2026-10-13 18:56:34 | baseline (Sarvam) | 65 / 149 | 43.6% | Not Recorded | Not Recorded | Not Recorded |
| `20261013_185806.json` | 2026-10-13 18:58:06 | baseline (Sarvam) | 72 / 149 | 48.3% | Not Recorded | Not Recorded | Not Recorded |
| `baseline.json` | 2026-10-13 18:58:06 | baseline (Sarvam) | 72 / 149 | 48.3% | Not Recorded | Not Recorded | Not Recorded |
| `20261014_031333.json` | 2026-10-14 03:13:33 | v2 (Sarvam) | 121 / 149 | 81.2% | 0.0% | 543.9 ms | 2220.6 ms |
| `20261014_031507.json` | 2026-10-14 03:15:07 | v2_reasoning (Sarvam) | 123 / 149 | 82.6% | 0.0% | 805.6 ms | 2922.2 ms |
| `20261014_031853.json` | 2026-10-14 03:18:53 | v2 (Sarvam) | 144 / 149 | 96.6% | 0.0% | 546.5 ms | 2243.7 ms |
| `20261014_061525.json` | 2026-10-14 06:15:25 | v2 (Sarvam, slice) | 0 / 5 | 0.0% | 0.0% | 499.7 ms | 670.5 ms |
| `20261014_061547.json` | 2026-10-14 06:15:47 | v2 (Sarvam, slice) | 5 / 5 | 100.0% | 0.0% | 582.1 ms | 647.3 ms |
| `20261014_061557.json` | 2026-10-14 06:15:57 | v2 (Sarvam, slice) | 6 / 7 | 85.7% | 0.0% | 685.8 ms | 1076.7 ms |
| `20261014_061647.json` | 2026-10-14 06:16:47 | v2 (Sarvam, slice) | 7 / 7 | 100.0% | 0.0% | 604.8 ms | 841.6 ms |
| `20261014_061929.json` | 2026-10-14 06:19:29 | v2 (Sarvam, full execute)| 45 / 149 | 30.2% | 0.0% | 14.7 ms | 784.5 ms |
| `20261014_062639.json` | 2026-10-14 06:26:39 | v2 (Sarvam) | 127 / 149 | 85.2% | 0.0% | 582.0 ms | 2150.5 ms |
| `20261014_062935.json` | 2026-10-14 06:29:35 | v2 (Sarvam) | 132 / 149 | 88.6% | 0.0% | 656.9 ms | 2322.5 ms |
| `20261014_063134.json` | 2026-10-14 06:31:34 | v2 (Sarvam, final) | 133 / 149 | 89.3% | 0.0% | 681.1 ms | 2157.5 ms |

### Side by Side Table: Sarvam Baseline vs Sarvam v2 Planner
Because there are zero Gemini runs in existence, the comparison below presents the Sarvam baseline intent parser against the final Sarvam v2 planner run (`20261014_063134.json`):

| Test Case Group | Baseline Sarvam (`baseline.json`) | v2 Planner Sarvam (`20261014_063134.json`) |
| :--- | :--- | :--- |
| `add_dates` | 5 / 8 (62.5%) | 8 / 8 (100.0%) |
| `amount_formats` | 8 / 8 (100.0%) | 8 / 8 (100.0%) |
| `basic_add` | 9 / 10 (90.0%) | 10 / 10 (100.0%) |
| `delete` | 7 / 14 (50.0%) | 13 / 14 (92.9%) |
| `disambiguation_replies` | 0 / 8 (0.0%) | 1 / 8 (12.5%) |
| `edit` | 1 / 10 (10.0%) | 9 / 10 (90.0%) |
| `income` | 3 / 5 (60.0%) | 5 / 5 (100.0%) |
| `injection_sql` | 1 / 4 (25.0%) | 4 / 4 (100.0%) |
| `malayalam_script` | 6 / 8 (75.0%) | 8 / 8 (100.0%) |
| `manglish` | 7 / 10 (70.0%) | 8 / 10 (80.0%) |
| `missing_info_clarify` | 6 / 8 (75.0%) | 7 / 8 (87.5%) |
| `mixed_language` | 6 / 6 (100.0%) | 6 / 6 (100.0%) |
| `multi_action` | 0 / 10 (0.0%) | 9 / 10 (90.0%) |
| `off_topic_chat` | 0 / 6 (0.0%) | 6 / 6 (100.0%) |
| `person_txns` | 7 / 12 (58.3%) | 12 / 12 (100.0%) |
| `queries` | 6 / 14 (42.9%) | 14 / 14 (100.0%) |
| `undo` | 0 / 4 (0.0%) | 1 / 4 (25.0%) |
| `unsupported_budgets` | 0 / 4 (0.0%) | 4 / 4 (100.0%) |
| **Overall Accuracy** | **72 / 149 (48.3%)** | **133 / 149 (89.3%)** |
| **Schema Failure Rate** | **Not Available** | **0.0%** |
| **Latency p50** | **Not Recorded** | **681.1 ms** |
| **Latency p95** | **Not Recorded** | **2157.5 ms** |

### Feasibility of Running Eval on Sarvam
A final Sarvam eval run already exists on disk (`backend/tests/eval/eval_results/20261014_063134.json`). In accordance with read-only instructions, no additional live API calls or runs were initiated. The eval runner can be executed at any time using CLI options only:
`python -m tests.eval.runner --planner v2`

---

## 4. What is Sent to the Provider

### Final Request Payload Structure
The planner formats messages in `backend/app/assistant/planner.py` and dispatches them via `backend/app/llm/client.py`. Below is the exact JSON payload sent over HTTP to `https://api.sarvam.ai/v1/chat/completions`:

```json
{
  "model": "sarvam-105b",
  "messages": [
    {
      "role": "system",
      "content": "# Role\n\nYou are the planner for Pappu...\n[Static prompt instructions and 27 few-shot examples]\n\n# Current Context\n\n{\n  \"today\": \"2026-10-14\",\n  \"weekday\": \"Wednesday\",\n  \"contacts\": [\n    {\n      \"id\": \"[UUID_REDACTED]\",\n      \"name\": \"Pooja\",\n      \"aliases\": [\"Poojechi\"]\n    }\n  ],\n  \"last_3_chat_turns\": [\n    {\n      \"role\": \"user\",\n      \"text\": \"Spent 250 on lunch\"\n    },\n    {\n      \"role\": \"assistant\",\n      \"text\": \"Added Food expense of ₹250.\"\n    }\n  ],\n  \"last_touched_transaction\": {\n    \"id\": \"[UUID_REDACTED]\",\n    \"amount\": 250.0,\n    \"category\": \"Food\",\n    \"contact\": null,\n    \"date\": \"2026-10-14\",\n    \"description\": \"lunch\"\n  },\n  \"pending_item\": null\n}\n\n\nAdditional Instruction: Do not include a 'reasoning' field in your JSON output. Return only 'ops'."
    },
    {
      "role": "user",
      "content": "Spent 250 on lunch"
    }
  ],
  "temperature": 0.1,
  "max_tokens": 1024,
  "reasoning_effort": null
}
```

#### Size Characteristics
* Static system prompt: 11,436 characters across 286 lines in [backend/app/assistant/prompt.md](file:///Users/sangeethps/pappu/backend/app/assistant/prompt.md).
* Dynamic context block: Formatted as JSON replacing `{context}` in the prompt template. Averages approximately 250 to 600 characters depending on the number of contacts and turns.

### Inventory of User Data Sent in Each Call
The following user data fields are transmitted in the context block:
1. `today` and `weekday`: Current date and weekday in Indian Standard Time (IST).
2. `contacts`: Up to 30 recent contacts for the authenticated user, including contact record `id`, `name`, and custom string `aliases`.
3. `last_3_chat_turns`: Up to 6 recent messages across the user and assistant conversation, containing raw user input strings and assistant text replies.
4. `last_touched_transaction`: The most recently mutated transaction details, including transaction record `id`, `amount`, `category`, `contact`, `date`, and user `description`.
5. `pending_item`: The active confirmation or disambiguation record if present, including pending record `id`, `kind`, candidate options, and pending plan parameters.
6. User message: The raw text string typed or spoken by the user for the current turn.

### User Identifiers (PII) Analysis
* **User ID**: NOT included in the LLM payload. (The database query filters by `user_id`, but the UUID of the user is never serialized into `AssistantContext.to_dict_for_prompt()`).
* **User Email**: NOT included.
* **JWT / Auth Token**: NOT included.

### Provider API Access Method, Host, and Data Terms
* **Provider**: Sarvam AI (NOT Google / Gemini).
* **Access Method**: Direct HTTPS POST using Python `httpx` (no proprietary SDK).
* **Endpoint Host**: `api.sarvam.ai` (`https://api.sarvam.ai/v1/chat/completions`).
* **Google API Access**: None. Zero network traffic leaves to Google endpoints for LLM planning.
* **Tier and Terms**: The Sarvam AI account uses a paid subscription API key passed via the `api-subscription-key` header.
* **Google Data Training Risk**: **Not applicable**. Because Google Gemini is not used, no user prompts or context data are ever transmitted to Google AI Studio or Vertex AI.

### Logging and Persistence of Traces
Every call through `POST /assistant/message` is logged to the `assistant_traces` table via [backend/app/services/tracing.py](file:///Users/sangeethps/pappu/backend/app/services/tracing.py) and [backend/app/models/assistant_trace.py](file:///Users/sangeethps/pappu/backend/app/models/assistant_trace.py).

The following data is persisted per trace:
* `user_id`: Authenticated user UUID.
* `message_text`: Exact raw text string submitted by the user.
* `context_json`: Full dynamic context dictionary (contacts, chat history, last touched transaction).
* `raw_llm_output`: Exact raw string returned by Sarvam AI (or combined output if retried).
* `plan_json`: Pydantic validated plan dictionary.
* `latency_ms_per_stage`: Millisecond timings for planner, resolver, executor, and composer.
* `schema_valid`: Boolean flag indicating whether the output satisfied the Pydantic schema.

---

## 5. Keys, Dependencies and Config

### Dependencies Added for Gemini
* Result: **NONE**.
* Inspection of [backend/requirements.txt](file:///Users/sangeethps/pappu/backend/requirements.txt) confirms no Google libraries are present:
```
fastapi>=0.111.0
uvicorn>=0.30.1
sqlalchemy>=2.0.31
psycopg2-binary>=2.9.9
psycopg[binary]>=3.1.0
python-multipart>=0.0.9
python-dotenv>=1.0.1
pytest>=8.2.2
httpx>=0.27.0
PyJWT>=2.8.0
cryptography>=42.0.8
```

### Key Storage and Repository Secret Scanning
* **Gemini Key Variable**: Does not exist anywhere in code, configuration, or environment files.
* **Git History Secret Search**: Searching full git history and commit patches for `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or Google API key patterns (`AIza...`) yielded zero matches.
* **Sarvam Key**: Configured under the variable name `SARVAM_API_KEY`. It is read via `os.getenv("SARVAM_API_KEY")` in `backend/app/config.py`. It is stored locally in `backend/.env`. It has never been committed to git history or included in test fixtures.

### Key Deployment Configuration
* Gemini key: Not configured anywhere (neither locally nor in deployment).
* Sarvam key: Configured in the local developer environment (`backend/.env`). Deployment configuration on cloud hosts is NOT VERIFIED (deployment environment dashboards or server secrets like Render/Fly/Supabase were not accessible within this local read-only repository inspection).

---

## 6. Documentation Consistency

Comparing repository documentation against actual code:

### 1. `PROJECT_SPEC.md`
* File line 25: `| LLM | Sarvam-105B (sarvam-30b is deprecated and no longer available via the Chat Completions API) |`
* File line 147: `Pappu Assistant v2 replaces legacy multi round intent routing with a single LLM planner architecture. Intent classification is the LLM planner's job.`
* **Status**: **MATCHES CODE**. Code uses `sarvam-105b` exclusively.

### 2. `CLAUDE.md`
* File line 14: `Intent classification is the LLM planner's job. Resolution, execution and replies are deterministic code. No keyword or regex intent classification.`
* **Status**: **MATCHES CODE**.

### 3. `BUILD_PHASES.md`
* File line 249: `LLM Planner: Authored single call prompt.md generating declarative PlanV2 JSON. Handled add, edit, delete, query, clarify, and chat operations without regex or keyword classification.`
* **Status**: **MATCHES CODE**.

### 4. Completion Report (Assistant Conversation Step 2645)
* Text: `"The audio pipeline uses sequential turn execution: full audio upload, STT transcription via Sarvam Saaras v3, single planner call via Gemini 2.5 Flash, deterministic execution, and TTS synthesis via Sarvam Bulbul v3."`
* **Status**: **MISMATCH WITH CODE**. The text refers to "Gemini 2.5 Flash", whereas the code in `backend/app/assistant/planner.py` and `backend/app/llm/client.py` uses Sarvam `sarvam-105b`.

---

## 7. Switch Readiness

### Adding Configurable Provider (`PLANNER_PROVIDER=sarvam|gemini`)
To support switching between Sarvam and Gemini via configuration without hardcoding, the following minimal changes would be required:

1. **Files to Touch**:
   * `backend/app/config.py`: Add `PLANNER_PROVIDER = os.getenv("PLANNER_PROVIDER", "sarvam").lower()`, `GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")`, and `GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")`.
   * `backend/app/assistant/planner.py`: Update `AssistantPlanner.__init__` to select the LLM client based on `PLANNER_PROVIDER`.
   * `backend/app/llm/gemini_client.py`: Create a small client implementing `_make_request(messages)` using existing `httpx` to avoid new dependencies.
   * `backend/.env.example`: Document `PLANNER_PROVIDER` and `GEMINI_API_KEY`.
   * `backend/tests/eval/runner.py`: Add `--provider` flag to allow benchmarking both models.

2. **Estimated Size of Change**:
   Approximately 60 to 90 lines of code across 3 files (0 new dependencies if using `httpx`).

3. **Risks and Behavioral Considerations**:
   * **Data Privacy**: If Gemini is used with a free tier Google AI Studio API key, Google's terms permit training on user prompts. A paid Google Cloud Vertex AI endpoint or paid tier key is required to ensure data privacy.
   * **JSON Enforcement**: Sarvam relies on prompt-level instructions and Markdown code fence stripping (`_extract_json_from_response`). Gemini provides native JSON schema enforcement (`response_mime_type="application/json"` and `response_schema`), which would require separate configuration.
   * **Reasoning Tokens**: Sarvam completions require `"reasoning_effort": null` in the payload (added in `backend/app/llm/client.py:113`). Google Gemini API does not accept this parameter and would return a 400 Bad Request error if passed directly.

### Prompt and Schema Compatibility
The current prompt in `backend/app/assistant/prompt.md` and schema in `backend/app/assistant/schemas.py` were designed specifically for Sarvam:
* In [backend/app/assistant/prompt.md](file:///Users/sangeethps/pappu/backend/app/assistant/prompt.md#L7):
  `Respond ONLY with a single JSON object. No markdown fences, no explanatory text.`
* In [backend/app/llm/client.py](file:///Users/sangeethps/pappu/backend/app/llm/client.py#L108-L114):
  ```python
  payload = {
      "model": self.model,
      "messages": messages,
      "temperature": 0.1,
      "max_tokens": 1024,
      "reasoning_effort": None,
  }
  ```
Because no changes were ever made to suit Gemini, the entire prompt and schema remain 100% compatible with Sarvam today.

---

## Final Section: Summary

* **Who made the switch and when**: **No switch was ever made.** The codebase has run on Sarvam AI (`sarvam-105b`) from initial creation through the completion of Phase 12.
* **Stated reason**: **No stated reason found.** The mention of Gemini 2.5 Flash occurred solely as a conversational hallucination by the assistant in turn 6 of the chat history while summarizing system performance.
* **Sarvam versus Gemini accuracy comparison**: There are **zero** Gemini evaluation runs. The evaluation suite was run entirely on Sarvam AI, progressing from a **48.3%** baseline accuracy to **89.3%** (133/149 test cases passing, 0.0% schema failures, 7/7 critical regressions passing) on the final Sarvam v2 planner.
* **User data leaving our systems to Google**: **None.** No user data, transaction records, contacts, or chat messages leave our systems to Google. All inference calls go to Sarvam AI (`api.sarvam.ai`).
* **Documentation that is now wrong**: `PROJECT_SPEC.md`, `CLAUDE.md`, and `BUILD_PHASES.md` are all **correct** and align with the code. Only the textual completion report printed in the previous chat turn was inaccurate.
