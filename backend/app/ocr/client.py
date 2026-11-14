"""
Sarvam Document AI client for reading a bill photo (PROJECT_SPEC.md §2, §5b Bill Split).

Document AI is job based: submit the image, poll the job, download a ZIP that holds the
page as Markdown. This client does those three steps and returns the Markdown text.
The image is held in memory only; nothing is written to disk.

API reference: https://docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/how-to/parse
"""

import io
import logging
import time
import zipfile
from typing import Callable, Optional

import httpx

from app.config import SARVAM_API_KEY, SARVAM_DOC_AI_URL

logger = logging.getLogger(__name__)

TERMINAL_STATES = {"completed", "partially_completed", "failed", "rejected"}
READABLE_STATES = {"completed", "partially_completed"}


class OcrError(Exception):
    """Reading the image failed. `code` is `unreadable` (bad image) or `ocr_unavailable` (service)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class SarvamDocAIClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        poll_interval: float = 1.5,
        max_wait: float = 60.0,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.api_key = api_key or SARVAM_API_KEY
        self.base_url = (base_url or SARVAM_DOC_AI_URL).rstrip("/")
        self.poll_interval = poll_interval
        self.max_wait = max_wait
        self._sleep = sleep

    def _headers(self) -> dict:
        return {"api-subscription-key": self.api_key or ""}

    def read_image(self, image: bytes, filename: str, content_type: str, language: str = "en-IN") -> str:
        """Returns the page as Markdown text. Raises OcrError."""
        timeout = httpx.Timeout(30.0, connect=10.0)
        try:
            with httpx.Client(timeout=timeout) as client:
                job_id = self._submit(client, image, filename, content_type, language)
                self._wait(client, job_id)
                return self._download(client, job_id)
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            logger.warning("Sarvam Document AI HTTP %s: %s", status, exc.response.text[:300])
            if status in (400, 413, 422):
                raise OcrError("unreadable", "That image could not be read.") from exc
            raise OcrError("ocr_unavailable", "Bill reading is not available right now.") from exc
        except httpx.HTTPError as exc:
            logger.warning("Sarvam Document AI request failed: %s", exc)
            raise OcrError("ocr_unavailable", "Bill reading is not available right now.") from exc

    def _submit(self, client: httpx.Client, image: bytes, filename: str, content_type: str, language: str) -> str:
        response = client.post(
            f"{self.base_url}/job/parse",
            headers=self._headers(),
            files={"file": (filename, image, content_type)},
            data={"language": language, "output_format": "md"},
        )
        response.raise_for_status()
        job_id = response.json().get("job_id")
        if not job_id:
            raise OcrError("ocr_unavailable", "Bill reading is not available right now.")
        return job_id

    def _wait(self, client: httpx.Client, job_id: str) -> None:
        waited = 0.0
        while True:
            response = client.get(f"{self.base_url}/job/{job_id}/status", headers=self._headers())
            response.raise_for_status()
            state = str(response.json().get("status", "")).lower()
            if state in READABLE_STATES:
                return
            if state in TERMINAL_STATES:
                raise OcrError("unreadable", "That image could not be read.")
            if waited >= self.max_wait:
                raise OcrError("ocr_unavailable", "Reading the bill took too long. Try again.")
            self._sleep(self.poll_interval)
            waited += self.poll_interval

    def _download(self, client: httpx.Client, job_id: str) -> str:
        response = client.get(f"{self.base_url}/job/{job_id}/download-url", headers=self._headers())
        response.raise_for_status()
        url = response.json().get("url")
        if not url:
            raise OcrError("ocr_unavailable", "Bill reading is not available right now.")
        archive = client.get(url)  # a plain GET; the link needs no API key
        archive.raise_for_status()
        try:
            with zipfile.ZipFile(io.BytesIO(archive.content)) as bundle:
                pages = sorted(n for n in bundle.namelist() if n.lower().endswith(".md"))
                text = "\n\n".join(bundle.read(n).decode("utf-8", errors="replace") for n in pages)
        except zipfile.BadZipFile as exc:
            raise OcrError("ocr_unavailable", "Bill reading is not available right now.") from exc
        if not text.strip():
            raise OcrError("unreadable", "No text was found in that image.")
        return text
