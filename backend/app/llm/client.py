"""
Sarvam AI LLM client for intent parsing.

Uses the sarvam-105b model via the OpenAI-compatible Chat Completions API.
Auth is via the api-subscription-key header.
"""

import json
import logging
import re
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
    Handles cases where the LLM wraps JSON in markdown code fences.
    """
    text = text.strip()

    # Try to extract from markdown code fence
    code_block_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if code_block_match:
        return code_block_match.group(1).strip()

    # If it looks like raw JSON, return as-is
    if text.startswith("{"):
        return text

    # Try to find a JSON object anywhere in the text
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        return brace_match.group(0)

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

    def _make_request(self, messages: list[dict]) -> str:
        """
        Make a synchronous request to the Sarvam Chat Completions API.
        Returns the raw text content from the assistant's response.
        """
        headers = {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.1,  # Low temperature for deterministic structured output
        }

        with httpx.Client(timeout=30.0) as client:
            response = client.post(self.api_url, json=payload, headers=headers)
            response.raise_for_status()

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        # Handle None content (can happen if model returns empty response)
        return content if content is not None else ""

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
            logger.debug(
                "LLM response (attempt %d): %s", attempt + 1,
                raw_response[:500] if raw_response else "(empty)"
            )

            extracted_json = _extract_json_from_response(raw_response)

            try:
                intent = parse_and_validate_intent(extracted_json)
                return intent
            except IntentValidationError as e:
                last_error = e
                logger.warning(
                    "Intent validation failed (attempt %d): %s", attempt + 1, e
                )

                if attempt < max_retries:
                    # Ask the LLM to fix its output
                    messages.append({"role": "assistant", "content": raw_response})
                    messages.append(
                        {
                            "role": "user",
                            "content": (
                                f"Your previous output was invalid: {e}. "
                                "Please output ONLY a valid JSON object matching "
                                "the schema. No explanation, no markdown."
                            ),
                        }
                    )

        raise IntentValidationError(
            f"Failed to get valid intent after {1 + max_retries} attempts. "
            f"Last error: {last_error}"
        )
