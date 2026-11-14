"""
Bill extraction (PROJECT_SPEC.md §5b Bill Split, step 1).

OCR text in, a validated ParsedBill out. The LLM only copies what is printed on the bill
into the BillExtraction shape; it never touches the database. Code then cleans the result
and decides whether there is enough to open a draft. Nothing is adjusted to make a bill
balance: a bill that does not add up is saved as it was read and blocked on the review screen.
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ValidationError

from app.llm.client import SarvamLLMClient, _extract_json_from_response
from app.services.bill_planner import MAX_ITEM_NAME_LENGTH, clean_label
from app.services.bill_split import MAX_ITEMS
from app.services.date_utils import get_current_ist_datetime

logger = logging.getLogger(__name__)

PROMPT_FILE_PATH = Path(__file__).resolve().parent.parent / "llm" / "bill_extract_prompt.md"
MAX_OCR_CHARS = 12000
EXTRACT_MAX_TOKENS = 4096  # 40 items of JSON do not fit in the client's default budget


class BillExtractError(Exception):
    """No usable bill could be read from the text. `code` is always `unreadable`."""

    code = "unreadable"


class ExtractedItem(BaseModel):
    name: str
    quantity: float = 1
    amount: float
    confidence: Literal["high", "low"] = "high"


class BillExtraction(BaseModel):
    """
    The contract for the extraction call. `confidence`, `requires_confirmation` and
    `missing_fields` have no defaults (CLAUDE.md rule 4): output without them is rejected.
    """
    merchant: Optional[str] = None
    bill_date: Optional[str] = None
    items: List[ExtractedItem]
    tax: float = 0
    service_charge: float = 0
    discount: float = 0
    total: Optional[float] = None
    confidence: Literal["high", "low"]
    requires_confirmation: bool
    missing_fields: List[str]


@dataclass
class ParsedBill:
    merchant: Optional[str]
    bill_date: date
    items: List[Dict[str, Any]]  # name, quantity, amount, needs_check
    tax: Decimal
    service_charge: Decimal
    discount: Decimal
    total: Decimal
    confidence: str = "high"
    missing_fields: List[str] = field(default_factory=list)


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _bill_date(raw: Optional[str], today: date) -> date:
    """The printed date when it is a real, non-future date; otherwise today."""
    try:
        parsed = date.fromisoformat((raw or "").strip())
    except ValueError:
        return today
    return parsed if parsed <= today else today


def to_parsed_bill(extraction: BillExtraction, today: Optional[date] = None) -> ParsedBill:
    """Deterministic clean-up of a validated extraction. Raises BillExtractError when unusable."""
    today = today or get_current_ist_datetime().date()
    items: List[Dict[str, Any]] = []
    for raw in extraction.items:
        name = clean_label(raw.name, MAX_ITEM_NAME_LENGTH)
        amount = _money(raw.amount)
        quantity = _money(raw.quantity)
        if not name or amount <= 0:
            continue
        items.append({
            "name": name,
            "quantity": quantity if quantity > 0 else Decimal("1"),
            "amount": amount,
            "needs_check": raw.confidence == "low",
        })
    if not items:
        raise BillExtractError("No items could be read from that bill.")
    if len(items) > MAX_ITEMS:
        raise BillExtractError(f"That bill has more than {MAX_ITEMS} items.")

    total = _money(extraction.total) if extraction.total is not None else Decimal("0")
    if total <= 0:
        raise BillExtractError("The bill total could not be read.")

    return ParsedBill(
        merchant=clean_label(extraction.merchant, MAX_ITEM_NAME_LENGTH) or None,
        bill_date=_bill_date(extraction.bill_date, today),
        items=items,
        tax=max(_money(extraction.tax), Decimal("0")),
        service_charge=max(_money(extraction.service_charge), Decimal("0")),
        discount=abs(_money(extraction.discount)),
        total=total,
        confidence=extraction.confidence,
        missing_fields=list(extraction.missing_fields),
    )


def parse_extraction(raw_output: str) -> BillExtraction:
    return BillExtraction.model_validate(json.loads(_extract_json_from_response(raw_output)))


class BillExtractor:
    def __init__(self, llm_client: Optional[SarvamLLMClient] = None):
        self.llm_client = llm_client or SarvamLLMClient()
        self.prompt = PROMPT_FILE_PATH.read_text(encoding="utf-8")

    def extract(self, ocr_text: str) -> ParsedBill:
        """One LLM call, one retry with the validation error, then BillExtractError."""
        text = (ocr_text or "").strip()[:MAX_OCR_CHARS]
        if not text:
            raise BillExtractError("No text was found in that image.")
        messages = [
            {"role": "system", "content": self.prompt},
            {"role": "user", "content": text},
        ]
        raw_output = self.llm_client._make_request(messages, max_tokens=EXTRACT_MAX_TOKENS)
        try:
            return to_parsed_bill(parse_extraction(raw_output))
        except (json.JSONDecodeError, ValidationError, ValueError) as err:
            first_error = str(err)
            logger.warning("Bill extraction output failed validation: %s", first_error)

        retry_messages = messages + [
            {"role": "assistant", "content": raw_output or ""},
            {
                "role": "user",
                "content": (
                    f"Your previous response failed validation with error: {first_error}. "
                    "Fix the JSON so it strictly follows the schema. Output only the JSON object."
                ),
            },
        ]
        retry_output = self.llm_client._make_request(retry_messages, max_tokens=EXTRACT_MAX_TOKENS)
        try:
            return to_parsed_bill(parse_extraction(retry_output))
        except (json.JSONDecodeError, ValidationError, ValueError) as err:
            logger.error("Bill extraction retry also failed validation: %s", err)
            raise BillExtractError("That bill could not be read.") from err
