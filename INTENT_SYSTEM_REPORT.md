# Comprehensive Intent & Assistant Architecture Report

**Generated on:** 2026-10-13  
**Repository:** Pappu Financial Assistant (`pappu`)  
**Target:** Read-only investigation and verbatim code inspection of the complete Natural Language Intent, Matcher, Executor, Speech, and Assistant Layer.

---

## 1. Pipeline Map

### End-to-End Request Pipeline

#### A. Voice Input Flow
1. **User Audio Capture**:
   - `frontend/src/components/MicButton.js` (`startRecording` lines 102–176, `stopRecording` lines 187–222).
   - Audio is recorded using `expo-audio` (`useAudioRecorder`, `RecordingPresets.HIGH_QUALITY` producing `.m4a` on native iOS/Android) or HTML5 `MediaRecorder` (`audio/webm` on Web).
   - `frontend/src/components/ui/VoiceListeningSheet.js` (lines 27–140) provides an alternate modal voice input surface on Home/History/People screens.
2. **Audio Upload & Speech-to-Text (STT)**:
   - `frontend/src/api/client.js` (`transcribeAudio`, lines 164–252): Streams binary audio multipart form to `/stt/transcribe` (using `XMLHttpRequest` on React Native to bypass Expo Winter fetch polyfill bugs).
   - `backend/app/routers/stt.py` (`transcribe_audio`, lines 11–53): Authenticates Supabase JWT, reads uploaded audio bytes.
   - `backend/app/stt/client.py` (`SarvamSTTClient.transcribe`, lines 41–104): Invokes Sarvam Saaras v3 API (`https://api.sarvam.ai/speech-to-text`) with `language_code="unknown"`.
   - Returns JSON `{"transcript": "...", "language_code": "..."}` to the client.
3. **Dispatch to Conversation Log**:
   - `MicButton.js` invokes `onTranscribed(transcript)` (line 243).
   - `ConversationLog.js` invokes `handleSendMessage(explicitText)` (lines 164–204) with the transcribed string.

#### B. Typed Input & Intent Processing Flow
1. **Input Submission**:
   - `frontend/src/components/ConversationLog.js` (`handleSendMessage`, lines 164–204).
   - Creates optimistic user message in local React state and persists to database via `saveChatMessage(token, { role: 'user', text })`.
2. **Intent Parsing API Route**:
   - `frontend/src/api/client.js` (`parseIntent`, lines 91–97) calls `POST /intent/parse`.
   - `backend/app/routers/intent.py` (`parse_intent`, lines 114–145): Authenticates user, passes text to singleton `SarvamLLMClient`.
3. **LLM Prompt Execution**:
   - `backend/app/llm/client.py` (`SarvamLLMClient.parse_intent`, lines 176–245):
     - Injects current ISO date (IST) into prompt template from `backend/app/llm/intent_prompt.md`.
     - Sends HTTP POST to Sarvam AI (`https://api.sarvam.ai/v1/chat/completions`) using model `sarvam-105b`.
     - Strips markdown code fences via `_extract_json_from_response` (lines 47–71).
     - Validates against Pydantic schema via `parse_and_validate_intent` in `backend/app/schemas/intent.py` (lines 130–151).
     - If validation fails, executes 1 automatic retry prompt asking the model to fix its JSON.
4. **Intent Routing API Route**:
   - `frontend/src/api/client.js` (`routeIntent`, lines 102–108) calls `POST /intent/route` with the `IntentObject`.
   - `backend/app/routers/intent.py` (`route_intent_endpoint`, lines 147–417):
     - If `action` is `edit` or `delete`: Invokes `match_transactions` in `backend/app/services/matcher.py` (lines 20–82).
     - Calls pure routing function `route_intent` in `backend/app/services/routing.py` (lines 35–116).
5. **Execution & Routing Branching**:
   - **Tier 1 (EXECUTE)**:
     - `add`: Checks contact with `find_similar_contacts` in `backend/app/services/contact_matcher.py`. If fuzzy/similar contacts found, demotes to Tier 2/3. Otherwise creates `Contact` (if new), resolves `Category`, inserts `Transaction` row into PostgreSQL (`intent.py` lines 185–294).
     - `query`: If `contact_name` present, computes net balance and transaction list for that contact. Otherwise calls `match_transactions` and calculates category totals (`intent.py` lines 295–371).
   - **Tier 2 (ASK_CONFIRMATION)**:
     - Returns single matched transaction details as `target_transaction` (`intent.py` lines 374–387).
   - **Tier 3 (ASK_DISAMBIGUATION)**:
     - Returns list of matched transaction candidates as `candidates` (`intent.py` lines 389–403).
   - **Tier 4 (ASK_CLARIFICATION)**:
     - Triggered when `confidence == "low"` or `missing_fields` is non-empty (`routing.py` lines 46–60).
6. **Response Generation**:
   - `backend/app/llm/response_generator.py` (`generate_spoken_response`, lines 20–103): Selects hardcoded template sentence based on `decision`, `action`, and detected `language`.
7. **Text-to-Speech (TTS)**:
   - `frontend/src/components/ConversationLog.js` (`speakResponse`, lines 145–158) calls `synthesizeSpeech` (`POST /tts/synthesize`).
   - `backend/app/routers/tts.py` (`synthesize_speech`, lines 17–48) -> `backend/app/tts/client.py` (`SarvamTTSClient.synthesize`, lines 73–148) calling Sarvam Bulbul v3 (`bulbul:v3`).
   - Base64 WAV audio returned to client.
8. **UI Audio Playback & State Update**:
   - `frontend/src/utils/audioPlayer.js` (`playAudioBase64`, lines 27–56) plays audio via `expo-audio` or Web Audio API.
   - `ConversationLog.js` persists assistant reply via `saveChatMessage()`, triggers `onTransactionMutated()`, and renders message bubbles with `ConfirmationCard` or `QueryDataCard`.

### Branching Points
- **Keyword/Regex shortcuts**:
  - `backend/app/routers/intent.py` lines 267–270: Keyword check on `description` (`["receive", "got back", "paid back", "returned", "thannu", "income"]`) to force transaction direction to `"income"`.
  - `backend/app/routers/intent.py` line 359 & `matcher.py` line 45: Substring check on LLM `reasoning` for `["month", "മാസം"]` to trigger calendar month filtering.
  - `frontend/src/components/ConversationLog.js` line 183: Keyword array check on user input `['yes', 'confirm', 'sure', 'ok', 'aam']` to trigger `handleConfirmAction`.
- **LLM vs Rule Fallbacks**:
  - Entire intent parsing relies on the LLM; no regex-based intent classification exists (prohibited by architectural comment in `intent_prompt.md:3-4`).
  - Contact matching uses exact lower-case match, substring check, then Python `difflib.SequenceMatcher` fallback (`similarity_threshold=0.65`).

---

## 2. LLM Layer

### Model & Provider
- **Provider**: Sarvam AI (Cloud API, Mumbai region).
- **API Endpoint**: `https://api.sarvam.ai/v1/chat/completions` (configured in `backend/app/config.py:19`).
- **Model**: `sarvam-105b` (105-billion parameter bilingual model).
- **Invocation**: Direct HTTP `POST` via `httpx.Client` (`backend/app/llm/client.py:121`) using header `api-subscription-key: <SARVAM_API_KEY>`.

### Request Parameters
From `backend/app/llm/client.py` lines 108–114:
```python
108:         payload = {
109:             "model": self.model,
110:             "messages": messages,
111:             "temperature": 0.1,  # Low temperature for deterministic structured output
112:             "max_tokens": 1024,   # Ensure completion budget is never truncated to 0
113:             "reasoning_effort": None,  # Serializes to `"reasoning_effort": null` in JSON
114:         }
```
*Note: JSON mode or tool calling is NOT used. Free text completion with prompt-guided JSON formatting.*

### Prompt Construction & Verbatim Template
In `backend/app/llm/client.py` lines 96–97 & 35–45:
```python
96:         self._system_prompt = _inject_today_date(_load_prompt_template())
```
```python
35: def _inject_today_date(prompt: str) -> str:
36:     """
37:     Replace date references in examples with actual today's date.
38:     The prompt uses hardcoded example dates — we inject today's date
39:     so the LLM knows the current date for "today"/"yesterday" resolution.
40:     """
41:     today = date.today().isoformat()
42:     # Prepend a date context line to the prompt
43:     date_context = f"\n\nCurrent date (IST): {today}\n"
44:     return prompt + date_context
```

The system prompt template is loaded from `backend/app/llm/intent_prompt.md`. Verbatim excerpts:
```markdown
# Pappu Intent Parsing Prompt — v2.0

You are Pappu, a bilingual financial assistant that understands English, Malayalam, and code-mixed (English + Malayalam / Manglish) input. Your job is to convert the user's natural language text about financial transactions into a structured JSON intent object.

## Core Reasoning Principle
Do not rely on matching specific words. Reason about what would happen to the user's money/records if you performed this action, and choose the action whose real-world effect matches the user's intent:
- **add**: Records a NEW financial event that took place (e.g. paying, spending, receiving, or transferring money).
- **edit**: Corrects, updates, adjusts, or subtracts from an ALREADY RECORDED transaction.
- **delete**: Cancels, discards, removes, or deletes an ALREADY RECORDED transaction.
- **query**: Checks balances, searches, summarizes, or asks questions without altering records.

You MUST generate the `reasoning` field FIRST in the JSON output. In `reasoning`, state in your own words what the user's request means in real-world terms (e.g. "User wants to remove a previously recorded 600 rupee food expense from yesterday") BEFORE committing to the `action` field.

## Output Format

You MUST output ONLY a single valid JSON object with NO additional text, explanation, or markdown fences. The JSON must conform exactly to this schema:

{
  "reasoning": "<concise explanation of what the user wants to happen to their financial records>",
  "action": "add | edit | delete | query",
  "language": "en | ml | mixed",
  "fields": {
    "amount": <number or null>,
    "category": "<string or null>",
    "date": "<YYYY-MM-DD string or null>",
    "description": "<string or null>",
    "contact_name": "<string or null>"
  },
  "matched_transactions": [],
  "confidence": "high | low",
  "requires_confirmation": <true | false>,
  "missing_fields": []
}
```

The prompt includes 8 contrastive minimal pairs (`intent_prompt.md:81-163`):
1. Pair 1: Removal vs Addition with Amount & Category (Manglish / Code-Mixed) (`Innalathe food inte 600 ozhivakku` vs `Innalathe food inu 600 koduthu`)
2. Pair 2: Removal vs Addition with Amount & Category (English) (`Delete yesterday's 500 food expense` vs `Add 500 food expense yesterday`)
3. Pair 3: Removal vs Addition in Malayalam Script (`ഇന്നലത്തെ ചായ കുടിച്ച 50 രൂപ ഒഴിവാക്കൂ` vs `ഇന്നലെ ചായയ്ക്ക് 50 രൂപ ചിലവായി`)
4. Pair 4: Negated Deletion vs Removal Idioms (`delete cheyyalle 200 add cheyyu` vs `innalathe tea 20 vendannu vekku`)
5. Pair 5: Correction/Adjustment vs New Entry (`athu 500 alla 600 aayirunnu` vs `600 shopping cheythu`)
6. Pair 6: Reduction from Existing vs New Expense (`petrolil ninn 1000 kurakku` vs `petrolinu 1000 aayi`)
7. Pair 7: Person Query vs Person Payment (`how much does Rahul owe me?` vs `sent 500 to Rahul`)
8. Pair 8: Vague / Low Confidence vs Clear Intent (`200 koduthu` vs `foodinu 200 koduthu`)

### Exact User Message Template
From `backend/app/llm/client.py` lines 195–198:
```python
195:         messages = [
196:             {"role": "system", "content": self._system_prompt},
197:             {"role": "user", "content": user_text},
198:         ]
```
*Note: No conversation history, contact list, or recent transactions are included in `messages`.*

### Output Parsing, Validation & Retries
From `backend/app/llm/client.py` lines 212–240:
```python
212:             extracted_json = _extract_json_from_response(raw_response)
213: 
214:             try:
215:                 intent = parse_and_validate_intent(extracted_json)
216:                 return intent
217:             except IntentValidationError as e:
218:                 last_error = e
219:                 logger.warning(
...
227:                 if attempt < max_retries:
228:                     # Ask the LLM to fix its output
229:                     messages.append({"role": "assistant", "content": raw_response or ""})
230:                     messages.append(
231:                         {
232:                             "role": "user",
233:                             "content": (
234:                                 f"Your previous output was invalid: {e}. "
235:                                 "Please output ONLY a single valid JSON object matching "
236:                                 "the schema. No explanation, no markdown."
237:                             ),
238:                         }
239:                     )
```

### Pre-Parsing & Post-Correction
1. Pre-parsing: In `backend/app/schemas/intent.py` lines 23–44, `@field_validator("amount", mode="before")` strips commas and coerces numeric strings to numbers.
2. Safety net validator: Lines 61–91 in `intent.py` inspect `amount`. If the string cannot be converted to float (e.g. `"many"`), it sets `amount = None`, `confidence = "low"`, and appends `"amount"` to `missing_fields`.
3. Post-correction: In `backend/app/routers/intent.py` lines 266–271:
```python
266:             elif contact_id:
267:                 desc = (intent.fields.description or "").lower()
268:                 if any(w in desc for w in ["receive", "got back", "paid back", "returned", "thannu", "income"]):
269:                     txn_type = "income"
270:                 else:
271:                     txn_type = "expense"
```

### Latency & Constraints
- Average latency per call to `sarvam-105b` is **1.5 to 2.5 seconds** (measured across live integration runs).
- Cost/rate limit: Sarvam API subscription headers return rate-limit metadata; HTTP 429 triggers exponential backoff sleep (lines 168–170).

---

## 3. Intent Schema

### Pydantic Models
From `backend/app/schemas/intent.py` lines 14–60:
```python
14: class IntentFields(BaseModel):
15:     """Fields extracted by the LLM from user input."""
16:     amount: Optional[Union[float, int]] = None
17:     category: Optional[str] = None
18:     date: Optional[str] = None  # ISO date string, e.g. "2026-08-30"
19:     description: Optional[str] = None
20:     contact_name: Optional[str] = None
21:     type: Optional[str] = None  # 'income' | 'expense'
```
```python
47: class IntentObject(BaseModel):
48:     """
49:     The structured intent object produced by the LLM layer.
50:     This is the contract defined in PROJECT_SPEC.md §5.
51:     """
52:     reasoning: Optional[str] = None
53:     action: Literal["add", "edit", "delete", "query"]
54:     language: Literal["en", "ml", "mixed"]
55:     fields: IntentFields = Field(default_factory=IntentFields)
56:     matched_transactions: List[str] = Field(default_factory=list)
57:     confidence: Literal["high", "low"]
58:     requires_confirmation: bool
59:     missing_fields: List[str] = Field(default_factory=list)
```

### Dispatcher
- Dispatched in `backend/app/routers/intent.py` line 170 via `routing_result = route_intent(intent)` and handled in lines 184–416:
  - `action == "add"`: lines 185–294.
  - `action == "query"`: lines 295–371.
  - `action in ("edit", "delete")`: lines 374–403 (collects candidates for confirmation/disambiguation).
  - Explicit execution of confirmed edit/delete: handled via `POST /intent/confirm` in lines 419–547.

### Multiple Actions in Single Message
- **Schema limitation**: The schema supports only **one** `action` and **one** set of `fields`.
- **Observed behavior on dual actions**:
  - *"Spent 250 on lunch and sent 500 to Pooja"*: The LLM reasoning acknowledges both actions, but its single `fields` object extracts ONLY `amount: 250, category: "Food", description: "lunch"`. The second action (`sent 500 to Pooja`) is **completely dropped and lost**.
  - *"Spent 250 on lunch and 80 on auto"*: The LLM adds both numbers ($250 + 80 = 330$), categorizes as `"Other"`, flags `confidence: "low"`, and sets `missing_fields: ["category"]`. The request is routed to Tier 4 Clarification and neither transaction is recorded.

---

## 4. Matcher and Disambiguation

### Full Contents of `backend/app/services/matcher.py`
Verbatim quote of the entire file:
```python
1: """
2: Transaction matcher service for edit/delete/query routing.
3: 
4: Matches database transactions against extracted intent criteria for a specific authenticated user.
5: Guarantees per-user data isolation via explicit WHERE user_id = :verified_user_id filtering.
6: """
7: 
8: import uuid
9: from datetime import datetime, date
10: from typing import List, Optional
11: from sqlalchemy.orm import Session
12: from sqlalchemy import func
13: 
14: from app.models.transaction import Transaction
15: from app.models.category import Category
16: from app.models.contact import Contact
17: from app.schemas.intent import IntentFields
18: 
19: 
20: def match_transactions(
21:     db: Session,
22:     user_id: uuid.UUID,
23:     fields: IntentFields,
24:     limit: int = 50,
25:     reasoning: Optional[str] = None,
26: ) -> List[Transaction]:
27:     """
28:     Search transactions belonging strictly to `user_id` matching criteria in `fields`.
29:     """
30:     query = (
31:         db.query(Transaction)
32:         .join(Category, Transaction.category_id == Category.id)
33:         .filter(Transaction.user_id == user_id)
34:     )
35: 
36:     if fields.contact_name:
37:         query = query.join(Contact, Transaction.contact_id == Contact.id).filter(
38:             func.lower(Contact.name) == fields.contact_name.lower().strip()
39:         )
40: 
41:     if fields.category:
42:         query = query.filter(func.lower(Category.name) == fields.category.lower().strip())
43: 
44:     reasoning_lower = (reasoning or "").lower()
45:     is_month_query = any(w in reasoning_lower for w in ["month", "മാസം", "current month", "this month"])
46: 
47:     if fields.date:
48:         date_str = fields.date.strip()
49:         try:
50:             if is_month_query:
51:                 # If reasoning indicates a monthly query, extract year & month
52:                 parsed_d = datetime.strptime(date_str[:7], "%Y-%m").date()
53:                 query = query.filter(
54:                     func.extract("year", Transaction.txn_date) == parsed_d.year,
55:                     func.extract("month", Transaction.txn_date) == parsed_d.month,
56:                 )
57:             elif len(date_str) == 7:
58:                 # Year-Month query (e.g. 2026-10)
59:                 year, month = map(int, date_str.split("-"))
60:                 query = query.filter(
61:                     func.extract("year", Transaction.txn_date) == year,
62:                     func.extract("month", Transaction.txn_date) == month,
63:                 )
64:             elif len(date_str) == 10:
65:                 parsed_d = datetime.strptime(date_str, "%Y-%m-%d").date()
66:                 query = query.filter(Transaction.txn_date == parsed_d)
67:         except (ValueError, TypeError):
68:             pass
69:     elif is_month_query:
70:         # Default to current month if reasoning asks for this month but date was omitted
71:         today = date.today()
72:         query = query.filter(
73:             func.extract("year", Transaction.txn_date) == today.year,
74:             func.extract("month", Transaction.txn_date) == today.month,
75:         )
76: 
77:     if fields.description:
78:         desc_clean = fields.description.strip()
79:         query = query.filter(Transaction.description.ilike(f"%{desc_clean}%"))
80: 
81:     return query.order_by(Transaction.txn_date.desc(), Transaction.created_at.desc()).limit(limit).all()
```

### Entity & Relative Resolution Analysis
- **"last" / "latest" / "previous"**: NOT resolved by the matcher. `matcher.py` executes `.order_by(Transaction.txn_date.desc(), Transaction.created_at.desc()).limit(50)` and returns up to 50 items. It does not select the single latest item.
- **Ordinals ("first one", "second")**: NOT supported in backend. No logic exists to map ordinal words to indices.
- **Amount**: Completely **ignored** in `matcher.py`. Even if `fields.amount` is extracted, `matcher.py` never filters on `Transaction.amount`.
- **Date & relative dates**: Only resolves `fields.date` if the LLM converted it to ISO `YYYY-MM-DD` or `YYYY-MM`. If the LLM misses it, only substring checking on `reasoning` for `"month"` or `"മാസം"` runs.
- **Category**: Filtered via `func.lower(Category.name) == fields.category.lower().strip()`.
- **Contact Name**: Joined against `Contact` table via `func.lower(Contact.name) == fields.contact_name.lower().strip()`.
- **Direction**: Ignored in matcher.
- **Pronouns ("it", "that one")**: NOT resolved. Matcher receives `None` for all fields, causing 50 broad transactions or 0 matches to be returned.

### Ambiguity & Candidate Construction
- In `backend/app/routers/intent.py` lines 164–168:
  - If `len(matched) == 1`: `intent.requires_confirmation = True`. Routes to Tier 2 `ASK_CONFIRMATION`.
  - If `len(matched) > 1`: `intent.requires_confirmation = False`. Routes to Tier 3 `ASK_DISAMBIGUATION`.
- Disambiguation list payload constructed in `intent.py` lines 389–403:
  - Fetches and serializes matching transactions into `response.candidates = [ {...}, {...} ]`.

### Confirmation & Disambiguation State Management
- **Storage**: State is **client-side only** in React component state:
  - `ConversationLog.js` line 81: `const [pendingConfirmation, setPendingConfirmation] = useState(null);`
  - Neither server memory nor database stores pending confirmation sessions.
- **Routing of user confirmation responses**:
  - `ConversationLog.js` line 183:
    ```javascript
    if (pendingConfirmation && ['yes', 'confirm', 'sure', 'ok', 'aam'].includes(text.toLowerCase())) {
      await handleConfirmAction(pendingConfirmation);
      return;
    }
    ```
- **Handling of Unrelated Responses**:
  - If a question is pending and user inputs anything other than `['yes', 'confirm', 'sure', 'ok', 'aam']`, the check evaluates to `false`. The user input is treated as a brand new command, leaving the previous pending confirmation unhandled and abandoned.

---

## 5. Executors and Queries

### Action Handlers & Verbatim ORM Queries

#### 1. Add Transaction (`POST /intent/route` when `action == "add"`)
From `backend/app/routers/intent.py` lines 277–289:
```python
277:             new_txn = Transaction(
278:                 user_id=current_user_id,
279:                 type=txn_type,
280:                 amount=txn_amount,
281:                 category_id=category.id,
282:                 contact_id=contact_id,
283:                 description=intent.fields.description,
284:                 txn_date=txn_date,
285:             )
286:             db.add(new_txn)
287:             db.commit()
288:             db.refresh(new_txn)
```

#### 2. Query Contact Balance & Transactions
From `backend/app/routers/intent.py` lines 302–314:
```python
302:                     contact_txns = (
303:                         db.query(Transaction)
304:                         .filter(
305:                             Transaction.user_id == current_user_id,
306:                             Transaction.contact_id == contact.id,
307:                         )
308:                         .order_by(Transaction.txn_date.desc(), Transaction.created_at.desc())
309:                         .all()
310:                     )
311: 
312:                     total_sent = sum((t.amount for t in contact_txns if t.type == "expense"), Decimal("0.00"))
313:                     total_received = sum((t.amount for t in contact_txns if t.type == "income"), Decimal("0.00"))
314:                     net_balance = total_sent - total_received
```

#### 3. General Query (Category / Period)
From `backend/app/routers/intent.py` lines 355–358:
```python
355:                 matched_txns = match_transactions(db, current_user_id, intent.fields, limit=50, reasoning=intent.reasoning)
356:                 total_expense = sum((t.amount for t in matched_txns if t.type == "expense"), Decimal("0.00"))
357:                 total_income = sum((t.amount for t in matched_txns if t.type == "income"), Decimal("0.00"))
```

#### 4. Confirmed Edit (`POST /intent/confirm`)
From `backend/app/routers/intent.py` lines 517–537:
```python
517:     elif payload.action == "edit":
518:         if payload.fields:
519:             if payload.fields.amount is not None:
520:                 txn.amount = Decimal(str(payload.fields.amount))
521:             if payload.fields.description is not None:
522:                 txn.description = payload.fields.description
523:             if payload.fields.date:
524:                 try:
525:                     txn.txn_date = datetime.strptime(payload.fields.date[:10], "%Y-%m-%d").date()
526:                 except (ValueError, TypeError):
527:                     pass
528:             if payload.fields.category:
529:                 cat = db.query(Category).filter(
530:                     func.lower(Category.name) == payload.fields.category.lower().strip()
531:                 ).first()
532:                 if cat:
533:                     txn.category_id = cat.id
534: 
535:         db.commit()
536:         db.refresh(txn)
```

#### 5. Confirmed Delete (`POST /intent/confirm`)
From `backend/app/routers/intent.py` lines 507–511:
```python
507:     if payload.action == "delete":
508:         deleted_data = _format_transaction_dict(txn)
509:         db.delete(txn)
510:         db.commit()
```

### Exact Path Taken for "Who owes me money"
1. **LLM Output**: Generates `action="query"`, `category="People"`, `contact_name=null`.
2. **Path in `intent.py`**:
   - `intent.fields.contact_name` is `None` (line 296 evaluates false).
   - Execution branches to `else` block (line 354).
   - Calls `match_transactions(db, current_user_id, intent.fields, limit=50)` where `category == "People"`.
   - Sums all transactions linked to category "People":
     ```python
     total_expense = sum((t.amount for t in matched_txns if t.type == "expense"), Decimal("0.00"))
     total_income = sum((t.amount for t in matched_txns if t.type == "income"), Decimal("0.00"))
     ```
   - Returns generic dictionary: `{"status": "queried", "category": "People", "total_expense": 2400.0, "total_income": 0.0, "count": 5, "transactions": [...]}`.
3. **Why it fails**:
   - It **never computes per-contact balances** or checks who has a net balance greater than zero.
   - It outputs total expense across the People category instead of listing indebted contacts.
   - Spoken response returns `"Fetching your data. Details are displayed below."`.

### Per-Contact Net Balance Logic
Lives in `backend/app/routers/summary.py` lines 293–325:
```python
293: def _compute_contact_balance(contact: Contact, txns: List[Transaction]) -> ContactSummaryItem:
294:     total_sent = Decimal("0.00")      # expense
295:     total_received = Decimal("0.00")  # income
296: 
297:     for txn in txns:
298:         if txn.type == "expense":
299:             total_sent += txn.amount
300:         elif txn.type == "income":
301:             total_received += txn.amount
302: 
303:     net_balance = total_sent - total_received
304: 
305:     if net_balance > Decimal("0.00"):
306:         net_status = "owes_you"
307:         display_text = f"{contact.name} owes you ₹{net_balance:.2f}"
308:     elif net_balance < Decimal("0.00"):
309:         net_status = "you_owe"
310:         display_text = f"You owe {contact.name} ₹{abs(net_balance):.2f}"
311:     else:
312:         net_status = "settled"
313:         display_text = f"Settled up with {contact.name} (₹0.00)"
```

### Undo Architecture
From `backend/app/services/undo.py` lines 20–40 & 50–99:
- Backed by PostgreSQL table `undo_actions` (`id SERIAL PRIMARY KEY`, `user_id UUID`, `action_type TEXT`, `transaction_id UUID`, `previous_state TEXT JSON`, `created_at TIMESTAMPTZ`).
- Non-destructive execution:
  - If `action_type == "edit"`: Deserializes `previous_state` JSON and restores original fields.
  - If `action_type == "delete"`: Recreates deleted transaction with original UUID.
  - If `action_type == "add"`: Deletes the created transaction.
  - Fallback: Deletes the newest transaction by `created_at`.

---

## 6. Context Given to the LLM

### Passed Context
From `backend/app/llm/client.py` lines 96–97 & 195–198:
- Static System Prompt (with injected current ISO date in IST via `_inject_today_date`).
- User input string.

### Missing Context (NOT Passed)
- **Today's Weekday**: NOT passed (e.g., whether today is Monday, Friday).
- **User Timezone**: NOT passed (hardcoded IST reference in prompt text).
- **Known Contacts**: NOT passed (the LLM has zero knowledge of user's contact book).
- **Categories**: Static list in prompt text; active database category IDs are NOT passed.
- **Previous Conversation Turns**: NOT passed (calls are 100% stateless).
- **Last Referenced / Created Transaction**: NOT passed.
- **User Preferred Language**: NOT passed (the model must infer language on each turn).

### State Storage Location
- Conversation history is saved to PostgreSQL table `chat_messages`, but **never fetched or injected** into the LLM prompt.
- "Last transaction" state is not tracked in session memory or conversation context.

---

## 7. Data Model

### Database Tables & Schema

#### 1. `profiles`
- `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `name TEXT NOT NULL`
- `preferred_language TEXT NOT NULL DEFAULT 'en'`
- `created_at TIMESTAMPTZ DEFAULT now()`
- RLS Policy: `USING (id = auth.uid()) WITH CHECK (id = auth.uid())`

#### 2. `contacts`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`
- `name TEXT NOT NULL`
- `created_at TIMESTAMPTZ DEFAULT now()`
- RLS Policy: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`

#### 3. `categories`
- `id SERIAL PRIMARY KEY`
- `name TEXT UNIQUE NOT NULL`
- `type TEXT NOT NULL` ('expense' | 'income')

#### 4. `transactions`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`
- `type TEXT NOT NULL` ('expense' | 'income')
- `amount NUMERIC(12,2) NOT NULL`
- `category_id INTEGER NOT NULL REFERENCES categories(id)`
- `contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL`
- `description TEXT`
- `txn_date DATE NOT NULL`
- `created_at TIMESTAMPTZ DEFAULT now()`
- RLS Policy: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`

#### 5. `undo_actions`
- `id SERIAL PRIMARY KEY`
- `user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`
- `action_type TEXT NOT NULL` ('add' | 'edit' | 'delete')
- `transaction_id UUID NOT NULL`
- `previous_state TEXT` (JSON snapshot)
- `created_at TIMESTAMPTZ DEFAULT now()`
- RLS Policy: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`

#### 6. `chat_messages`
- `id SERIAL PRIMARY KEY`
- `user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`
- `role TEXT NOT NULL` ('user' | 'assistant')
- `text TEXT NOT NULL`
- `payload TEXT` (JSON snapshot)
- `created_at TIMESTAMPTZ DEFAULT now()`
- RLS Policy: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`

### Representation of People Transactions
- `category_id` references the `People` category (ID 8 or 7 depending on sequence).
- `contact_id` links to the contact's UUID.
- Direction semantics:
  - `type == "expense"`: User sent money / lent money to contact (contact owes user).
  - `type == "income"`: User received money / contact paid user back (user owes contact).
  - Amount is always positive (`NUMERIC(12, 2)`).

### Category List
Fixed set of 8 categories defined in `PROJECT_SPEC.md §4` and seeded in `backend/app/services/category_seed.py` lines 14–23:
1. `Food` (`expense`)
2. `Transport` (`expense`)
3. `Shopping` (`expense`)
4. `Bills` (`expense`)
5. `Entertainment` (`expense`)
6. `Salary` (`income`)
7. `Other` (`expense`)
8. `People` (`expense`)

### Contact Name Matching
From `backend/app/services/contact_matcher.py` lines 46–60:
- Case matching: Lowercase exact (`c_lower == clean_lower`).
- Substring matching: `clean_lower in words_in_contact or clean_lower in c_lower or c_lower in clean_lower`.
- Fuzzy matching: Python standard library `difflib.SequenceMatcher(None, clean_lower, c_lower).ratio() >= 0.65`.
- Script/transliteration: **No transliteration or cross-script matching exists**. "Pooja" and "പൂജ" are treated as two distinct, unrelated contacts.

---

## 8. Language Handling

### Speech-to-Text (STT)
- **Provider & Model**: Sarvam Saaras v3 (`saaras:v3`).
- **Endpoint**: `https://api.sarvam.ai/speech-to-text` (`backend/app/stt/client.py:34`).
- **Language configuration**: Sent with `language_code="unknown"` allowing Saaras to auto-detect language.

### Transliteration & Normalization
- There is **no transliteration or script normalization layer** in the backend.
- Malayalam unicode and Latin/Manglish strings pass directly into the LLM.

### Number & Unit Conversion
- Handled solely by LLM few-shot instructions:
  - English shorthand ("2k" -> 2000).
  - Spoken Malayalam numbers ("അഞ്ഞൂറ്" -> 500, "ആയിരം" -> 1000).
  - Lakhs/Crores conversion relies entirely on LLM world knowledge.

---

## 9. Response Generation

### Code Implementation
From `backend/app/llm/response_generator.py` lines 20–103:
```python
20: def generate_spoken_response(
21:     decision: str,
22:     action: str,
23:     language: str = "en",
24:     fields: Optional[Dict[str, Any]] = None,
25:     execution_result: Optional[Dict[str, Any]] = None,
26:     matched_count: int = 0,
27:     target_transaction: Optional[Dict[str, Any]] = None,
28:     reasoning: Optional[str] = None,
29: ) -> str:
...
50:     if decision == "EXECUTE":
51:         if action == "add":
52:             if lang == "ml":
53:                 return f"{category} ഇനത്തിൽ {formatted_amount} വിജയകരമായി ചേർത്തു."
54:             elif lang == "mixed":
55:                 return f"{category}-ലേക്ക് {formatted_amount} add ചെയ്തിട്ടുണ്ട്."
56:             else:
57:                 return f"Added {category} transaction for {formatted_amount}."
58:         elif action == "query":
59:             if lang == "ml":
60:                 return "വിവരങ്ങൾ ശേഖരിക്കുന്നു. വിശദാംശങ്ങൾ ചാറ്റിൽ കാണാം."
61:             elif lang == "mixed":
62:                 return "Data fetch ചെയ്യുന്നുണ്ട്. Details chat-il kaanam."
63:             else:
64:                 return "Fetching your data. Details are displayed below."
```

### Why It Produces the Wrong Shape
- **Hardcoded template bypasses LLM**: `backend/app/llm/response_prompt.md` exists, but `generate_spoken_response` **never calls the LLM**.
- **Data blindness**: When responding to queries, line 64 returns `"Fetching your data. Details are displayed below."`. It never surfaces the answer to the user's specific question (such as balance numbers or who owes money).

---

## 10. Tests and Evaluation

### Test Inventory
The backend contains **171 total tests** across 19 suites:
- `test_intent_live.py`: **17 tests (LIVE)**. Calls real Sarvam API (`sarvam-105b`).
- `test_intent_parsing.py`: **39 tests (MOCKED)**. Tests HTTP client with mocked JSON outputs.
- `test_intent_regression.py`: **7 tests (MOCKED)**. Tests edge case inputs from earlier bug fixes.
- `test_intent_schema.py`: **22 tests (UNIT)**. Tests Pydantic validators and schema constraints.
- `test_routing.py`: **10 tests (UNIT)**. Tests 4-tier routing matrix with synthetic intent objects.
- `test_confirmation_integration.py`: **7 tests (INTEGRATION - in-memory SQLite)**.
- `test_contact_disambiguation.py`: **2 tests (INTEGRATION - in-memory SQLite)**.
- `test_people.py`: **6 tests (INTEGRATION)**.
- `test_transactions.py`: **9 tests (INTEGRATION)**.
- `test_tts.py`: **13 tests (MOCKED & UNIT)**.
- `test_stt.py`: **7 tests (MOCKED)**.
- Other suites (`test_auth.py`, `test_chat.py`, `test_health.py`, `test_isolation.py`, `test_models.py`, `test_period_analytics.py`, `test_schema.py`, `test_summary.py`): **32 tests**.

### Evaluation Datasets & Accuracy Measurement
- **No evaluation dataset exists** in the repository.
- **No benchmark or accuracy scoring script exists**. Testing relies exclusively on unit assertions against targeted mock/live examples.

---

## 11. Live Trace of Real Failures

The following 7 test queries were executed against the live pipeline (`SarvamLLMClient`, `sarvam-105b`, and PostgreSQL database instance for user `fae48b6e-e7dd-4504-a1f7-12dab405ea1f`):

```
================================================================================
Test 1: "Delete the last transaction to Pooja"
================================================================================
[Raw LLM Output]:
```json
{
  "reasoning": "User wants to remove/delete the most recently recorded transaction involving Pooja.",
  "action": "delete",
  "language": "en",
  "fields": {
    "amount": null,
    "category": "People",
    "date": null,
    "description": "last transaction to Pooja",
    "contact_name": "Pooja"
  },
  "matched_transactions": [],
  "confidence": "high",
  "requires_confirmation": true,
  "missing_fields": []
}
```

[Parsed Intent Object]:
{
  "reasoning": "User wants to remove/delete the most recently recorded transaction involving Pooja.",
  "action": "delete",
  "language": "en",
  "fields": {
    "amount": null,
    "category": "People",
    "date": null,
    "description": "last transaction to Pooja",
    "contact_name": "Pooja",
    "type": null
  },
  "matched_transactions": [],
  "confidence": "high",
  "requires_confirmation": true,
  "missing_fields": []
}

[Matcher Input]:
{"fields": {"amount": null, "category": "People", "date": null, "description": "last transaction to Pooja", "contact_name": "Pooja", "type": null}, "reasoning": "User wants to remove/delete the most recently recorded transaction involving Pooja."}

[Matcher Output]:
[] (0 matches found)

[Executed Query]:
SELECT transactions.* FROM transactions JOIN categories ON transactions.category_id = categories.id JOIN contacts ON transactions.contact_id = contacts.id WHERE transactions.user_id = :user_id AND lower(contacts.name) = 'pooja' AND lower(categories.name) = 'people' AND transactions.description ILIKE '%last transaction to pooja%' ORDER BY transactions.txn_date DESC, transactions.created_at DESC LIMIT 50;

[Final Response]:
{
  "decision": "ASK_CLARIFICATION",
  "action": "delete",
  "confidence": "high",
  "matched_transactions": [],
  "missing_fields": ["transaction_match"],
  "clarification_prompt": "No matching transaction found. Please provide more details.",
  "spoken_response": "Please specify the amount or category for this transaction."
}

[Failure Diagnosis]:
Fails at the LLM & Matcher layers. The LLM copied the directive "last transaction to Pooja" into `fields.description`, causing the SQL matcher to query for literal description `ILIKE '%last transaction to pooja%'`, yielding 0 matches and triggering clarification.

================================================================================
Test 2: "Delete my last food transaction"
================================================================================
[Raw LLM Output]:
{
  "reasoning": "User wants to remove/delete their most recently recorded food expense transaction.",
  "action": "delete",
  "language": "en",
  "fields": {
    "amount": null,
    "category": "Food",
    "date": null,
    "description": null,
    "contact_name": null
  },
  "matched_transactions": [],
  "confidence": "high",
  "requires_confirmation": true,
  "missing_fields": []
}

[Parsed Intent Object]:
{
  "reasoning": "User wants to remove/delete their most recently recorded food expense transaction.",
  "action": "delete",
  "language": "en",
  "fields": {"amount": null, "category": "Food", "date": null, "description": null, "contact_name": null, "type": null},
  "matched_transactions": [],
  "confidence": "high",
  "requires_confirmation": true,
  "missing_fields": []
}

[Matcher Input]:
{"fields": {"amount": null, "category": "Food", "date": null, "description": null, "contact_name": null, "type": null}, "reasoning": "User wants to remove/delete their most recently recorded food expense transaction."}

[Matcher Output]:
[20 matched transactions returned]

[Executed Query]:
SELECT transactions.* FROM transactions JOIN categories ON transactions.category_id = categories.id WHERE transactions.user_id = :user_id AND lower(categories.name) = 'food' ORDER BY transactions.txn_date DESC, transactions.created_at DESC LIMIT 50;

[Final Response]:
{
  "decision": "ASK_DISAMBIGUATION",
  "action": "delete",
  "confidence": "high",
  "matched_transactions": ["6687e286-b5b1-43e0-89dc-1cce29dcfeb8", ... 19 more],
  "disambiguation_prompt": "Multiple transactions match your request (20 found). Please select which one to delete.",
  "spoken_response": "Multiple transactions match. Please select which one you want to delete.",
  "candidates": [ ... 20 candidates ... ]
}

[Failure Diagnosis]:
Fails at the Matcher & Router layers. The matcher has no logic to resolve "last" or limit to 1 result, so it returned all 20 past food transactions, causing the router to misroute to Tier 3 Disambiguation instead of selecting the single latest transaction.

================================================================================
Test 3: "Spent 250 on lunch and sent 500 to Pooja"
================================================================================
[Raw LLM Output]:
```json
{
  "reasoning": "User wants to record two separate financial events: a new lunch expense of 250 rupees and a new person-to-person transfer of 500 rupees to Pooja.",
  "action": "add",
  "language": "en",
  "fields": {
    "amount": 250,
    "category": "Food",
    "date": "2026-10-13",
    "description": "lunch",
    "contact_name": null
  },
  "matched_transactions": [],
  "confidence": "high",
  "requires_confirmation": false,
  "missing_fields": []
}
```

[Parsed Intent Object]:
{
  "reasoning": "User wants to record two separate financial events: a new lunch expense of 250 rupees and a new person-to-person transfer of 500 rupees to Pooja.",
  "action": "add",
  "language": "en",
  "fields": {"amount": 250, "category": "Food", "date": "2026-10-13", "description": "lunch", "contact_name": null, "type": null},
  "matched_transactions": [],
  "confidence": "high",
  "requires_confirmation": false,
  "missing_fields": []
}

[Matcher Input / Output]:
N/A (action=add)

[Executed Query]:
INSERT INTO transactions (user_id, type, amount, category_id, contact_id, description, txn_date) VALUES ('fae48b6e-e7dd-4504-a1f7-12dab405ea1f', 'expense', 250.00, 1, NULL, 'lunch', '2026-10-13');

[Final Response]:
{
  "decision": "EXECUTE",
  "action": "add",
  "confidence": "high",
  "spoken_response": "Added Food transaction for ₹250.",
  "execution_result": {"status": "created", "transaction": {"amount": 250.0, "category_name": "Food", "description": "lunch"}}
}

[Failure Diagnosis]:
Fails at the Intent Schema & Pipeline layers. The schema only allows a single action and transaction; the LLM dropped the entire second transaction ("sent 500 to Pooja"), leaving it unrecorded without notifying the user.

================================================================================
Test 4: "Spent 250 on lunch and 80 on auto"
================================================================================
[Raw LLM Output]:
```json
{
  "reasoning": "User wants to record two new expenses: 250 rupees for lunch and 80 rupees for auto.",
  "action": "add",
  "language": "en",
  "fields": {
    "amount": 330,
    "category": "Other",
    "date": "2026-10-13",
    "description": "lunch and auto",
    "contact_name": null
  },
  "matched_transactions": [],
  "confidence": "low",
  "requires_confirmation": false,
  "missing_fields": ["category"]
}
```

[Parsed Intent Object]:
{
  "reasoning": "User wants to record two new expenses: 250 rupees for lunch and 80 rupees for auto.",
  "action": "add",
  "language": "en",
  "fields": {"amount": 330, "category": "Other", "date": "2026-10-13", "description": "lunch and auto", "contact_name": null, "type": null},
  "matched_transactions": [],
  "confidence": "low",
  "requires_confirmation": false,
  "missing_fields": ["category"]
}

[Matcher Input / Output]:
N/A (action=add)

[Executed Query]:
None (Execution halted due to Tier 4 routing).

[Final Response]:
{
  "decision": "ASK_CLARIFICATION",
  "action": "add",
  "confidence": "low",
  "missing_fields": ["category"],
  "clarification_prompt": "Please specify category.",
  "spoken_response": "Please specify the amount or category for this transaction."
}

[Failure Diagnosis]:
Fails at the LLM & Schema layers. Unable to express two distinct transactions, the LLM summed the numbers (330) and flagged `missing_fields: ["category"]`, causing Tier 4 clarification to block execution completely.

================================================================================
Test 5: "Who owes me money"
================================================================================
[Raw LLM Output]:
{"reasoning": "User wants to check who owes them money, which is a balance/debt query without altering records.", "action": "query", "language": "en", "fields": {"amount": null, "category": "People", "date": null, "description": null, "contact_name": null}, "matched_transactions": [], "confidence": "high", "requires_confirmation": false, "missing_fields": []}

[Parsed Intent Object]:
{
  "reasoning": "User wants to check who owes them money, which is a balance/debt query without altering records.",
  "action": "query",
  "language": "en",
  "fields": {"amount": null, "category": "People", "date": null, "description": null, "contact_name": null, "type": null},
  "matched_transactions": [],
  "confidence": "high",
  "requires_confirmation": false,
  "missing_fields": []
}

[Matcher Input]:
{"fields": {"amount": null, "category": "People", "date": null, "description": null, "contact_name": null, "type": null}, "reasoning": "User wants to check who owes them money..."}

[Matcher Output]:
[5 transactions returned]

[Executed Query]:
SELECT transactions.* FROM transactions JOIN categories ON transactions.category_id = categories.id WHERE transactions.user_id = :user_id AND lower(categories.name) = 'people' ORDER BY transactions.txn_date DESC, transactions.created_at DESC LIMIT 50;

[Final Response]:
{
  "decision": "EXECUTE",
  "action": "query",
  "confidence": "high",
  "spoken_response": "Fetching your data. Details are displayed below.",
  "execution_result": {
    "status": "queried",
    "category": "People",
    "period": "Recent",
    "total_expense": 2400.0,
    "total_income": 0.0,
    "total_amount": 2400.0,
    "count": 5,
    "transactions": [ ... ]
  }
}

[Failure Diagnosis]:
Fails at the Router & Response layers. The router executed a generic category sum query rather than querying contacts with net positive balances, and the spoken response gave a static placeholder without identifying any debtor.

================================================================================
Test 6: "Change it to 300" (sent right after adding an expense)
================================================================================
[Raw LLM Output]:
{
  "reasoning": "User is correcting an existing transaction amount to 300, but the target transaction is not specified.",
  "action": "edit",
  "language": "en",
  "fields": {
    "amount": 300,
    "category": null,
    "date": null,
    "description": null,
    "contact_name": null
  },
  "matched_transactions": [],
  "confidence": "low",
  "requires_confirmation": true,
  "missing_fields": ["category", "description", "date", "contact_name"]
}

[Parsed Intent Object]:
{
  "reasoning": "User is correcting an existing transaction amount to 300, but the target transaction is not specified.",
  "action": "edit",
  "language": "en",
  "fields": {"amount": 300, "category": null, "date": null, "description": null, "contact_name": null, "type": null},
  "matched_transactions": [],
  "confidence": "low",
  "requires_confirmation": true,
  "missing_fields": ["category", "description", "date", "contact_name"]
}

[Matcher Input / Output]:
Matcher matched 35 transactions (all user transactions) because fields were null.

[Executed Query]:
SELECT transactions.* FROM transactions JOIN categories ON transactions.category_id = categories.id WHERE transactions.user_id = :user_id ORDER BY transactions.txn_date DESC, transactions.created_at DESC LIMIT 50;

[Final Response]:
{
  "decision": "ASK_CLARIFICATION",
  "action": "edit",
  "confidence": "low",
  "missing_fields": ["category", "description", "date", "contact_name"],
  "clarification_prompt": "Please specify category, description, date, contact_name.",
  "spoken_response": "Please specify the amount or category for this transaction."
}

[Failure Diagnosis]:
Fails at the Pipeline Context layer. The LLM receives zero conversational context or "last transaction" state, so it cannot resolve the pronoun "it" and is forced to emit `confidence: "low"` and request clarification.

================================================================================
Test 7: "innale food inte 600 ozhivakku"
================================================================================
[Raw LLM Output]:
```json
{
  "reasoning": "User wants to remove/delete the 600 rupee food expense recorded yesterday.",
  "action": "delete",
  "language": "mixed",
  "fields": {
    "amount": 600,
    "category": "Food",
    "date": "2026-10-12",
    "description": "food expense",
    "contact_name": null
  },
  "matched_transactions": [],
  "confidence": "high",
  "requires_confirmation": true,
  "missing_fields": []
}
```

[Parsed Intent Object]:
{
  "reasoning": "User wants to remove/delete the 600 rupee food expense recorded yesterday.",
  "action": "delete",
  "language": "mixed",
  "fields": {"amount": 600, "category": "Food", "date": "2026-10-12", "description": "food expense", "contact_name": null, "type": null},
  "matched_transactions": [],
  "confidence": "high",
  "requires_confirmation": true,
  "missing_fields": []
}

[Matcher Input]:
{"fields": {"amount": 600, "category": "Food", "date": "2026-10-12", "description": "food expense", "contact_name": null, "type": null}, "reasoning": "User wants to remove/delete the 600 rupee food expense recorded yesterday."}

[Matcher Output]:
[] (0 matches found)

[Executed Query]:
SELECT transactions.* FROM transactions JOIN categories ON transactions.category_id = categories.id WHERE transactions.user_id = :user_id AND lower(categories.name) = 'food' AND transactions.txn_date = '2026-10-12' AND transactions.description ILIKE '%food expense%' ORDER BY transactions.txn_date DESC, transactions.created_at DESC LIMIT 50;

[Final Response]:
{
  "decision": "ASK_CLARIFICATION",
  "action": "delete",
  "confidence": "high",
  "matched_transactions": [],
  "missing_fields": ["transaction_match"],
  "clarification_prompt": "No matching transaction found. Please provide more details.",
  "spoken_response": "Please amount or category വ്യക്തമാക്കുക."
}

[Failure Diagnosis]:
Fails at the LLM & Matcher layers. The LLM hallucinated a synthetic `description: "food expense"` instead of leaving description null, and the matcher strictly filtered on `description ILIKE '%food expense%'`, failing to match any transaction without that exact description.
```

---

## 12. Constraints and Environment

### Backend Runtime & Deployment
- **Python Version**: `3.12.0` (in `.venv`).
- **Framework**: FastAPI `0.111.0` on Uvicorn `0.30.1` (`app.main:app`).
- **Database**: PostgreSQL hosted on Supabase (`db.mvobtveaewxgiczulyrq.supabase.co:5432/postgres`) via SQLAlchemy `2.0.30` and `psycopg2-binary`.
- **Operating System**: macOS (local development host `Darwin 24.3.0`).

### Available LLM & Voice Services
- **LLM API Key**: `SARVAM_API_KEY` configured in `backend/.env`.
- **Model**: `sarvam-105b` hosted on Sarvam AI.
- **STT**: `saaras:v3` hosted on Sarvam AI.
- **TTS**: `bulbul:v3` hosted on Sarvam AI (`kavitha` speaker voice).
- **Local Models**: None installed or configured (all AI inference is cloud-based).

### Latency Budget & Voice Flow Constraints
- **Current Pipeline Latency**:
  - Audio STT transcription: ~800ms – 1.2s
  - Intent LLM parse: ~1.5s – 2.5s
  - DB match & execution: ~50ms – 150ms
  - Audio TTS synthesis: ~700ms – 1.1s
  - **Total Round-Trip Time**: **~3.2s – 5.0s**.
- **Constraint on adding a second LLM call**: Introducing a second LLM call (e.g. for conversational response generation or secondary disambiguation) would push latency above 5–7 seconds, violating voice assistant interactivity expectations.

### Code Comments & Architectural Quirks
- `backend/app/llm/intent_prompt.md` lines 2–4:
  ```markdown
  CRITICAL ARCHITECTURAL PRINCIPLE:
  Intent action classification MUST NEVER depend on keyword/regex matching against user input text.
  Classification is the LLM's responsibility, assisted only by prompt design...
  ```
- `backend/app/routers/intent.py` lines 268–269 (contradicts principle above):
  ```python
  if any(w in desc for w in ["receive", "got back", "paid back", "returned", "thannu", "income"]):
      txn_type = "income"
  ```
- `backend/app/llm/client.py` lines 107–113:
  ```python
  # Explicitly disable thinking/reasoning for structured JSON extraction calls
  "reasoning_effort": None,  # Serializes to `"reasoning_effort": null` in JSON
  ```
- `backend/app/llm/response_generator.py` lines 9–17:
  ```python
  RESPONSE_PROMPT_PATH = os.path.join(
      os.path.dirname(os.path.abspath(__file__)), "response_prompt.md"
  )
  def load_response_prompt() -> str:
      """Load the versioned response prompt markdown template."""
      ...
  ```
  *Quirk: `load_response_prompt()` is defined but never called anywhere in the codebase.*

---

## Observed Weaknesses

- **LLM hallucinated descriptions breaking matcher queries**: The LLM frequently populates `fields.description` with synthetic summaries (e.g., `"food expense"`, `"last transaction to Pooja"`) which are then strictly queried via `ILIKE` in [backend/app/services/matcher.py](file:///Users/sangeethps/pappu/backend/app/services/matcher.py#L77-L79), causing zero matches and unwarranted clarification prompts.
- **Matcher completely ignores amounts**: In [backend/app/services/matcher.py](file:///Users/sangeethps/pappu/backend/app/services/matcher.py#L30-L81), `fields.amount` is completely ignored during transaction matching, making it impossible to disambiguate by amount (e.g. "delete the 500 one").
- **Matcher lacks ordinal and recency operators**: In [backend/app/services/matcher.py](file:///Users/sangeethps/pappu/backend/app/services/matcher.py#L81), the query returns up to 50 transactions without filtering for "last" or "first", causing queries like "Delete my last food transaction" to trigger 20-candidate disambiguation sheets.
- **Single-intent architectural bottleneck**: The `IntentObject` schema in [backend/app/schemas/intent.py](file:///Users/sangeethps/pappu/backend/app/schemas/intent.py#L47-L60) only permits one action and one set of fields. Multi-action utterances like "Spent 250 on lunch and sent 500 to Pooja" result in the second action being silently dropped.
- **Zero conversational memory passed to LLM**: [backend/app/llm/client.py](file:///Users/sangeethps/pappu/backend/app/llm/client.py#L195-L198) only sends the system prompt and current user utterance. Turn-to-turn context, pronouns ("Change it to 300"), and recently touched transactions are completely inaccessible to the model.
- **Missing person balance conversational executor**: In [backend/app/routers/intent.py](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L354-L370), when `contact_name` is null in a People query (e.g., "Who owes me money"), the system aggregates transactions as generic expenses rather than invoking `_compute_contact_balance` from [backend/app/routers/summary.py](file:///Users/sangeethps/pappu/backend/app/routers/summary.py#L293-L325).
- **Stateless confirmation routing in client memory**: Pending confirmation state is held exclusively in React state in [frontend/src/components/ConversationLog.js](file:///Users/sangeethps/pappu/frontend/src/components/ConversationLog.js#L81), and affirmative responses are checked against a hardcoded list of strings (`['yes', 'confirm', 'sure', 'ok', 'aam']`) at line 183. Any intervening or natural response loses the pending confirmation.
- **Dead prompt and static spoken responses**: The response generator prompt [backend/app/llm/response_prompt.md](file:///Users/sangeethps/pappu/backend/app/llm/response_prompt.md) is never loaded or sent to an LLM; [backend/app/llm/response_generator.py](file:///Users/sangeethps/pappu/backend/app/llm/response_generator.py#L50-L103) uses rigid hardcoded strings that say "Fetching your data. Details are displayed below" instead of answering the query.
- **Cross-script contact isolation**: In [backend/app/services/contact_matcher.py](file:///Users/sangeethps/pappu/backend/app/services/contact_matcher.py#L14-L63), matching is purely string/fuzzy-based with no Malayalam-English transliteration, causing English ("Pooja") and Malayalam ("പൂജ") contacts to be treated as completely separate entities.
- **Hardcoded keyword direction override**: In [backend/app/routers/intent.py](file:///Users/sangeethps/pappu/backend/app/routers/intent.py#L267-L270), transaction type direction is determined by an arbitrary substring check (`["receive", "got back", "paid back", "returned", "thannu", "income"]`), violating the core architectural constraint against keyword overrides.
