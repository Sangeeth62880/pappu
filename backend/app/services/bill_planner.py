"""
Bill split planner (PROJECT_SPEC.md §5b Bill Split).

The LLM's whole job here is to say which people each bill item belongs to. It returns the
SplitPlan object below and nothing else: it never does arithmetic and never touches the
database. Everything after the LLM call (validation, merging into the bill's current
assignments, deciding what is still missing) is deterministic code in this module.
"""

import json
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Literal, Optional, Sequence, Union

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.llm.client import SarvamLLMClient, _extract_json_from_response
from app.services.bill_split import MAX_PEOPLE, ME

logger = logging.getLogger(__name__)

PROMPT_FILE_PATH = Path(__file__).resolve().parent.parent / "llm" / "split_prompt.md"
MAX_NAME_LENGTH = 40
MAX_ITEM_NAME_LENGTH = 60
ALL = "all"

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]+")


class SplitPlanError(ValueError):
    """The planner could not produce a usable plan, even after the retry."""


class Assignment(BaseModel):
    item: int = Field(ge=1)
    people: Union[Literal["all"], List[str]]
    confidence: Literal["high", "low"] = "high"

    @field_validator("people")
    @classmethod
    def _people_not_empty(cls, value):
        if isinstance(value, list) and not [p for p in value if isinstance(p, str) and p.strip()]:
            raise ValueError("people must name at least one person or be \"all\"")
        return value


class SplitPlan(BaseModel):
    """
    The contract between the split planner and the code that applies it. `confidence`,
    `requires_confirmation` and `missing_fields` have no defaults on purpose (CLAUDE.md rule 4):
    output that leaves any of them out is rejected.
    """
    language: Literal["en", "ml", "mixed"] = "en"
    assignments: List[Assignment]
    people: List[str] = Field(default_factory=list)
    confidence: Literal["high", "low"]
    requires_confirmation: bool
    missing_fields: List[str]


@dataclass(frozen=True)
class PlannerItem:
    """One bill item as the planner sees it."""
    position: int
    name: str
    quantity: str = "1"
    assigned_to: Optional[Sequence[str]] = None


@dataclass
class MergeResult:
    assignments: Dict[int, List[str]]          # every item position -> people ("me" or names); [] = nobody
    people: List[str]                          # friends at the table, first mention first
    missing_fields: List[str] = field(default_factory=list)  # "item:<position>" for each unassigned item
    changed: List[int] = field(default_factory=list)         # positions this plan assigned
    low_confidence: List[int] = field(default_factory=list)  # positions left alone because the plan was unsure


def clean_label(text: Optional[str], limit: int) -> str:
    """Normalizes text that came from OCR or the LLM: NFC, no control characters, bounded length."""
    if not text:
        return ""
    cleaned = _CONTROL_CHARS.sub(" ", unicodedata.normalize("NFC", str(text)))
    return " ".join(cleaned.split())[:limit].strip()


def _is_me(name: str) -> bool:
    return name.casefold() == ME


def _name_key(name: str) -> str:
    return name.casefold()


def render_context(items: Sequence[PlannerItem], people: Sequence[str], asked_about: Optional[int]) -> str:
    context = {
        "items": [
            {
                "item": i.position,
                "name": clean_label(i.name, MAX_ITEM_NAME_LENGTH),
                "quantity": i.quantity,
                "assigned_to": list(i.assigned_to) if i.assigned_to else None,
            }
            for i in items
        ],
        "people": list(people),
        "asked_about": asked_about,
    }
    return json.dumps(context, indent=2, ensure_ascii=False)


def parse_plan(raw_output: str, valid_positions: Sequence[int]) -> SplitPlan:
    """Validates raw LLM output. Raises ValueError (or a subclass) when it is not a usable plan."""
    data = json.loads(_extract_json_from_response(raw_output))
    plan = SplitPlan.model_validate(data)
    unknown = sorted({a.item for a in plan.assignments} - set(valid_positions))
    if unknown:
        raise ValueError(f"assignments refer to item numbers that are not on the bill: {unknown}")
    return plan


class SplitPlanner:
    def __init__(self, llm_client: Optional[SarvamLLMClient] = None):
        self.llm_client = llm_client or SarvamLLMClient()
        self.prompt_template = PROMPT_FILE_PATH.read_text(encoding="utf-8")

    def plan(
        self,
        text: str,
        items: Sequence[PlannerItem],
        people: Sequence[str] = (),
        asked_about: Optional[int] = None,
    ) -> SplitPlan:
        """One LLM call, one retry with the validation error, then SplitPlanError."""
        system_prompt = self.prompt_template.replace("{context}", render_context(items, people, asked_about))
        positions = [i.position for i in items]
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ]

        raw_output = self.llm_client._make_request(messages)
        try:
            return parse_plan(raw_output, positions)
        except (json.JSONDecodeError, ValidationError, ValueError) as err:
            first_error = str(err)
            logger.warning("Split planner output failed validation: %s", first_error)

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
        retry_output = self.llm_client._make_request(retry_messages)
        try:
            return parse_plan(retry_output, positions)
        except (json.JSONDecodeError, ValidationError, ValueError) as err:
            logger.error("Split planner retry also failed validation: %s", err)
            raise SplitPlanError("The split planner did not return a usable plan.") from err


def merge_plan(
    items: Sequence[PlannerItem],
    known_people: Sequence[str],
    plan: SplitPlan,
) -> MergeResult:
    """
    Applies a validated plan on top of the bill's current assignments.

    - Names are cleaned and de-duplicated case-insensitively; an already known spelling wins.
    - "all" becomes the user plus every friend known after this plan. With no friends known
      yet, "all" cannot be expanded, so the item stays unassigned.
    - A low confidence assignment is not applied: the item keeps whatever it had.
    - missing_fields is recomputed here from the merged result, never taken from the LLM.
    """
    people: List[str] = []
    spelling: Dict[str, str] = {}

    def remember(raw: str) -> Optional[str]:
        name = clean_label(raw, MAX_NAME_LENGTH)
        if not name:
            return None
        if _is_me(name):
            return ME
        key = _name_key(name)
        if key not in spelling:
            spelling[key] = name
            people.append(name)
        return spelling[key]

    for name in known_people:
        remember(name)
    for item in items:
        for name in item.assigned_to or ():
            remember(name)
    for name in plan.people:
        remember(name)
    for assignment in plan.assignments:
        if isinstance(assignment.people, list):
            for name in assignment.people:
                remember(name)

    if len(people) > MAX_PEOPLE:
        raise SplitPlanError(f"A bill can be split with at most {MAX_PEOPLE} people.")

    assignments: Dict[int, List[str]] = {}
    for item in items:
        current = [n for n in (remember(p) for p in (item.assigned_to or ())) if n]
        assignments[item.position] = list(dict.fromkeys(current))

    changed: List[int] = []
    low_confidence: List[int] = []
    for assignment in plan.assignments:
        if assignment.confidence == "low":
            low_confidence.append(assignment.item)
            continue
        if assignment.people == ALL:
            if not people:
                continue
            resolved = [ME] + people
        else:
            resolved = [n for n in (remember(p) for p in assignment.people) if n]
        resolved = list(dict.fromkeys(resolved))
        if not resolved:
            continue
        assignments[assignment.item] = resolved
        changed.append(assignment.item)

    missing = [f"item:{pos}" for pos in sorted(assignments) if not assignments[pos]]
    return MergeResult(
        assignments=assignments,
        people=people,
        missing_fields=missing,
        changed=sorted(set(changed)),
        low_confidence=sorted(set(low_confidence) - set(changed)),
    )
