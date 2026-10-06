"""
Sarvam AI LLM client for intent parsing.

Uses the sarvam-105b model via the OpenAI-compatible Chat Completions API.
Auth is via the api-subscription-key header.
"""

import json
import logging
import re
import time
from pathlib import Path
from datetime import date

import httpx

from app.config import SARVAM_API_KEY, SARVAM_MODEL, SARVAM_API_URL
from app.schemas.intent import (
    IntentObject,
    IntentValidationError,
    parse_and_validate_intent,
)

logger = logging.getLogger(__name__)

# Load the prompt template once at module level
_PROMPT_TEMPLATE_PATH = Path(__file__).parent / "intent_prompt.md"


def _load_prompt_template() -> str:
    """Load the versioned prompt template from file."""
    return _PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")


def _inject_today_date(prompt: str) -> str:
    """
    Replace date references in examples with actual today's date.
    The prompt uses hardcoded example dates — we inject today's date
    so the LLM knows the current date for "today"/"yesterday" resolution.
    """
    today = date.today().isoformat()
    # Prepend a date context line to the prompt
    date_context = f"\n\nCurrent date (IST): {today}\n"
    return prompt + date_context


def _extract_json_from_response(text: str) -> str:
    """
    Extract JSON from the LLM response text.
    Strips Markdown code fences (e.g. ```json ... ```) before JSON decoding.
    """
    text = (text or "").strip()
    if not text:
        return ""

    # 1. Try to extract from markdown code fence (```json ... ``` or ``` ... ```)
    code_block_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if code_block_match:
        return code_block_match.group(1).strip()

    # 2. If it starts and ends with braces, return directly
    if text.startswith("{") and text.endswith("}"):
        return text

    # 3. Try to find the outermost JSON object anywhere in the text
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        return brace_match.group(0).strip()

    return text


class SarvamLLMClient:
    """
    Client for the Sarvam AI Chat Completions API.

    Sends user text through the intent-parsing prompt and returns
    a validated IntentObject.
    """

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

    def _make_request(self, messages: list[dict], max_network_retries: int = 2) -> str:
        """
        Make a request to the Sarvam Chat Completions API with reasoning disabled.
        Returns the raw text content from response.choices[0].message.content.
        """
        headers = {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json",
        }
        # Explicitly disable thinking/reasoning for structured JSON extraction calls
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.1,  # Low temperature for deterministic structured output
            "max_tokens": 1024,   # Ensure completion budget is never truncated to 0
            "reasoning_effort": None,  # Serializes to `"reasoning_effort": null` in JSON
        }

        timeout = httpx.Timeout(45.0, connect=10.0)
        last_exception = None

        for attempt in range(1 + max_network_retries):
            try:
                with httpx.Client(timeout=timeout) as client:
                    response = client.post(self.api_url, json=payload, headers=headers)
                    response.raise_for_status()

                data = response.json()
                logger.debug("Sarvam LLM response payload: %s", data)

                choices = data.get("choices", [])
                if not choices:
                    logger.error("Sarvam LLM returned no choices in response. Full payload: %s", data)
                    return ""

                choice = choices[0]
                message = choice.get("message", {})
                content = message.get("content")

                if content is None or not str(content).strip():
                    logger.error(
                        "Sarvam LLM choice message.content was empty/null (attempt %d/%d). Full response structure: %s",
                        attempt + 1,
                        1 + max_network_retries,
                        data,
                    )
                    return ""

                return str(content).strip()

            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_exception = exc
                logger.warning(
                    "Sarvam LLM request timeout/connection error (attempt %d/%d): %s",
                    attempt + 1,
                    1 + max_network_retries,
                    exc,
                )
                if attempt < max_network_retries:
                    time.sleep(1.0 * (attempt + 1))
            except httpx.HTTPStatusError as exc:
                last_exception = exc
                status_code = exc.response.status_code
                logger.warning(
                    "Sarvam LLM HTTP error %d (attempt %d/%d): %s",
                    status_code,
                    attempt + 1,
                    1 + max_network_retries,
                    exc.response.text,
                )
                # Retry only on transient server errors or rate limits
                if status_code in (500, 502, 503, 504, 429) and attempt < max_network_retries:
                    time.sleep(1.5 * (attempt + 1))
                else:
                    raise

        raise last_exception or RuntimeError("Failed to communicate with Sarvam LLM service.")

    def parse_intent(self, user_text: str, max_retries: int = 1) -> IntentObject:
        """
        Parse user text into a validated IntentObject.

        Sends the text through the Sarvam LLM with the intent-parsing prompt,
        extracts JSON from the response, and validates against the schema.

        Args:
            user_text: The user's natural language input.
            max_retries: Number of retries on malformed JSON (default: 1).

        Returns:
            A validated IntentObject.

        Raises:
            IntentValidationError: If the LLM output cannot be parsed into
                a valid intent after all retries.
            httpx.HTTPStatusError: If the API request fails.
        """
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": user_text},
        ]

        last_error = None
        for attempt in range(1 + max_retries):
            raw_response = self._make_request(messages)

            if not raw_response:
                logger.warning(
                    "Attempt %d/%d: Received empty message.content from LLM for user text: %r",
                    attempt + 1,
                    1 + max_retries,
                    user_text,
                )

            extracted_json = _extract_json_from_response(raw_response)

            try:
                intent = parse_and_validate_intent(extracted_json)
                return intent
            except IntentValidationError as e:
                last_error = e
                logger.warning(
                    "Intent validation failed (attempt %d/%d): %s | Raw content was: %r",
                    attempt + 1,
                    1 + max_retries,
                    e,
                    raw_response,
                )

                if attempt < max_retries:
                    # Ask the LLM to fix its output
                    messages.append({"role": "assistant", "content": raw_response or ""})
                    messages.append(
                        {
                            "role": "user",
                            "content": (
                                f"Your previous output was invalid: {e}. "
                                "Please output ONLY a single valid JSON object matching "
                                "the schema. No explanation, no markdown."
                            ),
                        }
                    )

        raise IntentValidationError(
            f"Failed to get valid intent after {1 + max_retries} attempts. "
            f"Last error: {last_error}"
        )
