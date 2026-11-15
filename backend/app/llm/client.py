"""
Sarvam AI LLM client.

Callers (the assistant planner, the bill split planner, the bill extractor) build their
own messages from a versioned prompt file and call `_make_request`.

Uses the sarvam-105b model via the OpenAI-compatible Chat Completions API.
Auth is via the api-subscription-key header.
"""

import logging
import re
import time

import httpx

from app.config import SARVAM_API_KEY, SARVAM_MODEL, SARVAM_API_URL
from app.http_client import post as http_post

logger = logging.getLogger(__name__)

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

    Sends chat messages and returns the model's text answer.
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

    def _make_request(
        self, messages: list[dict], max_network_retries: int = 2, max_tokens: int = 1024
    ) -> str:
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
            "max_tokens": max_tokens,   # Ensure completion budget is never truncated to 0
            "reasoning_effort": None,  # Serializes to `"reasoning_effort": null` in JSON
        }

        timeout = httpx.Timeout(45.0, connect=10.0)
        last_exception = None

        for attempt in range(1 + max_network_retries):
            try:
                response = http_post(self.api_url, timeout=timeout, json=payload, headers=headers)
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
